import {
  Component,
  createElement,
  createRef,
  ForwardedRef,
  forwardRef,
  ForwardRefExoticComponent,
  FunctionComponent,
  memo,
  RefAttributes,
  RefObject,
  useState,
} from "react";

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type Listener<T, A = void> = (e: T, a: A) => void;

export type Refs<T extends Record<string, any> = {}, F = any> = {
  [key in keyof T]?: T[key];
} & { [key in `${keyof T & string}Ref`]: RefObject<any> } & {
  forwardedRef: ForwardedRef<F>;
};

export type Signal<T = any> = {
  readonly loading: boolean;
  readonly error: any;
  readonly promise: Promise<T> | undefined;
  on(listener: Listener<T>): VoidFunction;
  on(type: "error", listener: Listener<void>): VoidFunction;
  on(type: "loading", listener: Listener<void>): VoidFunction;
  get(): T;
  reset(): void;
  abort(): void;
  readonly state: T;
};

export type UpdatableSignal<T = any> = Signal<T> & {
  state: T;
  set(
    value: ((prev: T, context: Context) => T | Promise<T>) | T | Promise<T>
  ): void;
};

export type Context = { signal: any; abort(): void };

export type EmittableSignal<T = any, A = any> = Signal<T> & {
  emit(action: A): void;
  on(type: "emit", listener: Listener<T, A>): VoidFunction;
};

export type CreateSignal = {
  <T>(
    initialState: Promise<T> | T | ((context: Context) => T)
  ): UpdatableSignal<T>;
  <T, A>(
    initialState: T,
    reducer: (state: T, action: A, context: Context) => T | Promise<T>
  ): EmittableSignal<T, A>;
};

export type Wait = {
  <S>(signals: S): {
    [key in keyof S]: S[key] extends Signal<infer T> ? T : never;
  };
};

let currentWatcher: { watch(subscribe: Function): void } | undefined;

const createCallbackGroup = () => {
  const callbacks = new Set<Function>();
  return {
    add(callback: Function) {
      callbacks.add(callback);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        callbacks.delete(callback);
      };
    },
    call(...args: any[]) {
      // optimize performance
      if (args.length > 2) {
        callbacks.forEach((callback) => callback(...args));
      } else if (args.length === 2) {
        callbacks.forEach((callback) => callback(args[0], args[1]));
      } else if (args.length === 1) {
        callbacks.forEach((callback) => callback(args[0]));
      } else {
        callbacks.forEach((callback) => callback());
      }
    },
  };
};

const isPromiseLike = <T>(value: any): value is Promise<T> => {
  return value && typeof value.then === "function";
};

const isAbortControllerSupported = typeof AbortController !== "undefined";

const createContext = (): Context => {
  let ac: AbortController | undefined;
  return {
    get signal() {
      if (isAbortControllerSupported && !ac) {
        ac = new AbortController();
      }
      return ac?.signal;
    },
    abort() {
      ac?.abort();
    },
  };
};

const createSignal: CreateSignal = (
  initialState: unknown,
  reducer?: Function
): any => {
  const allListeners = {
    emit: createCallbackGroup(),
    state: createCallbackGroup(),
    status: createCallbackGroup(),
  };

  let state = initialState;
  let error: any;
  let loading = false;
  let changeToken = {};
  let lastContext: Context | undefined;

  const on = (...args: any[]) => {
    let type: string | undefined;
    let listener: Listener<any>;
    let listeners: ReturnType<typeof createCallbackGroup>;

    if (typeof args[0] === "string") {
      type = args[0];
      if (type === "error" || type === "loading") {
        type = "status";
      }
      listener = args[1];
      listeners = (allListeners as any)[args[0]];
      if (!listeners) throw new Error("Invalid event type");
    } else {
      listener = args[0];
      listeners = allListeners.state;
    }

    if (!type) {
      listener(state);
    }
    return listeners.add(listener);
  };

  const handleTracking = (subscribe: Function) => {
    if (currentWatcher) {
      currentWatcher.watch(subscribe);
    }
  };

  const abort = () => {
    lastContext?.abort();
    lastContext = undefined;
    signal.promise = undefined;
  };

  const changeStatus = (
    nextLoading: boolean,
    nextError: any,
    nextState: any
  ) => {
    let statusChanged = false;
    let stateChanged = false;
    if (nextLoading !== loading || nextError !== error) {
      loading = nextLoading;
      error = nextError;
      statusChanged = true;
    }
    if (nextState !== state) {
      state = nextState;
      stateChanged = true;
    }
    if (statusChanged) {
      allListeners.status.call(error);
    }

    // should notify state listeners if status is changed
    if (stateChanged || statusChanged) {
      changeToken = {};
      allListeners.state.call(state);
    }
  };
  const get = () => {
    if (currentWatcher) {
      if (loading) {
        throw signal.promise;
      }
      if (error) {
        throw error;
      }
    }
    handleTracking(allListeners.state.add);
    return state;
  };
  const set = (nextState: (() => any) | any) => {
    if (typeof nextState === "function") {
      lastContext = createContext();
      nextState = nextState(state, lastContext);
    }
    if (state === nextState) return;
    if (isPromiseLike(nextState)) {
      let token: any;

      signal.promise = nextState
        .then((value) => {
          if (changeToken !== token) return;
          signal.promise = undefined;
          changeStatus(false, undefined, value);
        })
        .catch((error) => {
          if (changeToken !== token) return;
          signal.promise = undefined;
          changeStatus(false, error, state);
        });

      // should change status after lastPromise ready
      changeStatus(true, undefined, state);
      token = changeToken;

      return;
    }
    signal.promise = undefined;
    changeStatus(false, undefined, nextState);
  };

  const signal = {
    promise: undefined as Promise<any> | undefined,
    get error() {
      handleTracking(allListeners.status.add);
      return error;
    },
    get loading() {
      handleTracking(allListeners.status.add);
      return loading;
    },
    get,
    on,
    abort,
  };

  // computed signal
  if (typeof state === "function") {
    // is normal signal, it has state getter/setter
    Object.defineProperty(signal, "state", { get, set });

    const computeState = state;
    state = undefined;
    const unsubscribes = new Map();
    const invalidateState = () => {
      try {
        startWatching(
          () => {
            lastContext = createContext();
            set(computeState(lastContext));
          },
          unsubscribes,
          invalidateState
        );
      } catch (ex) {
        if (isPromiseLike(ex)) {
          changeStatus(true, undefined, state);
          ex.finally(invalidateState);
          return;
        }
        changeStatus(false, ex, state);
      }
    };

    Object.assign(signal, {
      set,
      reset() {
        state = undefined;
        invalidateState();
      },
    });

    invalidateState();
  } else {
    // emittable signal
    if (reducer) {
      // is emittable signal, it has only state getter, and emit method
      Object.defineProperty(signal, "state", { get });
      Object.assign(signal, {
        emit(action: any) {
          allListeners.emit.call(state, action);
          lastContext = createContext();

          try {
            startWatching(() => {
              set(reducer(state, action, lastContext));
            });
          } catch (ex) {
            // run reducer again dependency signals are in progress
            if (isPromiseLike(ex)) {
              let token: any;
              signal.promise = ex.then(
                () => {
                  if (token !== changeToken) return;
                  set(reducer(state, action, lastContext));
                },
                (reason) => {
                  if (token !== changeToken) return;
                  changeStatus(false, reason, state);
                }
              );
              changeStatus(true, undefined, state);
              token = changeToken;
              return;
            }
            changeStatus(false, ex, state);
          }
        },
        reset() {
          set(initialState);
        },
      });
    } else {
      // is normal signal, it has state getter/setter
      Object.defineProperty(signal, "state", { get, set });
      Object.assign(signal, {
        set,
        reset() {
          set(initialState);
        },
      });

      if (isPromiseLike(state)) {
        const asyncState = state;
        state = undefined;
        set(asyncState);
      }
    }
  }

  return signal;
};

const startWatching = (
  inner: VoidFunction,
  unsubscribes?: Map<any, Function>,
  onUpdate?: VoidFunction,
  onDone?: VoidFunction
) => {
  const prevWatcher = currentWatcher;
  const inactiveSignals = new Set(unsubscribes?.keys());
  currentWatcher = {
    watch(channel) {
      inactiveSignals.delete(channel);
      if (onUpdate && !unsubscribes?.has(channel)) {
        unsubscribes?.set(channel, channel(onUpdate));
      }
    },
  };
  try {
    return inner();
  } finally {
    currentWatcher = prevWatcher;
    inactiveSignals.forEach((x) => unsubscribes?.delete(x));
    onDone?.();
  }
};

const createStableFunction = (getCurrent: () => Function, proxy: any) => {
  return Object.assign(
    (...args: any[]) => {
      const current = getCurrent();
      return current.apply(proxy, args);
    },
    { stableMeta: { proxy, getCurrent } }
  );
};

const createStableComponent = <P extends Record<string, any>, R extends Refs>(
  component: (props: P, refs: R) => any | FunctionComponent<P>
): ForwardRefExoticComponent<
  P & RefAttributes<R extends Refs<infer _R, infer F> ? F | undefined : any>
> => {
  type PropsWithRef = P & {
    forwardedRef: ForwardedRef<R extends Refs<any, infer F> ? F : any>;
  };

  // wrap render function to functional component to get advantages of hooks
  const Inner = memo((props: { __render: (forceUpdate: Function) => any }) => {
    const forceUpdate = useState()[1];
    return props.__render(forceUpdate);
  });

  class Wrapper extends Component<PropsWithRef> {
    private _propsProxy: P;
    private _unmount: VoidFunction;

    constructor(props: PropsWithRef) {
      super(props);
      const me = this;
      const unsubscribes = new Map<any, Function>();
      const refCache = new Map<any, RefObject<any>>();
      const propCache = new Map<any, any>();

      let render: (forceUpdate: Function) => any;

      this._propsProxy = new Proxy(
        {},
        {
          get(_, p: string) {
            if (p === "__render") return render;
            const currentValue = me.props[p];
            if (typeof p === "string" && p.startsWith("__"))
              return currentValue;
            if (typeof currentValue === "function") {
              let cachedValue = propCache.get(p);
              if (typeof cachedValue !== "function") {
                cachedValue = createStableFunction(
                  () => me.props[p],
                  me._propsProxy
                );
                propCache.set(p, cachedValue);
              }
              return cachedValue;
            }
            return currentValue;
          },
          getOwnPropertyDescriptor() {
            return { enumerable: true, configurable: true };
          },
          ownKeys() {
            return Object.keys(me.props).concat("__render");
          },
        }
      ) as P;

      const refsProxy = new Proxy(
        {},
        {
          get(_, p) {
            if (typeof p === "string") {
              if (p.endsWith("Ref")) {
                let ref = refCache.get(p);
                if (!ref) {
                  ref = createRef();
                  refCache.set(p, ref);
                }
                return ref;
              }
              const ref = refCache.get(p + "Ref");
              return ref?.current;
            }
          },
        }
      );

      const result = component(this._propsProxy as P, refsProxy as R);

      let forceChildUpdate: Function;

      const rerender = () => forceChildUpdate({});

      /**
       * update forwardedRef
       */
      const updateForwardedRef = () => {
        if (this.props.forwardedRef) {
          if (typeof this.props.forwardedRef === "function") {
            this.props.forwardedRef((refsProxy as any).forwardRef.current);
          } else {
            this.props.forwardedRef.current = (
              refsProxy as any
            ).forwardRef.current;
          }
        }
      };

      render = (forceUpdate) => {
        // the forceUpdate function comes from inner component.
        // We use it to force inner component update whenever signal changed
        forceChildUpdate = forceUpdate;
        if (typeof result === "function") {
          return startWatching(
            result,
            unsubscribes,
            rerender,
            updateForwardedRef
          );
        }

        updateForwardedRef();
        return result;
      };

      this._unmount = () => {
        unsubscribes.forEach((x) => x());
        unsubscribes.clear();
      };
    }

    render() {
      return createElement(Inner, this._propsProxy as any);
    }
    componentWillUnmount() {
      this._unmount();
    }
  }

  Object.assign(Wrapper, {
    displayName: (component as any).displayName || component.name,
    propTypes: (component as any).propTypes,
  });

  return memo(
    forwardRef((props, forwardedRef) =>
      createElement(Wrapper, { ...props, forwardedRef } as any)
    )
  ) as any;
};

export const isSignal = <T>(value: any): value is Signal<T> => {
  return (
    value &&
    typeof value === "object" &&
    typeof value.on === "function" &&
    typeof value.get === "function"
  );
};

/**
 * if `signals` is an array, wait() works like Promise.all() unless it works like Promise.race()
 * @param signals
 * @param autoAbort
 * @returns
 */
export const wait: Wait = (signals, autoAbort?: boolean) => {
  return startWatching(() => {
    const promises: Promise<any>[] = [];
    const pending: Signal[] = [];

    // wait(signals[])
    if (Array.isArray(signals)) {
      const results: any[] = [];
      signals.forEach((signal: Signal, index) => {
        if (signal.error) {
          throw signal.error;
        }

        if (signal.promise) {
          promises.push(signal.promise);
          pending.push(signal);
        } else {
          results[index] = signal.state;
        }
      });
      if (promises.length)
        throw Promise.all(promises).finally(
          () => autoAbort && pending.forEach((signal) => signal.abort())
        );
      return results;
    }
    const results: Record<string, any> = {};
    let hasResult = false;
    Object.entries(signals).some(([key, signal]: [string, Signal]) => {
      if (signal.error) {
        throw signal.error;
      }

      if (signal.promise) {
        promises.push(signal.promise);
        pending.push(signal);
        return false;
      }
      results[key] = signal.state;
      hasResult = true;
      return true;
    });
    if (!hasResult && promises.length)
      throw Promise.race(promises).finally(
        () => autoAbort && pending.forEach((signal) => signal.abort())
      );
    return results;
  }) as any;
};

export { createSignal as signal, createStableComponent as stable };

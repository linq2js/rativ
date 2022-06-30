import {
  Component,
  createElement,
  createRef,
  FC,
  ForwardedRef,
  forwardRef,
  ForwardRefExoticComponent,
  FunctionComponent,
  memo,
  RefAttributes,
  RefObject,
  useRef,
  useState,
} from "react";
import { mutate as mutateGlobal, Mutation } from "./mutation";

export { Mutation };

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type Listener<T, A = void> = (e: T, a: A) => void;

export type Nullable<T> = T | undefined | null;

export type Refs<T extends Record<string, any> = {}, F = any> = {
  [key in keyof T]?: T[key];
} & { [key in `${keyof T & string}Ref`]: RefObject<any> } & {
  forwardedRef: ForwardedRef<F>;
};

export type Signal<T = any> = {
  readonly loading: boolean;
  readonly error: any;
  readonly task: Promise<T> | undefined;
  on(listener: Listener<T>): VoidFunction;
  on(type: "error", listener: Listener<void>): VoidFunction;
  on(type: "loading", listener: Listener<void>): VoidFunction;
  get(): T;
  reset(): void;
  abort(): void;
  snapshot(reset?: boolean): VoidFunction;
  readonly state: T;
};

export type UpdatableSignal<T = any> = Signal<T> & {
  state: T;
  set(
    value: ((prev: T, context: Context) => T | Promise<T>) | T | Promise<T>
  ): void;
  mutate(...mutation: Mutation<T>[]): UpdatableSignal<T>;
};

export type Context = {
  readonly signal: AbortController["signal"] | undefined;
  readonly aborted: boolean;
  abort(): void;
};

export type EmittableSignal<T = any, A = void> = Signal<T> & {
  emit(action: A): EmittableSignal<T, A>;
  on(type: "emit", listener: Listener<T, A>): VoidFunction;
};

export type SignalOptions = {
  load?: () => { data: any } | undefined;
  save?: (data: any) => void;
  onChange?: VoidFunction;
  onError?: (error: any) => void;
  onLoading?: VoidFunction;
};

export type EmittableOptions<A = any> = SignalOptions & {
  initAction?: A;
  onEmit?: (action: A) => void;
};

export type ComputedSignal<T> = UpdatableSignal<T>;

export type CreateSignal = {
  <T>(
    computeFn: (context: Context) => T,
    options?: SignalOptions
  ): ComputedSignal<T>;

  <T>(
    initialState: Promise<T> | T,
    options?: SignalOptions
  ): UpdatableSignal<T>;

  <T, A = void>(
    initialState: T,
    reducer: (state: NoInfer<T>, action: A, context: Context) => T,
    options?: EmittableOptions<A>
  ): EmittableSignal<T, A>;
};

export type Wait = {
  <T>(singal: Signal<T>): T;
  <S>(awaitables: S): {
    [key in keyof S]: S[key] extends Signal<infer T>
      ? T
      : S[key] extends () => infer T
      ? T
      : never;
  };
};

export type CreateSlot = {
  (signal: Signal): FC;
  (computeFn: () => any): FC;
};

export type CallbackGroup = {
  add(callback: Function): VoidFunction;
  call(...args: any[]): void;
  clear(): void;
};

const createCallbackGroup = (): CallbackGroup => {
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
    clear() {
      callbacks.clear();
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

const createContext = (): InternalContext => {
  let ac: AbortController | undefined;
  let aborted = false;
  return {
    taskIndex: 0,
    taskList: [],
    get aborted() {
      return aborted;
    },
    get signal() {
      if (isAbortControllerSupported && !ac) {
        ac = new AbortController();
      }
      return ac?.signal;
    },
    abort() {
      if (aborted) return;
      aborted = true;
      ac?.abort();
    },
  };
};

export type InternalContext = Context & {
  taskIndex: number;
  taskList: Function[];
};

export type Directive<E> = (ref: E) => void | VoidFunction;

export type EffectContext<R> = { refs: Refs<R> };

export type Effect<R = any> = (
  context: EffectContext<R>
) => void | VoidFunction;

export type Scope = {
  type?:
    | "emittable"
    | "computed"
    | "task"
    | "component"
    | "updatable"
    /**
     * initializing phase of stable component
     */
    | "stable";
  addDependency?: (subscribeChannel: Function) => void;
  addSignal?: (disposeSignal: VoidFunction) => void;
  addEffect?: (effect: Effect) => void;
  context?: InternalContext;
  onDone?: VoidFunction;
};

export type Task<T, A extends any[]> = (...args: A) => T & {
  readonly aborted: boolean;
  abort(): void;
  runner(...args: A): () => T;
};

export type Watch = {
  <T>(changeSelector: () => T, callback: (value: T) => void): VoidFunction;
  <T>(changeSelector: () => T, options: WatchOptions<T>): VoidFunction;
};

export type WatchOptions<T> = {
  defer?: boolean;
  callback?: (value: T) => any;
  compare?: (a: T, b: T) => boolean;
};

let currentScope: Scope | undefined;

const scopeOfWork = (fn: (scope: Scope) => any, scope?: Scope): any => {
  const prevScope = currentScope;
  try {
    currentScope = { ...currentScope, ...scope };
    return fn(currentScope);
  } finally {
    currentScope = prevScope;
    scope?.onDone?.();
  }
};

const createSignal: CreateSignal = (...args: any[]): any => {
  const allListeners = {
    emit: createCallbackGroup(),
    state: createCallbackGroup(),
    status: createCallbackGroup(),
  };
  let initialState: unknown;
  let reducer: Function | undefined;
  let options: EmittableOptions;
  let loadedState: any;

  // signal(initialState, reducer, options)
  if (typeof args[1] === "function") {
    [initialState, reducer, options] = args;
  } else {
    [initialState, options] = args;
  }

  const { load, save, onChange, onEmit, onError, onLoading } = options ?? {};

  const createStorage = () => {
    let state = initialState;
    let error: any;
    let loading = false;
    let changeToken = {};
    let lastContext: Context | undefined;
    let active = true;
    const dependencies = new Map<any, Function>();

    return {
      state,
      error,
      loading,
      changeToken,
      lastContext,
      active,
      dependencies,
    };
  };

  const onInit = createCallbackGroup();
  let storage = createStorage();

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
      listener(storage.state);
    }
    return listeners.add(listener);
  };

  const handleDependency = (channel: Function) => {
    if (!storage.active) return;
    if (currentScope?.addDependency) {
      currentScope.addDependency(channel);
    }
  };

  const abort = () => {
    storage.lastContext?.abort();
    storage.lastContext = undefined;
    signal.task = undefined;
  };

  const changeStatus = (
    nextLoading: boolean,
    nextError: any,
    nextState: any
  ) => {
    let statusChanged = false;
    let stateChanged = false;

    if (nextLoading !== storage.loading || nextError !== storage.error) {
      storage.loading = nextLoading;
      storage.error = nextError;
      statusChanged = true;
    }

    if (nextState !== storage.state) {
      storage.state = nextState;
      stateChanged = true;
    }

    if (statusChanged) {
      allListeners.status.call(storage.error);
    }

    // should notify state listeners if status is changed
    if (stateChanged || statusChanged) {
      storage.changeToken = {};
      allListeners.state.call(storage.state);
    }
    if (stateChanged) {
      save?.(storage.state);
    }
  };

  const get = () => {
    const scopeType = currentScope?.type;
    if (
      scopeType === "component" ||
      scopeType === "emittable" ||
      scopeType === "computed"
    ) {
      if (storage.loading) {
        throw signal.task;
      }
      if (storage.error) {
        throw storage.error;
      }
    }
    handleDependency(allListeners.state.add);
    return storage.state;
  };

  const set = (nextState: (() => any) | any) => {
    if (typeof nextState === "function") {
      storage.lastContext = createContext();
      nextState = scopeOfWork(
        () => nextState(storage.state, storage.lastContext),
        {
          type: "updatable",
          // disable context
          context: undefined,
          // disable dependency tracking
          addDependency: undefined,
        }
      );
    }
    if (storage.state === nextState) return;
    if (isPromiseLike(nextState)) {
      let token: any;

      signal.task = nextState
        .then((value) => {
          if (storage.changeToken !== token) return;
          signal.task = undefined;
          changeStatus(false, undefined, value);
        })
        .catch((error) => {
          if (storage.changeToken !== token) return;
          signal.task = undefined;
          changeStatus(false, error, storage.state);
        });

      // should change status after lastPromise ready
      changeStatus(true, undefined, storage.state);
      token = storage.changeToken;

      return;
    }
    signal.task = undefined;
    changeStatus(false, undefined, nextState);
  };

  const mutate = (...mutations: Mutation<any>[]) => {
    set(mutateGlobal(storage.state, ...mutations));
    return signal;
  };

  const signal = {
    task: undefined as Promise<any> | undefined,
    get error() {
      handleDependency(allListeners.status.add);
      return storage.error;
    },
    get loading() {
      handleDependency(allListeners.status.add);
      return storage.loading;
    },
    get,
    on,
    abort,
    toJSON() {
      return storage.state;
    },
    snapshot(reset: boolean) {
      let prevStorage = storage;

      if (reset) {
        storage = createStorage();
        // start initializing phase again
        onInit.call();
      } else {
        const dependencies = new Map(storage.dependencies);
        storage = { ...storage, dependencies };
      }

      const savedStorage = storage;

      return () => {
        // dont unsnapshot if storage has been changed since last time
        if (savedStorage === storage) {
          storage = prevStorage;
        }
      };
    },
  };

  onInit.add(() => {
    if (currentScope?.addSignal) {
      currentScope.addSignal(() => {
        storage.active = false;
        // unsubscribe all dependencies
        storage.dependencies.forEach((x) => x());
        allListeners.emit.clear();
        allListeners.state.clear();
        allListeners.status.clear();
      });
    }

    if (load) {
      // trigger loading dehydrated data
      loadedState = load();
    }

    if (onChange) {
      allListeners.state.add(onChange);
    }

    if (onError || onLoading) {
      allListeners.state.add(() => {
        if (storage.loading) onLoading?.();
        if (storage.error) onError?.(storage.error);
      });
    }

    if (onEmit) {
      allListeners.emit.add((_: any, action: any) => onEmit(action));
    }
  });

  // computed signal
  if (typeof storage.state === "function") {
    // is normal signal, it has state getter/setter
    Object.defineProperty(signal, "state", { get, set });

    const computeState = storage.state;
    storage.state = undefined;

    const invalidateState = () => {
      const context = createContext();
      const execute = () => {
        storage.lastContext = context;
        try {
          collectDependencies(
            () => {
              context.taskIndex = 0;
              set(computeState(context));
            },
            storage.dependencies,
            // invalidate state when dependency signals are changed
            invalidateState,
            { context, type: "computed" }
          );
        } catch (ex) {
          if (isPromiseLike(ex)) {
            changeStatus(true, undefined, storage.state);
            ex.finally(execute);
            return;
          }
          changeStatus(false, ex, storage.state);
        }
      };

      execute();
    };

    Object.assign(signal, {
      set,
      mutate,
      reset() {
        storage.state = undefined;
        invalidateState();
      },
    });

    onInit.add(() => {
      if (loadedState) {
        storage.state = loadedState.data;
      } else {
        invalidateState();
      }
    });
  } else {
    // emittable signal
    if (reducer) {
      // is emittable signal, it has only state getter, and emit method
      Object.defineProperty(signal, "state", { get });
      const emittableSignal = {
        emit(action: any) {
          allListeners.emit.call(storage.state, action);
          const context = (storage.lastContext = createContext());

          const emitInternal = () => {
            try {
              scopeOfWork(
                () => {
                  context.taskIndex = 0;
                  const nextState = reducer!(storage.state, action, context);
                  set(nextState);
                },
                { type: "emittable", context }
              );
            } catch (ex) {
              // run reducer again dependency signals are in progress
              if (isPromiseLike(ex)) {
                let token: any;
                signal.task = ex.then(
                  () => {
                    if (token !== storage.changeToken) return;
                    emitInternal();
                  },
                  (reason) => {
                    if (token !== storage.changeToken) return;
                    changeStatus(false, reason, storage.state);
                  }
                );
                changeStatus(true, undefined, storage.state);
                token = storage.changeToken;
                return signal;
              }
              console.log(ex);
              changeStatus(false, ex, storage.state);
            }

            return signal;
          };

          return emitInternal();
        },
        reset() {
          set(initialState);
        },
      };
      Object.assign(signal, emittableSignal);
      if (loadedState) {
        storage.state = loadedState.data;
      }
      if (options?.initAction) {
        emittableSignal.emit(options.initAction);
      }
    } else {
      // is updatable signal, it has state getter/setter
      Object.defineProperty(signal, "state", { get, set });
      Object.assign(signal, {
        set,
        mutate,
        reset() {
          set(initialState);
        },
      });

      onInit.add(() => {
        if (loadedState) {
          storage.state = loadedState.data;
        } else if (isPromiseLike(storage.state)) {
          const asyncState = storage.state;
          storage.state = undefined;
          set(asyncState);
        }
      });
    }
  }

  onInit.call();

  return signal;
};

const collectDependencies = <T>(
  fn: () => T,
  dependencies?: Map<any, any>,
  onUpdate?: VoidFunction,
  scope?: Scope
) => {
  const inactiveDependencies = new Set(dependencies?.keys());

  return scopeOfWork(fn, {
    ...scope,
    addDependency(dependant) {
      inactiveDependencies.delete(dependant);
      if (onUpdate && !dependencies?.has(dependant)) {
        dependencies?.set(dependant, dependant(onUpdate));
      }
    },
    onDone() {
      inactiveDependencies.forEach((x) => dependencies?.delete(x));
      scope?.onDone?.();
    },
  });
};

const createStableFunction = (
  getCurrent: () => Function,
  context: any = null
) => {
  return (...args: any[]) => {
    const current = getCurrent();
    return current.apply(context, args);
  };
};

const createRefs = <R, F = any>(): Refs<R, F> => {
  const refCache = new Map<any, RefObject<any>>();
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
  return refsProxy as Refs<R, F>;
};

const createEffectContext = <R>(): EffectContext<R> => {
  let refs: Refs<R> | undefined;
  return {
    get refs() {
      if (!refs) {
        refs = createRefs<R>();
      }
      return refs;
    },
  };
};

const createPropsProxy = <P extends Record<string, any>>(
  getProps: () => P,
  getRender: () => Function
) => {
  const propCache = new Map<any, any>();
  let defaultProps: Partial<P> = {};

  return new Proxy(
    {},
    {
      get(_, p: string) {
        if (p === "__render") return getRender();
        const props = getProps();
        let currentValue = props[p];

        if (typeof currentValue === "undefined") {
          currentValue = defaultProps[p];
        }

        if (typeof p === "string" && p.startsWith("__")) return currentValue;

        if (typeof currentValue === "function") {
          let cachedValue = propCache.get(p);
          if (typeof cachedValue !== "function") {
            cachedValue = createStableFunction(() => props[p]);
            propCache.set(p, cachedValue);
          }

          return cachedValue;
        }

        return currentValue;
      },
      set(_, p, value) {
        if (p === "__defaultProps") {
          defaultProps = value;

          return true;
        }

        return false;
      },
      getOwnPropertyDescriptor() {
        return { enumerable: true, configurable: true };
      },
      ownKeys() {
        return Object.keys(getProps()).concat("__render");
      },
    }
  ) as P;
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
    const setState = useState()[1];
    // we use nextRender value to prevent calling forceUpdate multiple times
    // nextRender value will be changed only when the component is actual re-rendered
    const nextRenderRef = useRef<any>();
    const forceUpdate = useState(
      () => () => setState(nextRenderRef.current)
    )[0];
    nextRenderRef.current = {};
    return props.__render(forceUpdate);
  });

  class Wrapper extends Component<PropsWithRef> {
    private _propsProxy: P;
    private _unmount: VoidFunction;
    private _mount: VoidFunction;

    constructor(props: PropsWithRef) {
      super(props);
      const dependencies = new Map<any, Function>();

      const effects: Effect[] = [];
      const unmountEffects = createCallbackGroup();
      const refsProxy = createRefs();
      const disposeLocalSignals = createCallbackGroup();

      let render: (forceUpdate: Function) => any;

      this._mount = () => {
        effects.forEach((effect) => {
          const result = effect(createEffectContext());
          if (typeof result === "function") {
            unmountEffects.add(result);
          }
        });
      };

      this._propsProxy = createPropsProxy<P>(
        () => this.props,
        () => render
      );

      const result = scopeOfWork(
        () => component(this._propsProxy as P, refsProxy as R),
        {
          type: "stable",
          addSignal(disposeSignal) {
            disposeLocalSignals.add(disposeSignal);
          },
          addEffect(effect) {
            effects.push(effect);
          },
        }
      );

      let forceChildUpdate: Function;

      const rerender = () => {
        forceChildUpdate();
      };

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
          return collectDependencies(result, dependencies, rerender, {
            type: "component",
            onDone: updateForwardedRef,
          });
        }

        updateForwardedRef();
        return result;
      };

      this._unmount = () => {
        disposeLocalSignals.call();
        unmountEffects.call();
        dependencies.forEach((x) => x());
        dependencies.clear();
      };
    }

    componentDidMount() {
      this._mount();
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
 * @param awaitables
 * @param autoAbort
 * @returns
 */
export const wait: Wait = (awaitables, autoAbort?: boolean) => {
  if (!currentScope) {
    throw new Error("Cannot use wait() helper outside signal");
  }

  if (isSignal(awaitables)) {
    if (awaitables.task) throw awaitables.task;
    if (awaitables.error) throw awaitables.error;
    return awaitables.state;
  }

  const promises: Promise<any>[] = [];
  const pending: Signal[] = [];

  // wait(awaitables[])
  if (Array.isArray(awaitables)) {
    const results: any[] = [];
    awaitables.forEach((awaitable, index) => {
      if (isSignal(awaitable)) {
        if (awaitable.error) {
          throw awaitable.error;
        }

        if (awaitable.task) {
          promises.push(awaitable.task);
          pending.push(awaitable);
        } else {
          results[index] = awaitable.state;
        }
      }
      // is runner
      else if (typeof awaitable === "function") {
        try {
          const result = awaitable();
          results[index] = result;
        } catch (ex) {
          if (isPromiseLike(ex)) {
            promises.push(ex);
          }
          throw ex;
        }
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
  Object.entries(awaitables).some(([key, awaitable]: [string, any]) => {
    if (isSignal(awaitable)) {
      if (awaitable.error) {
        throw awaitable.error;
      }

      if (awaitable.task) {
        promises.push(awaitable.task);
        pending.push(awaitable);
        return false;
      }
      results[key] = awaitable.state;
      hasResult = true;
    }
    // is runner
    else if (typeof awaitable === "function") {
      try {
        const result = awaitable();
        results[key] = result;
        hasResult = true;
      } catch (ex) {
        if (isPromiseLike(ex)) {
          promises.push(ex);
          pending.push(awaitable);
          return false;
        }
        throw ex;
      }
    }
    return true;
  });
  if (!hasResult && promises.length)
    throw Promise.race(promises).finally(
      () => autoAbort && pending.forEach((signal) => signal.abort?.())
    );
  return results;
};

/**
 * create a task that runs once
 * @param fn
 * @param waitNone
 * @returns
 */
export const task = <T, A extends any[]>(
  fn: (...args: A) => T | Promise<T>,
  waitNone?: boolean
): Task<T, A> => {
  return scopeOfWork(
    ({ context }) => {
      if (!context) {
        throw new Error("task() helper cannot be called outside signal");
      }

      let task = context.taskList[context.taskIndex];
      if (!task) {
        let status: "idle" | "error" | "loading" | "success" = "idle";
        let data: any;
        let aborted = false;

        const abort = () => {
          if (aborted) return;
          aborted = true;
        };

        task = Object.assign(
          (...args: A): T => {
            if (status === "success") {
              return data;
            }

            if (status === "error" || status === "loading") {
              throw data;
            }

            return scopeOfWork(
              () => {
                try {
                  const result = fn(...args);
                  if (isPromiseLike(result) || isSignal(result)) {
                    throw result;
                  }
                  data = result;
                  status = "success";
                  return result;
                } catch (ex) {
                  if (isSignal(ex)) {
                    const signal = ex;
                    if (!signal.task) {
                      if (!signal.error) {
                        return signal.state;
                      }
                      ex = signal.error;
                    } else {
                      ex = new Promise((resolve, reject) => {
                        signal.task?.finally(() => {
                          if (signal.error) {
                            reject(signal.error);
                          } else {
                            resolve(signal.state);
                          }
                        });
                      });
                    }
                  }

                  if (isPromiseLike(ex)) {
                    status = "loading";
                    const promise = ex;
                    ex = new Promise((resolve, reject) => {
                      promise.then(
                        (value) => {
                          if (context.aborted || aborted) return;
                          status = "success";
                          data = value;
                          resolve(value);
                        },
                        (reason) => {
                          if (context.aborted || aborted) return;
                          status = "error";
                          data = reason;
                          reject(reason);
                        }
                      );
                    });
                  } else {
                    status = "error";
                  }

                  if (status === "loading" && waitNone) {
                    status = "success";
                    data = undefined;
                    return;
                  }
                  data = ex;
                  throw ex;
                }
              }, // disable dependent registration
              { addDependency: undefined }
            );
          },
          {
            runner(...args: A) {
              return Object.assign(() => task(...args), { abort });
            },
            abort,
          }
        );
        Object.defineProperty(task, "aborted", { get: () => aborted });
        context.taskList[context.taskIndex] = task;
        context.taskIndex++;
      }
      return task;
    },
    { type: "task" }
  );
};

export const SlotInner = memo((props: { render: () => any }) => {
  const rerender = useState<any>()[1];
  const context = useState(() => ({
    dependencies: new Map<any, Function>(),
    rerender: () => rerender({}),
  }))[0];

  return collectDependencies(
    props.render,
    context.dependencies,
    context.rerender,
    { type: "component" }
  );
});

export const SlotWrapper: FC<{ slot: any }> = (props) => {
  const slotRef = useRef(props.slot);
  const contextRef = useRef<{ token?: {}; slot?: any }>({});
  const render = useState(() =>
    createStableFunction(() =>
      typeof slotRef.current === "function"
        ? slotRef.current
        : slotRef.current.get
    )
  )[0];

  slotRef.current = props.slot;

  // change token if the slot is function, this makes SlotInner re-render to update latest result of render function
  if (
    typeof props.slot === "function" &&
    contextRef.current.slot !== props.slot
  ) {
    contextRef.current = { slot: props.slot, token: {} };
  }
  return createElement(SlotInner, { render, token: contextRef.current.token });
};

/**
 * create a slot that update automatically when input signal/computed value is changed
 * @param slot
 * @returns
 */
export const slot: CreateSlot = (slot): any => {
  return createElement(SlotWrapper, { slot });
};

/**
 * use effect
 * @param fn
 */
export const effect = (fn: Effect) => {
  if (!currentScope?.addEffect) {
    throw new Error(
      "Cannot call effect() helper outside stable part of stable component"
    );
  }
  currentScope.addEffect(fn);
};

export const defaultProps = <T>(props: T, defaultValues: Partial<T>) => {
  if (!currentScope?.addEffect) {
    throw new Error(
      "Cannot call defaultProps() helper outside stable part of stable component"
    );
  }
  (props as any).__defaultProps = defaultValues;
};

/**
 * create directive for specified object type
 * @param directives
 * @returns
 */
export const directive = <E = HTMLElement>(
  directives: Directive<E> | Directive<E>[]
): RefObject<any> => {
  const ref = createRef<E>();
  const directiveList = Array.isArray(directives) ? directives : [directives];
  effect(() => {
    directiveList.forEach((directive) => directive(ref.current as E));
  });
  return ref;
};

export const delay = <T = void>(ms: number, resolved?: T) =>
  new Promise<T>((resolve) => setTimeout(resolve, ms, resolved));

export { createSignal as signal, createStableComponent as stable };

export const watch: Watch = (watchFn, options) => {
  if (typeof options === "function") {
    options = { callback: options };
  }
  const { callback, compare } = options ?? {};
  let dependencies = new Map<any, Function>();
  let firstTime = true;
  let active = true;
  let prevValue: any;

  const startWatching = () => {
    if (!active) return;
    const value = collectDependencies(
      watchFn as unknown as () => unknown,
      dependencies,
      startWatching,
      {
        type: "task",
        addDependency: undefined,
      }
    );

    if (firstTime) {
      firstTime = false;
      prevValue = value;
      return;
    }

    if (compare && compare(prevValue, value)) return;

    prevValue = value;

    callback?.(value);
  };

  startWatching();

  return () => {
    active = false;
    dependencies.forEach((x) => x());
  };
};

export type SnapshotFn = {
  (signals: Signal[], reset?: boolean): VoidFunction;
  <T>(signals: Signal[], callback: () => T): T;
  <T>(signals: Signal[], reset: boolean, callback: () => T): T;
};

export const snapshot: SnapshotFn = (
  signals: Signal[],
  ...args: any[]
): any => {
  const revert = createCallbackGroup();
  let callback: VoidFunction | undefined;
  let reset = false;

  if (typeof args[0] === "function") {
    [callback] = args;
  } else {
    [reset, callback] = args;
  }

  signals.forEach((signal) => {
    revert.add(signal.snapshot(reset));
  });
  if (callback) {
    const result = callback();
    if (isPromiseLike(result)) {
      return result.finally(revert.call);
    }
    revert.call();
    return result;
  }
  return revert.call;
};

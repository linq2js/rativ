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
  readonly task: Promise<T> | undefined;
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

export type Context = {
  readonly signal: AbortController["signal"] | undefined;
  readonly aborted: boolean;
  abort(): void;
};

export type EmittableSignal<T = any, A = void> = Signal<T> & {
  emit(action: A): EmittableSignal<T, A>;
  on(type: "emit", listener: Listener<T, A>): VoidFunction;
};

export type EmittableOptions<A = any> = {
  initAction?: A;
};

export type CreateSignal = {
  <T>(
    initialState: Promise<T> | T | ((context: Context) => T)
  ): UpdatableSignal<T>;

  <T, A = void>(
    initialState: T,
    reducer: (state: NoInfer<T>, action: A, context: Context) => T | Promise<T>,
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

export type Scope = {
  registerDependant?: (childChannel: Function) => void;
  context?: InternalContext;
  onDone?: VoidFunction;
};

export type Task<T, A extends any[]> = (...args: A) => T & {
  readonly aborted: boolean;
  abort(): void;
  runner(...args: A): () => T;
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

const createSignal: CreateSignal = (
  initialState: unknown,
  reducer?: Function,
  options?: EmittableOptions
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
    if (currentScope?.registerDependant) {
      currentScope.registerDependant(subscribe);
    }
  };

  const abort = () => {
    lastContext?.abort();
    lastContext = undefined;
    signal.task = undefined;
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
    if (currentScope?.registerDependant || currentScope?.context) {
      if (loading) {
        throw signal.task;
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

      signal.task = nextState
        .then((value) => {
          if (changeToken !== token) return;
          signal.task = undefined;
          changeStatus(false, undefined, value);
        })
        .catch((error) => {
          if (changeToken !== token) return;
          signal.task = undefined;
          changeStatus(false, error, state);
        });

      // should change status after lastPromise ready
      changeStatus(true, undefined, state);
      token = changeToken;

      return;
    }
    signal.task = undefined;
    changeStatus(false, undefined, nextState);
  };

  const signal = {
    task: undefined as Promise<any> | undefined,
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
    const dependants = new Map();
    const invalidateState = () => {
      const context = createContext();
      const execute = () => {
        lastContext = context;
        try {
          collectDependencies(
            () => {
              context.taskIndex = 0;
              set(computeState(context));
            },
            dependants,
            // invalidate state when dependency signals are changed
            invalidateState,
            { context }
          );
        } catch (ex) {
          if (isPromiseLike(ex)) {
            changeStatus(true, undefined, state);
            ex.finally(execute);
            return;
          }
          changeStatus(false, ex, state);
        }
      };

      execute();
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
      const emittableSignal = {
        emit(action: any) {
          allListeners.emit.call(state, action);
          const context = (lastContext = createContext());

          const emitInternal = () => {
            try {
              scopeOfWork(
                () => {
                  context.taskIndex = 0;
                  const nextState = reducer(state, action, context);
                  set(nextState);
                },
                { context }
              );
            } catch (ex) {
              // run reducer again dependency signals are in progress
              if (isPromiseLike(ex)) {
                let token: any;
                signal.task = ex.then(
                  () => {
                    if (token !== changeToken) return;
                    emitInternal();
                  },
                  (reason) => {
                    if (token !== changeToken) return;
                    changeStatus(false, reason, state);
                  }
                );
                changeStatus(true, undefined, state);
                token = changeToken;
                return signal;
              }
              console.log(ex);
              changeStatus(false, ex, state);
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
      if (options?.initAction) {
        emittableSignal.emit(options.initAction);
      }
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

const collectDependencies = <T>(
  fn: () => T,
  dependants?: Map<any, any>,
  onUpdate?: VoidFunction,
  scope?: Scope
) => {
  const inactiveDependants = new Set(dependants?.keys());

  return scopeOfWork(fn, {
    ...scope,
    registerDependant(dependant) {
      inactiveDependants.delete(dependant);
      if (onUpdate && !dependants?.has(dependant)) {
        dependants?.set(dependant, dependant(onUpdate));
      }
    },
    onDone() {
      inactiveDependants.forEach((x) => dependants?.delete(x));
      scope?.onDone?.();
    },
  });
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
      const dependants = new Map<any, Function>();
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
          return collectDependencies(result, dependants, rerender, {
            onDone: updateForwardedRef,
          });
        }

        updateForwardedRef();
        return result;
      };

      this._unmount = () => {
        dependants.forEach((x) => x());
        dependants.clear();
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

  return collectDependencies(() => {
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
  }) as any;
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
  return scopeOfWork(({ context }) => {
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
            { registerDependant: undefined }
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
  });
};

export const delay = <T = void>(ms: number, resolved?: T) =>
  new Promise<T>((resolve) => setTimeout(resolve, ms, resolved));

export { createSignal as signal, createStableComponent as stable };

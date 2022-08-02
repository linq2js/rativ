import { mutate } from "./mutation";
import { createCallbackGroup } from "./util/createCallbackGroup";
import { isPromiseLike } from "./util/isPromiseLike";
import { delay } from "./util/delay";
import { asyncUpdate } from "./util/asyncUpdate";
import {
  collectDependencies,
  currentScope,
  InternalContext,
  scopeOfWork,
} from "./util/scope";
import {
  Atom,
  AtomExtraProps,
  AtomHelpers,
  AtomOptions,
  Awaiter,
  ComputedAtom,
  Context,
  EmitFn,
  EmittableAtom,
  EmittableOptions,
  GetFn,
  KeyOf,
  Listener,
  NoInfer,
  UpdatableAtom,
  Wait,
  SetFn,
} from "./util/commonTypes";

const isAtomProp = "$$atom";
export type CreateAtom = {
  /**
   * create computed atom
   */
  <T>(
    computeFn: (context: Context) => T | Awaiter<T>,
    options?: AtomOptions
  ): ComputedAtom<T>;

  <T, H extends AtomHelpers<[GetFn<T>, SetFn<T>]>>(
    computeFn: (context: Context) => T | Awaiter<T>,
    options: AtomOptions & { helpers: H }
  ): ComputedAtom<T> & AtomExtraProps<H>;

  /**
   * create updatable atom
   */
  <T>(initialState: Promise<T> | T, options?: AtomOptions): UpdatableAtom<T>;

  <T, H extends AtomHelpers<[GetFn<T>, SetFn<T>]>>(
    initialState: Promise<T> | T,
    options: AtomOptions & { helpers: H }
  ): UpdatableAtom<T> & AtomExtraProps<H>;

  /**
   * create amittable atom
   */
  <T, A = void>(
    initialState: T,
    reducer: (state: NoInfer<T>, action: A, context: Context) => T | Awaiter<T>,
    options?: EmittableOptions<A>
  ): EmittableAtom<T, A>;

  <T, H extends AtomHelpers<[GetFn<T>, EmitFn<T, A>]>, A = void>(
    initialState: T,
    reducer: (state: NoInfer<T>, action: A, context: Context) => T | Awaiter<T>,
    options: EmittableOptions<A> & { helpers: H }
  ): EmittableAtom<T, A> & AtomExtraProps<H>;
};

const isAbortControllerSupported = typeof AbortController !== "undefined";
const enqueueTask = Promise.resolve().then.bind(Promise.resolve());

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

export type Task<T, A extends any[]> = {
  (...args: A): T;
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

const noop = () => {};

const createAtom: CreateAtom = (...args: any[]): any => {
  const allListeners = {
    emit: createCallbackGroup(),
    state: createCallbackGroup(),
    status: createCallbackGroup(),
  };
  const key = {};
  let initialState: unknown;
  let reducer: Function | undefined;
  let options: EmittableOptions;
  let loadedState: { state: any } | undefined;

  // atom(initialState, reducer, options)
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
    let task: Promise<any> | undefined;
    let active = true;
    const dependencies = new Map<any, Function>();

    return {
      task,
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
    if (currentScope?.addDependency && currentScope.parent !== key) {
      currentScope.addDependency(channel);
    }
  };

  const abort = () => {
    storage.lastContext?.abort();
    storage.lastContext = undefined;
    storage.task = undefined;
  };

  const changeStatus = (
    nextLoading: boolean,
    nextError: any,
    nextState: any
  ) => {
    let statusChanged = false;
    let stateChanged = false;

    if (!nextLoading) {
      storage.task = undefined;
    }

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

    if (stateChanged) {
      storage.changeToken = {};
      allListeners.state.call(storage.state);
    }

    if (stateChanged) {
      save?.(storage.state);
    }
  };

  const get = (selector?: Function) => {
    const scopeType = currentScope?.type;
    if (scopeType === "component") {
      handleDependency(allListeners.status.add);

      if (storage.loading) {
        throw storage.task;
      }
      if (storage.error) {
        throw storage.error;
      }
    }

    handleDependency(allListeners.state.add);

    if (typeof selector === "function") return selector(storage.state);

    return storage.state;
  };

  const set = (...args: any[]): any => {
    if (!args.length) {
      return asyncUpdate(storage.state, () => storage.changeToken, set);
    }

    let nextState: any;

    if (typeof args[0] === "function") {
      nextState =
        args.length > 1 ? (prev: any) => mutate(prev, ...args) : args[0];
    } else {
      nextState = args[0];
    }

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

    if (storage.state === nextState) return noop;

    if (isPromiseLike(nextState)) {
      let token: any;

      storage.task = nextState
        .then((value) => {
          if (storage.changeToken !== token) return;
          storage.task = undefined;
          changeStatus(false, undefined, value);
        })
        .catch((error) => {
          if (storage.changeToken !== token) return;
          if (error && error.name === "AbortError") {
            changeStatus(false, undefined, storage.state);
            return;
          }
          storage.task = undefined;
          changeStatus(false, error, storage.state);
        });

      // should change status after lastPromise ready
      changeStatus(true, undefined, storage.state);
      token = storage.changeToken;

      return () => {
        if (token !== storage.changeToken) return;
        atom.cancel();
      };
    }

    changeStatus(false, undefined, nextState);

    return noop;
  };

  const atom = Object.assign(get, {
    [isAtomProp]: true,
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
    cancel() {
      if (!storage.loading) return;
      // force token changed
      storage.changeToken = {};
      changeStatus(false, undefined, storage.state);
    },
  });

  Object.defineProperties(atom, {
    key: { get: () => options?.key },
    task: { get: () => storage.task },
    error: {
      get: () => {
        handleDependency(allListeners.status.add);
        return storage.error;
      },
    },
    loading: {
      get: () => {
        handleDependency(allListeners.status.add);
        return storage.loading;
      },
    },
  });

  onInit.add(() => {
    if (currentScope?.onAtomCreated) {
      currentScope.onAtomCreated(() => {
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

  if (process.env.NODE_ENV !== "production") {
    Object.defineProperty(atom, "$$info", { get: () => storage });
  }

  // computed atom
  if (typeof storage.state === "function") {
    // is normal atom, it has state getter/setter
    Object.defineProperty(atom, "state", { get, set });

    const computeState = storage.state;
    const onCleanup = createCallbackGroup();
    storage.state = undefined;

    const invalidateState = () => {
      onCleanup.call();
      const context = createContext();
      storage.lastContext = context;
      try {
        collectDependencies(
          () => {
            context.taskIndex = 0;
            let nextState = computeState(context);
            if (isPromiseLike(nextState)) {
              throw new Error(
                "Reducer result cannot be promise object. Use wait() helper to handle async data"
              );
            }
            if (isAwaiter(nextState)) {
              nextState = nextState.promise;
            }
            set(nextState);
          },
          storage.dependencies,
          // invalidate state when dependency atoms are changed
          invalidateState,
          {
            parent: key,
            context,
            type: "computed",
            onCleanup: onCleanup.add,
          }
        );
      } catch (ex) {
        changeStatus(false, ex, storage.state);
      }
    };

    Object.assign(atom, {
      set,
      reset() {
        storage.state = undefined;
        invalidateState();
      },
    });

    onInit.add(() => {
      if (loadedState) {
        storage.state = loadedState.state;
      } else {
        invalidateState();
      }
    });
  } else {
    // emittable atom
    if (reducer) {
      // is emittable atom, it has only state getter, and emit method
      Object.defineProperty(atom, "state", { get });
      const onCleanup = createCallbackGroup();
      const emittableAtom = {
        emit(action: any) {
          allListeners.emit.call(storage.state, action);
          const context = (storage.lastContext = createContext());
          onCleanup.call();
          try {
            scopeOfWork(
              () => {
                context.taskIndex = 0;
                let nextState = reducer!(storage.state, action, context);
                if (isPromiseLike(nextState)) {
                  throw new Error(
                    "Reducer result cannot be promise object. Use wait() helper to handle async data"
                  );
                }
                if (isAwaiter(nextState)) {
                  nextState = nextState.promise;
                }
                set(nextState);
              },
              { type: "emittable", context, onCleanup: onCleanup.add }
            );
          } catch (ex) {
            changeStatus(false, ex, storage.state);
          }

          return atom;
        },
        reset() {
          set(initialState);
        },
      };
      Object.assign(atom, emittableAtom);
      if (loadedState) {
        storage.state = loadedState.state;
      }
      if (options?.initAction) {
        emittableAtom.emit(options.initAction);
      }
    } else {
      // is updatable atom, it has state getter/setter
      Object.defineProperty(atom, "state", { get, set });
      Object.assign(atom, {
        set,
        reset() {
          set(initialState);
        },
      });

      onInit.add(() => {
        if (loadedState) {
          storage.state = loadedState.state;
        } else if (isPromiseLike(storage.state)) {
          const asyncState = storage.state;
          storage.state = undefined;
          set(asyncState);
        }
      });
    }
  }

  const helpers = (options as any)?.helpers as Record<string, Function>;

  if (helpers) {
    const context = [atom.get, (atom as any).emit || (atom as any).set];
    Object.keys(helpers).forEach((key) => {
      if (key in atom) {
        throw new Error(`Cannot override the atom prop "${key}"`);
      }

      const helper = helpers[key];
      (atom as any)[key] = (...args: any[]) => {
        return helper(context, ...args);
      };
    });
  }

  onInit.call();

  return atom;
};

const isAtom = <T>(value: any): value is Atom<T> => {
  return value && value[isAtomProp];
};

const createWatcher: Watch = (watchFn, options) => {
  if (typeof options === "function") {
    options = { callback: options };
  }
  const { callback, compare } = options ?? {};
  const onCleanup = createCallbackGroup();
  let dependencies = new Map<any, Function>();
  let firstTime = true;
  let active = true;
  let prevValue: any;

  const startWatching = () => {
    if (!active) return;
    onCleanup.call();
    const value = collectDependencies(
      watchFn as unknown as () => unknown,
      dependencies,
      startWatching,
      {
        type: "computed",
        onCleanup: onCleanup.add,
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

export type CreateSnapshot = {
  (atoms: Atom[], reset?: boolean): VoidFunction;
  <T>(atoms: Atom[], callback: () => T): T;
  <T>(atoms: Atom[], reset: boolean, callback: () => T): T;
};

const createSnapshot: CreateSnapshot = (atoms: Atom[], ...args: any[]): any => {
  const revert = createCallbackGroup();
  let callback: VoidFunction | undefined;
  let reset = false;

  if (typeof args[0] === "function") {
    [callback] = args;
  } else {
    [reset, callback] = args;
  }

  atoms.forEach((atom) => {
    revert.add(atom.snapshot(reset));
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

const keyOf: KeyOf = (obj: Record<string, unknown>, exclude?: string[]) => {
  if (exclude) {
    return Object.keys(obj).filter((x) => !exclude.includes(x));
  }

  return Object.keys(obj) as any;
};

const createAtomFamily = <A extends any[], T = unknown>(
  createFn: (...args: A) => T
) => {
  type Item = Map<any, Item> & { data?: T };
  type FindItem = {
    (args: A, createIfNotExist: true): [Item, VoidFunction];
    (args: A, createIfNotExist: false): [Item, VoidFunction];
  };

  const root: Item = new Map();

  const findItem: FindItem = (args, createIfNotExist): any => {
    let current = root;
    const stack: { key: any; parent: Item }[] = [];
    const remove = () => {
      stack.forEach(({ parent, key }) => parent.delete(key));
    };
    for (const key of args) {
      stack.push({ key, parent: current });
      let next = current.get(key);
      if (!next) {
        if (!createIfNotExist) return [undefined, remove];
        next = new Map();
        current.set(key, next);
      }
      current = next;
    }
    return [current, remove];
  };

  return {
    get(...args: A) {
      const [item] = findItem(args, true);
      let data = item.data;
      if (!data) {
        data = createFn(...args);
        item.data = data;
      }
      return data;
    },
    clear() {
      root.clear();
    },
    has(...args: A) {
      const [item] = findItem(args, false);
      return !!item;
    },
    delete(...args: A) {
      const [item, remove] = findItem(args, false);
      remove();
      return item?.data;
    },
  };
};

const isAwaiter = <T>(value: any): value is Awaiter<T> => {
  return value && value.$$type === "awaiter";
};

const createAwaiter: Wait = (input: any, fn: Function, ...args: any[]): any => {
  const scope = currentScope;

  if (!scope) {
    throw new Error("wait() helper cannot be called outside atom scope");
  }

  const cleanup = createCallbackGroup();
  let active = true;

  if (scope.onCleanup) {
    cleanup.add(
      scope.onCleanup(() => {
        enqueueTask(() => (active = false));
        cleanup.call();
      })
    );
  }
  const handleAwaitables = (
    awaitables: (Promise<any> | Atom)[],
    resultSelector: (values: any[]) => any
  ) => {
    return {
      $$type: "awaiter",
      promise: new Promise((resolve, reject) => {
        let count = 0;
        let done = false;
        const values: any[] = [];
        const onDone = (value: any, index: number, error: any) => {
          if (done) return;
          if (!active) return;

          if (error) {
            done = true;
            return reject(error);
          }
          count++;
          values[index] = value;
          if (count >= awaitables.length) {
            done = true;
            scopeOfWork(() => {
              const next = fn(resultSelector(values), ...args);
              if (isAwaiter(next)) {
                resolve(next.promise);
              } else {
                resolve(next);
              }
            }, scope);
          }
        };

        awaitables.forEach((awaitable, index) => {
          if (isPromiseLike(awaitable)) {
            awaitable.then(
              (value) => active && onDone(value, index, undefined),
              (error) => active && onDone(undefined, index, error)
            );
            return;
          }

          if (awaitable.loading) {
            cleanup.add(
              awaitable.on("status", () => {
                if (awaitable.loading) return;
                onDone(awaitable.state, index, awaitable.error);
              })
            );
          } else {
            onDone(awaitable.state, index, undefined);
          }
        });
      }),
    } as Awaiter<any>;
  };

  if (isPromiseLike(input) || isAtom(input)) {
    return handleAwaitables([input], (values) => values[0]);
  }
  return handleAwaitables(input, (values) => values);
};

export * from "./util/commonTypes";

export {
  createAtomFamily as family,
  delay,
  keyOf,
  isAtom,
  createAtom as atom,
  createWatcher as watch,
  createSnapshot as snapshot,
  createAwaiter as wait,
};

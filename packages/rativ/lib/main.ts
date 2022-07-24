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
  ReactNode,
  RefAttributes,
  RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { mutate, Mutation } from "./mutation";
import { createCallbackGroup } from "./util/createCallbackGroup";
import { isPromiseLike } from "./util/isPromiseLike";
import { delay } from "./util/delay";

export type { Mutation };

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type Listener<T, A = void> = (e: T, a: A) => void;

export type Nullable<T> = T | undefined | null;

export type Refs<T extends Record<string, any> = {}, F = any> = {
  [key in keyof T]?: T[key];
} & { [key in `${keyof T & string}Ref`]: RefObject<any> } & {
  forwardedRef: ForwardedRef<F>;
};

export type Atom<T = any> = {
  /**
   * name of atom
   */
  readonly name: string | undefined;
  /**
   * get loading status of the atom
   */
  readonly loading: boolean;
  /**
   * get current error of the atom
   */
  readonly error: any;
  /**
   * get current task of the atom
   */
  readonly task: Promise<T> | undefined;
  /**
   * listen atom state changing event
   * @param listener
   */
  on(listener: Listener<T>): VoidFunction;
  /**
   * listen atom status changing event
   * @param type
   * @param listener
   */
  on(type: "status", listener: Listener<void>): VoidFunction;
  /**
   * get current state of the atom
   */
  get(): T;
  /**
   * get result of the selector, the selector retrieves current state of the atom
   * @param selector
   */
  get<R>(selector: (state: T) => R): R;
  /**
   * reset atom state
   */
  reset(): void;
  /**
   * abort the task of the atom if it is processing
   */
  abort(): void;
  /**
   * create a snapshot of the atom
   * @param reset
   */
  snapshot(reset?: boolean): VoidFunction;
  /**
   * get current state of the atom
   */
  readonly state: T;
};

export type UpdatableAtom<T = any> = Atom<T> & {
  /**
   * get or set current state of the atom
   */
  state: T;
  /**
   * update current state of the atom by using specfied mutations
   * @param mutations
   */
  set(...mutations: Mutation<T>[]): UpdatableAtom<T>;
  /**
   * update current state of the atom
   * @param state
   */
  set(
    state:
      | ((prev: T, context: Context) => T | Promise<T> | Awaiter<T>)
      | T
      | Promise<T>
      | Awaiter<T>
  ): void;
};

export type Context = {
  /**
   * AbortController signal
   */
  readonly signal: AbortController["signal"] | undefined;
  /**
   * is aborted
   */
  readonly aborted: boolean;
  /**
   *  abort the context
   */
  abort(): void;
};

export type EmittableAtom<T = any, A = void> = Atom<T> & {
  /**
   * emit an action and atom reducer will handle the action
   * @param action
   */
  emit(action: A): EmittableAtom<T, A>;
  /**
   * listen action emitting event
   * @param type
   * @param listener
   */
  on(type: "emit", listener: Listener<T, A>): VoidFunction;
};

export type AtomOptions = {
  /**
   * name of atom, for debugging purpose
   */
  name?: string;
  /**
   * this function will be called when initializing atom
   */
  load?: () => { state: any } | undefined;
  /**
   * this function will be called when atom state changed
   */
  save?: (state: any) => void;
  onChange?: VoidFunction;
  onError?: (error: any) => void;
  onLoading?: VoidFunction;
};

export type EmittableOptions<A = any> = AtomOptions & {
  initAction?: A;
  onEmit?: (action: A) => void;
};

export type ComputedAtom<T> = UpdatableAtom<T>;

export type CreateAtom = {
  /**
   * create computed atom
   */
  <T>(
    computeFn: (context: Context) => T | Awaiter<T>,
    options?: AtomOptions
  ): ComputedAtom<T>;

  /**
   * create updatable atom
   */
  <T>(initialState: Promise<T> | T, options?: AtomOptions): UpdatableAtom<T>;

  /**
   * create amittable atom
   */
  <T, A = void>(
    initialState: T,
    reducer: (state: NoInfer<T>, action: A, context: Context) => T | Awaiter<T>,
    options?: EmittableOptions<A>
  ): EmittableAtom<T, A>;
};

export type Awaiter<T> = { $$type: "awaiter"; promise: Promise<T> };

export type Wait = {
  <A, T, P extends any[]>(
    awaitable: Atom<A> | Promise<A>,
    fn: (value: A, ...args: P) => T | Awaiter<T>,
    ...args: P
  ): T extends Promise<any> ? never : Awaiter<T>;
  <A extends { [key: number]: Atom | Promise<any> }, T, P extends any[]>(
    awaitables: A,
    fn: (
      values: {
        [key in keyof A]: A[key] extends Atom<infer V>
          ? V
          : A[key] extends Promise<infer V>
          ? V
          : never;
      },
      ...args: P
    ) => T | Awaiter<T>,
    ...args: P
  ): T extends Promise<any> ? never : Awaiter<T>;
};

export type CreateSlot = {
  (atom: Atom): ReactNode;
  (computeFn: () => any): ReactNode;
};

/**
 *
 */
export interface ComponentBuilder<C, O, P = O> {
  /**
   * create component prop with specified valid values
   * @param name
   * @param values
   */
  prop<TValue extends string>(
    name: keyof O,
    values: TValue[]
  ): ComponentBuilder<void, O, P & { [key in TValue]?: boolean }>;

  /**
   * apply memoizing for compound component
   * @param areEqual
   */
  memo(areEqual?: (prev: P, next: P) => boolean): this;

  /**
   * apply stabling for compound component
   * @param options
   */
  stable(options?: StableOptions): this;

  /**
   * create computed prop
   * @param name
   * @param compute
   */
  prop<TName extends string = string, TValue = unknown>(
    name: TName,
    compute: (value: TValue, props: P) => Partial<O>
  ): ComponentBuilder<
    void,
    O,
    P &
      // optional prop
      (TValue extends void
        ? { [key in TName]?: TValue }
        : { [key in TName]: TValue })
  >;

  /**
   * create new prop that has specified values
   * @param name
   * @param map
   */
  prop<TName extends keyof O, TMap extends Record<string, string>>(
    name: TName,
    map: TMap
  ): ComponentBuilder<void, O, P & { [key in keyof TMap]?: boolean }>;

  map<TName extends keyof O, TValue = O[TName]>(
    name: TName,
    mapper: (value: TValue, props: P) => O[TName]
  ): ComponentBuilder<
    void,
    O,
    P &
      (TValue extends void
        ? { [key in TName]?: TValue }
        : { [key in TName]: TValue })
  >;

  rename<TOld extends keyof P, TNew extends string>(
    oldName: TOld,
    newName: TNew
  ): ComponentBuilder<void, O, Omit<P, TOld> & { [key in TNew]: P[TOld] }>;

  /**
   * use renderFn to render compound component, the renderFn retrives compound component, input props, ref
   * @param renderFn
   */
  render<TNewProps = P, TRef = any>(
    renderFn: (
      component: FC<P>,
      props: TNewProps,
      ref: ForwardedRef<TRef>
    ) => any
  ): ComponentBuilder<void, O, TNewProps>;

  /**
   * use HOC
   * @param hoc
   * @param args
   */
  use<TNewProps = P, TArgs extends any[] = []>(
    hoc: (
      component: FC<P>,
      ...args: TArgs
    ) => Component<TNewProps> | FC<TNewProps>,
    ...args: TArgs
  ): ComponentBuilder<void, O, TNewProps>;

  /**
   * end  building process and return a component
   */
  end(): (C extends void ? FC<P> : C) & {
    /**
     * for typing only, DO NOT USE this for getting value
     */
    props: P;
  };
}

export type AnyComponent<P> = Component<P> | FC<P>;

export type KeyOf = {
  <T, E extends keyof T>(obj: T, exclude: E[]): Exclude<keyof T, E>[];
  <T>(obj: T): (keyof T)[];
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
  parent?: any;
  type?:
    | "emittable"
    | "computed"
    | "component"
    | "updatable"
    /**
     * initializing phase of stable component
     */
    | "stable";
  addDependency?: (subscribeChannel: Function) => void;
  onAtomCreated?: (disposeAtom: VoidFunction) => void;
  addEffect?: (effect: Effect) => void;
  context?: InternalContext;
  onDone?: VoidFunction;
  onCleanup?: (listener: VoidFunction) => VoidFunction;
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

export type StableOptions = { name?: string };

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
      inactiveDependencies.forEach((x) => {
        const unsubscribe = dependencies?.get(x);
        if (unsubscribe) {
          dependencies?.delete(x);
          unsubscribe();
        }
      });
      scope?.onDone?.();
    },
  });
};

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

  const set = (...args: any[]) => {
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
    if (storage.state === nextState) return;
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
          storage.task = undefined;
          changeStatus(false, error, storage.state);
        });

      // should change status after lastPromise ready
      changeStatus(true, undefined, storage.state);
      token = storage.changeToken;

      return;
    }

    changeStatus(false, undefined, nextState);
  };

  const atom = {
    get name() {
      return options?.name;
    },
    get task() {
      return storage.task;
    },
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

  onInit.call();

  return atom;
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

let isStrictMode = false;
const envMode = typeof process !== "undefined" && process.env.NODE_ENV;
const enqueue = Promise.resolve().then.bind(Promise.resolve());
const createStableComponent = <P extends Record<string, any>, R extends Refs>(
  component: (props: P, refs: R) => any | FunctionComponent<P>,
  options?: StableOptions
): ForwardRefExoticComponent<
  P & RefAttributes<R extends Refs<infer _R, infer F> ? F | undefined : any>
> => {
  type PropsWithRef = P & {
    forwardedRef: ForwardedRef<R extends Refs<any, infer F> ? F : any>;
  };

  // wrap render function to functional component to get advantages of hooks
  const Inner = memo((props: { __render: (forceUpdate: Function) => any }) => {
    const setState = useState()[1];
    const renderingRef = useRef(true);
    renderingRef.current = true;
    // we use nextRender value to prevent calling forceUpdate multiple times
    // nextRender value will be changed only when the component is actual re-rendered
    const nextRenderRef = useRef<any>();
    const forceUpdate = useState(() => () => {
      if (renderingRef.current) return;
      setState(nextRenderRef.current);
    })[0];
    nextRenderRef.current = {};

    useLayoutEffect(() => {
      renderingRef.current = false;
    });

    return props.__render(forceUpdate);
  });

  class Wrapper extends Component<PropsWithRef> {
    private _propsProxy: P;
    private _unmount: VoidFunction;
    private _mount: VoidFunction;
    private _unmounted = false;
    private _mounted = false;

    constructor(props: PropsWithRef) {
      super(props);
      const dependencies = new Map<any, Function>();

      const effects: Effect[] = [];
      const unmountEffects = createCallbackGroup();
      const refsProxy = createRefs();
      const disposeLocalAtoms = createCallbackGroup();

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
          onAtomCreated(disposeAtom) {
            disposeLocalAtoms.add(disposeAtom);
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
        // We use it to force inner component update whenever atom changed
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
        disposeLocalAtoms.call();
        unmountEffects.call();
        dependencies.forEach((x) => x());
        dependencies.clear();
      };
    }

    componentDidMount() {
      if (this._mounted) {
        isStrictMode = true;
        return;
      }
      this._mounted = true;
      this._mount();
    }

    render() {
      return createElement(Inner, this._propsProxy as any);
    }
    componentWillUnmount() {
      if (
        // production mode
        envMode === "production" ||
        // test mode
        envMode === "test" ||
        // in strict mode but already unmounted
        (isStrictMode && this._unmounted)
      ) {
        this._unmount();
      } else {
        this._unmounted = true;
        // wait for next call in strict mode
        enqueue(() => {
          if (isStrictMode) {
            return;
          }
          this._unmount();
        });
      }
    }
  }

  Object.assign(Wrapper, {
    displayName: (component as any).displayName || component.name,
    propTypes: (component as any).propTypes,
  });

  return Object.assign(
    memo(
      forwardRef((props, forwardedRef) =>
        createElement(Wrapper, { ...props, forwardedRef } as any)
      )
    ),
    {
      displayName:
        options?.name ?? component.name ?? (component as FC).displayName,
    }
  ) as any;
};

const isAtom = <T>(value: any): value is Atom<T> => {
  return (
    value &&
    typeof value === "object" &&
    typeof value.on === "function" &&
    typeof value.get === "function"
  );
};

const SlotInner = memo((props: { render: () => any; token: any }) => {
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

const SlotWrapper: FC<{ slot: any }> = (props) => {
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
 * create a slot that update automatically when input atom/computed value is changed
 * @param slot
 * @returns
 */
const createSlot: CreateSlot = (slot): any => {
  return createElement(SlotWrapper, { slot });
};

/**
 * use effect
 * @param fn
 */
const createEffect = (fn: Effect) => {
  if (!currentScope?.addEffect) {
    throw new Error(
      "Cannot call effect() helper outside stable part of stable component"
    );
  }
  currentScope.addEffect(fn);
};

const defaultProps = <T>(props: T, defaultValues: Partial<T>) => {
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
const createDirective = <E = HTMLElement>(
  directives: Directive<E> | Directive<E>[]
): RefObject<any> => {
  const ref = createRef<E>();
  const directiveList = Array.isArray(directives) ? directives : [directives];
  createEffect(() => {
    directiveList.forEach((directive) => directive(ref.current as E));
  });
  return ref;
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

/**
 * create a component with special props and HOC
 * @param component
 * @returns
 */
const createComponentBuilder = <C>(
  component: C
): C extends AnyComponent<infer P> ? ComponentBuilder<C, P, P> : never => {
  const oldNames: Record<string, string> = {};
  const singlePropMappings: Record<string, { prop: string; value: string }> =
    {};
  const multiplePropMappings: Record<string, Function> = {};
  const hocs: Function[] = [];
  const mappers: Record<string, Function> = {};
  let hasMapper = false;
  let hasPropMap = false;

  const setProp = (
    inputProps: Record<string, any>,
    targetProps: Record<string, any>,
    name: string,
    value: any
  ) => {
    name = oldNames[name] || name;
    const multiplePropMapping = multiplePropMappings[name];
    if (multiplePropMapping) {
      const newProps = multiplePropMapping(value, inputProps);
      Object.entries(newProps).forEach(([key, value]) => {
        setProp(inputProps, targetProps, key, value);
      });
    } else {
      const mapTo = singlePropMappings[name];
      if (mapTo) {
        value = mapTo.value;
        name = mapTo.prop;
      }
      const mapper = mappers[name];
      if (mapper) value = mapper(value, inputProps);
      if (typeof targetProps[name] === "undefined") {
        targetProps[name] = value;
      }
    }
  };

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prop(name: string, values: string[] | Function) {
      if (Array.isArray(values)) {
        values.forEach((value) => {
          singlePropMappings[value] = { prop: name, value: value };
        });
      } else if (typeof values === "function") {
        multiplePropMappings[name] = values;
      } else {
        Object.entries(values).forEach(([key, value]) => {
          singlePropMappings[key] = { prop: name, value: value as string };
        });
      }
      hasPropMap = true;
      return this;
    },
    use(hoc: Function, ...args: any[]) {
      hocs.push((component: any) => hoc(component, ...args));
      return this;
    },
    rename(oldName: string, newName: string) {
      if (oldName !== newName) {
        oldNames[newName] = oldName;
      }
      return this;
    },
    render(renderFn: Function) {
      hocs.push((component: any) =>
        forwardRef((props, ref) => renderFn(component, props, ref))
      );
      return this;
    },
    map(name: string, mapper: Function) {
      mappers[name] = mapper;
      hasMapper = true;
      return this;
    },
    memo(areEqual: Function) {
      hocs.push((component: any) => memo(component, areEqual as any));
      return this;
    },
    stable(options: any) {
      hocs.push((component: any) =>
        createStableComponent(component, options as any)
      );
      return this;
    },
    end() {
      let CompoundComponent = forwardRef(
        (props: Record<string, unknown>, ref: unknown) => {
          const mappedProps: Record<string, unknown> = {};
          // optimize performance
          if (hasMapper || hasPropMap) {
            Object.entries(props).forEach(([key, value]) => {
              setProp(props, mappedProps, key, value);
            });
          } else {
            Object.assign(mappedProps, props);
          }

          if (ref) mappedProps["ref"] = ref;

          return createElement(component as any, mappedProps);
        }
      );

      if (hocs.length) {
        CompoundComponent = hocs.reduce(
          (prev, hoc) => hoc(prev),
          CompoundComponent
        ) as any;
      }

      return CompoundComponent;
    },
  } as any;
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
              resolve(next);
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

export {
  createAtomFamily as family,
  delay,
  keyOf,
  isAtom,
  createEffect as effect,
  createSlot as slot,
  defaultProps,
  createDirective as directive,
  createAtom as atom,
  createStableComponent as stable,
  createWatcher as watch,
  createSnapshot as snapshot,
  createComponentBuilder as create,
  createAwaiter as wait,
};

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

import { createCallbackGroup } from "../util/createCallbackGroup";
import { collectDependencies, currentScope, scopeOfWork } from "../util/scope";

export type StableOptions = { name?: string };

export type Refs<T extends Record<string, any> = {}, F = any> = {
  [key in keyof T]: T[key];
} & { [key in `${keyof T & string}Ref`]: RefObject<any> } & {
  forwardedRef: ForwardedRef<F>;
};

export type CreateSlot = {
  (computeFn: () => any): ReactNode;
  <A extends any[]>(computeFn: (...args: A) => any, ...args: A): ReactNode;
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

export type Directive<E> = (ref: E) => void | VoidFunction;

export type EffectContext<R> = { refs: Refs<R> };

export type Effect<R = any> = (
  context: EffectContext<R>
) => void | VoidFunction;

const createRefs = <R, F = any>(): Refs<R, F> => {
  const refCache = new Map<any, RefObject<any>>();
  const getRef = (p: string) => {
    let ref = refCache.get(p);
    if (!ref) {
      ref = createRef();
      refCache.set(p, ref);
    }
    return ref;
  };
  const refsProxy = new Proxy(
    {},
    {
      get(_, p) {
        if (typeof p === "string") {
          if (p.endsWith("Ref")) {
            return getRef(p);
          }
          const ref = getRef(p + "Ref");
          return ref?.current;
        }
      },
      set(_, p, value) {
        if (typeof p === "string") {
          if (p.endsWith("Ref")) {
            throw new Error(`Cannot mutate ref object. Use refs.${p} = value`);
          }
          const ref = getRef(p + "Ref");
          Object.assign(ref, { current: value });
        }
        return true;
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
            cachedValue = createStableFunction(() => getProps()[p]);
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
      const renderCallbacks = createCallbackGroup();

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
          addEffect(effect, onRender) {
            if (onRender) renderCallbacks.add(onRender);
            effects.push(effect as Effect);
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

        renderCallbacks.call();

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
const createSlot: CreateSlot = (slot: Function, ...args: any[]): any => {
  return createElement(SlotWrapper, {
    slot: args.length ? () => slot(...args) : slot,
  });
};

/**
 * use effect
 * @param onMount
 */
const createEffect = (onMount: Effect, onRender?: VoidFunction) => {
  if (!currentScope?.addEffect) {
    throw new Error(
      "Cannot call effect() helper outside stable part of stable component"
    );
  }
  currentScope.addEffect(onMount, onRender);
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

const createStableFunction = (
  getCurrent: () => Function,
  context: any = null
) => {
  return (...args: any[]) => {
    const current = getCurrent();
    return current.apply(context, args);
  };
};

export {
  createEffect as effect,
  createSlot as slot,
  createSlot as $,
  defaultProps,
  createDirective as directive,
  createStableComponent as stable,
  createComponentBuilder as create,
};

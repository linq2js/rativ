import {
  Component,
  createContext,
  createElement,
  forwardRef,
  FunctionComponent,
  memo,
  PropsWithChildren,
  ReactNode,
  RefObject,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type PrefetchOptions = { prefetch?: boolean | number };

export type LazyAction<A extends any[], R> = {
  (...args: A): R;
  asyncCall(...args: A): R extends Promise<infer T> ? Promise<T> : Promise<R>;
  prefetch(): void;
  isFetched(): boolean;
};

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type Loader<T = unknown> = (() => Promise<T>) | Promise<T>;

export type AnyComponent<P> =
  | Component<P>
  | FunctionComponent<P>
  | (new (props: P) => Component)
  | ((props: P) => unknown);

export type PropsOf<T> = T extends AnyComponent<infer P> ? P : never;

export type LazyComponentOptions<T> = PrefetchOptions & {
  loading?: (props: T) => ReactNode;
  mode?: "always" | "intersecting";
};

export type LazyActionOptions = PrefetchOptions;

export type CreateLazyAction = {
  <T>(loader: () => Promise<T>, options?: LazyActionOptions): T extends {
    default: (...args: infer A) => infer R;
  }
    ? LazyAction<A, R>
    : T extends (...args: infer A) => infer R
    ? LazyAction<A, R>
    : never;

  <A extends any[], R>(
    loader: Loader,
    dispatcher: (...chunks: any[]) => (...args: A) => R,
    options?: LazyActionOptions
  ): LazyAction<A, R>;

  <A extends any[], R>(
    loaders: Loader[],
    dispatcher: (...chunks: A) => (...args: A) => R,
    options?: LazyActionOptions
  ): LazyAction<A, R>;
};

export type CreateLazyComponent = {
  <T>(
    loader: () => Promise<{ default: T }>,
    options?: LazyComponentOptions<NoInfer<T>>
  ): FunctionComponent<PropsOf<T>>;
};

export type LazyProviderProps = PrefetchOptions;

export type LazyContext = PrefetchOptions & {
  enqueue(prefetch: PrefetchOptions["prefetch"], callback: VoidFunction): void;
};

const lazyContext = createContext<LazyContext | undefined>(undefined);

const isServerSide = typeof window === "undefined";

const isPromiseLike = <T>(value: any): value is Promise<T> => {
  return value && typeof value.then === "function";
};

const noLoading = () => null;

const enqueue = (
  prefetch: PrefetchOptions["prefetch"],
  callback: VoidFunction,
  started?: Promise<number>
) => {
  if (
    prefetch === false ||
    typeof prefetch === "undefined" ||
    prefetch === null
  ) {
    return;
  }

  if (!started) {
    started = Promise.resolve(Date.now());
  }

  started.then((startTime) => {
    if (prefetch === true || startTime + prefetch <= Date.now()) {
      callback();
    } else {
      const nextInterval = startTime + prefetch - Date.now();

      setTimeout(callback, nextInterval);
    }
  });
};

const LazyProvider: FunctionComponent<PropsWithChildren<LazyProviderProps>> = ({
  children,
  ...props
}) => {
  const prefetcher = useState(() => {
    let start: VoidFunction = () => {};
    let started = new Promise<number>(
      (resolve) => (start = () => resolve(Date.now()))
    );

    return {
      start,
      enqueue(prefetch: PrefetchOptions["prefetch"], callback: VoidFunction) {
        return enqueue(prefetch, callback, started);
      },
    };
  })[0];

  useEffect(() => {
    setTimeout(prefetcher.start);
  }, [prefetcher]);

  return createElement(
    lazyContext.Provider,
    { value: { ...props, enqueue: prefetcher.enqueue } },
    children
  );
};

const useLazyContext = () => useContext(lazyContext);

const lazyAction: CreateLazyAction = (...args: any[]) => {
  const [loaders, dispatcherOrOptions] = args;
  const dispatcher =
    typeof dispatcherOrOptions === "function" ? dispatcherOrOptions : args[2];
  const { prefetch }: LazyActionOptions =
    (typeof dispatcherOrOptions === "function" ? args[2] : args[1]) ?? {};
  let resolved: any[] | undefined;
  let onLoaded: Promise<any[]> | undefined;

  const performPrefetching = () => {
    if (onLoaded) return false;
    resolved = [];
    // promote resolved variable
    const r = resolved;
    const promises: any[] = [];
    (Array.isArray(loaders) ? loaders : [loaders]).forEach((loader, index) => {
      const promise = typeof loader === "function" ? loader() : loader;
      if (isPromiseLike(promise)) {
        promises.push(
          promise.then(
            (chunk: any) =>
              (r[index] =
                typeof chunk?.default !== "undefined" ? chunk.default : chunk)
          )
        );
      } else {
        r[index] = promise;
      }
    });

    onLoaded = Promise.all(promises);
    return true;
  };

  const dispatch = (...args: any[]): any => {
    if (resolved) {
      try {
        if (dispatcher) {
          return dispatcher(...resolved)(...args);
        }
        if (typeof resolved[0] !== "function") {
          throw new Error(
            `Invalid chunk. Expect a function but got ${typeof resolved[0]}`
          );
        }
        return resolved[0](...args);
      } catch (ex) {
        // something is still loading
        if (isPromiseLike(ex)) {
          // dispatch again after everything is ready
          throw ex.then(() => dispatch(...args));
        }
        throw ex;
      }
    }
    if (!onLoaded) {
      // nothing to await
      if (!performPrefetching()) {
        return dispatch(...args);
      }
    }

    throw onLoaded?.then(() => dispatch(...args));
  };

  enqueue(prefetch, performPrefetching);

  return Object.assign(dispatch, {
    isFetched() {
      return !!resolved;
    },
    prefetch: performPrefetching,
    asyncCall(...args: any[]) {
      try {
        const result = dispatch(...args);
        if (isPromiseLike(result)) return result;
        return Promise.resolve(result);
      } catch (ex) {
        if (isPromiseLike(ex)) return ex;
        throw ex;
      }
    },
  });
};

const useIsInViewport = (ref?: RefObject<any>) => {
  const intersecting = useMemo(() => ({ value: false }), [ref?.current]);
  const rerender = useState<any>()[1];

  useEffect(() => {
    if (!ref?.current || isServerSide) return;

    const observer = new IntersectionObserver(([entry]) => {
      intersecting.value = entry.isIntersecting;
      if (entry.isIntersecting) {
        observer.disconnect();
        rerender({});
      }
    });

    observer.observe(ref.current);

    return () => {
      observer.disconnect();
    };
  }, [ref?.current]);

  if (!ref) return true;

  return intersecting.value;
};

const lazyComponent: CreateLazyComponent = (
  chunk,
  { loading, mode, prefetch: customPrefetch } = {}
) => {
  const action = lazyAction(
    chunk,
    (comp) => (props) => createElement(comp, props)
  );

  return memo(
    forwardRef((props: any, ref): any => {
      const lazyContext = useLazyContext();
      const prefetch = customPrefetch ?? lazyContext?.prefetch;
      const elementRef = useRef<any>();
      const propsWithRef = ref ? { ...props, ref } : props;
      const isInViewPort = useIsInViewport(
        mode === "intersecting" && !action.isFetched() ? elementRef : undefined
      );

      useEffect(() => {
        if (isServerSide) return;
        if (lazyContext) {
          lazyContext.enqueue(prefetch, action.prefetch);
        } else {
          enqueue(prefetch, action.prefetch);
        }
      }, [lazyContext]);

      if (!isInViewPort) {
        if (mode === "intersecting") {
          return createElement("span", {
            ref: elementRef,
            style: {
              visibility: "hidden",
              width: 0,
              height: 0,
              display: "inline-block",
            },
          });
        }
        return null;
      }

      if (loading) {
        try {
          return action(propsWithRef);
        } catch (ex) {
          if (isPromiseLike(ex)) {
            return loading(propsWithRef);
          }
          throw ex;
        }
      }
      return action(propsWithRef);
    })
  ) as any;
};

export { lazyAction, lazyComponent, LazyProvider, noLoading };

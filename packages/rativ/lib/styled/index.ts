import { Component, createElement, FC, FunctionComponent } from "react";
import { stable } from "../main";

type StyleCombiner<S, R> = (styles: S[], props: Record<string, any>) => R;

type StyleBuilder<S, P> = (props: P) => S | S[] | (() => S | S[]);

type ComponentType<P> =
  | Component<P>
  | FunctionComponent<P>
  | (new (props: P) => any);

type Styled = {
  <P, S>(
    component: Component<P> | FunctionComponent<P> | (new (props: P) => any),
    builder: StyleBuilder<S, P>,
    combinder: StyleCombiner<S, any>
  ): FC<P>;
  web<P, S>(
    component: Component<P> | FunctionComponent<P> | (new (props: P) => any),
    builder: StyleBuilder<S, P>
  ): FC<P>;
  native<P, S>(
    component: Component<P> | FunctionComponent<P> | (new (props: P) => any),
    builder: StyleBuilder<S, P>
  ): FC<P>;
};

const nativeStyleCombiner = <S extends any>(
  styles: S[],
  props: Record<string, any>
) => {
  return { style: [props.style, styles] };
};

const webStyleCombiner = <S extends any>(
  styles: S[],
  props: Record<string, any>
) => {
  return {
    className: props.className
      ? [props.className, ...styles].join(" ")
      : styles.join(" "),
  };
};

const createStyled = <P, S>(
  component: ComponentType<P>,
  builder: StyleBuilder<S, P>,
  combinder: StyleCombiner<S, any>
) => {
  return stable((props: P) => {
    const stableStyles = builder(props);
    const createComponentWithStyles = (styles: S | S[]) => {
      const styleProps = combinder(
        Array.isArray(styles) ? styles : [styles],
        props
      );

      return createElement(component as any, { ...props, ...styleProps });
    };

    if (typeof stableStyles === "function") {
      return () => createComponentWithStyles((stableStyles as Function)());
    }

    return createComponentWithStyles(stableStyles);
  });
};

const styled = Object.assign(createStyled, {
  web<P, S>(component: ComponentType<P>, builder: StyleBuilder<S, P>) {
    return createStyled(component, builder, webStyleCombiner);
  },
  native<P, S>(component: ComponentType<P>, builder: StyleBuilder<S, P>) {
    return createStyled(component, builder, nativeStyleCombiner);
  },
}) as Styled;

export {
  StyleCombiner,
  StyleBuilder,
  styled,
  webStyleCombiner,
  nativeStyleCombiner,
};
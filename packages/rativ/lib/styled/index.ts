import { Component, createElement, FC, FunctionComponent } from "react";
import { stable } from "../main";

type StyleCombiner<S, R> = (styles: S[], props: Record<string, any>) => R;

type StyleBuilder<S, P> = S | ((props: P) => S | S[] | (() => S | S[]));

type ComponentType<P> =
  | Component<P>
  | FunctionComponent<P>
  | (new (props: P) => any);

type Styled = {
  /**
   * create styled component with custom style combiner
   */
  <P, S>(
    componentBase: ComponentType<P>,
    styleBuilder: StyleBuilder<S, P>,
    styleCombinder: StyleCombiner<S, any>
  ): FC<P>;

  <P, M, S>(
    componentBase: ComponentType<M>,
    styleBuilder: StyleBuilder<S, P>,
    styleCombinder: StyleCombiner<S, any>,
    propMapper: (props: P) => M
  ): FC<P>;

  /**
   * create styled web component
   * @param componentBase
   * @param styleBuilder
   */
  web<P, S>(
    componentBase: ComponentType<P>,
    styleBuilder: StyleBuilder<S, P>
  ): FC<P>;

  web<P, M, S>(
    componentBase: ComponentType<M>,
    styleBuilder: StyleBuilder<S, P>,
    propMapper: (props: P) => M
  ): FC<P>;

  /**
   * create styled native component
   * @param componentBase
   * @param styleBuilder
   */
  native<P, S>(
    componentBase: ComponentType<P>,
    styleBuilder: StyleBuilder<S, P>
  ): FC<P>;

  native<P, M, S>(
    componentBase: ComponentType<M>,
    styleBuilder: StyleBuilder<S, P>,
    propMapper: (props: P) => M
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
  componentBase: ComponentType<P>,
  styleBuilder: StyleBuilder<S, P>,
  styleCombiner: StyleCombiner<S, any>,
  propMapper?: Function
) => {
  return stable((props: P) => {
    const stableStyles =
      typeof styleBuilder === "function"
        ? (styleBuilder as Function)(props)
        : styleBuilder;
    const createComponentWithStyles = (styles: S | S[]) => {
      const styleProps = styleCombiner(
        Array.isArray(styles) ? styles : [styles],
        props
      );
      let customProps = { ...props, ...styleProps };

      if (propMapper) customProps = propMapper(customProps);

      return createElement(componentBase as any, customProps);
    };

    if (typeof stableStyles === "function") {
      return () => createComponentWithStyles((stableStyles as Function)());
    }

    return createComponentWithStyles(stableStyles);
  });
};

const styled = Object.assign(createStyled, {
  web<P, S>(
    component: ComponentType<P>,
    builder: StyleBuilder<S, P>,
    mapper?: Function
  ) {
    return createStyled(component, builder, webStyleCombiner, mapper);
  },
  native<P, S>(
    component: ComponentType<P>,
    builder: StyleBuilder<S, P>,
    mapper?: Function
  ) {
    return createStyled(component, builder, nativeStyleCombiner, mapper);
  },
}) as Styled;

export {
  StyleCombiner,
  StyleBuilder,
  styled,
  webStyleCombiner,
  nativeStyleCombiner,
};

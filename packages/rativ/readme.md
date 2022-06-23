- [Installation](#installation)
- [Motivation](#motivation)

#`Rativ`

A React library for creating reactive components

## Installation

**with NPM**

```bash
npm i reslot --save
```

**with YARN**

```bash
yarn add reslot
```

## Motivation

This library is inspired by SolidJS. A component is divided into 2 parts: Stable and Unstable. Stable part contains the declarations that are fixed since initialization phase, they runs once only, Unstable part contains the changes that are re-rendered continuously by changes of the component itself or its parent. Stable part cannot contains any React hook but Unstable part can

```js
import { stable } from "rativ";

const MyComp = stable((props) => {
  // Stable part
  let myvar = 0;

  // Unstable part, it acts like functional component body
  return () => {
    useState();
    // return React node as usual
    return <div></div>;
  };
});
```

With a stable part, we can declare stable variables, and functions, which means we don't need useRef, useMemo, useCallback any more. However, we need those hooks if we need variables that can be updated when component props are changed

```js
const MyComp = stable((props) => {
  // we don't need useMemo() hook
  const computedValue = doHeavyComputationWithProps(props);
  // we don't need useRef() hook
  let stableVariable = 0;
  // we don't need useCallback() or useEvent() to optimize this
  const handleClick = () => {
    // the props object is always up to date
    // so DO NOT destruct it
    alert(props.name);
  };

  return () => {
    // if we need a variable that can update when props updated, just put it in unstable part
    const dynamicVariable = useMemo(() => {}, [props.something]);
    return <button onClick={handleClick}></button>;
  };
});
```

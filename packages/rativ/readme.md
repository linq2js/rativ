- [`Rativ`](#rativ)
  - [Installation](#installation)
  - [Motivation](#motivation)
  - [Concepts](#concepts)
  - [Recipes](#recipes)
    - [Every callbacks are stable](#every-callbacks-are-stable)
    - [Amazing signals](#amazing-signals)
    - [Performance Test](#performance-test)
  - [Caveats](#caveats)
    - [Do not destruct props object](#do-not-destruct-props-object)
  - [API reference](#api-reference)

# `Rativ`

A React library for creating reactive components

## Installation

**with NPM**

```bash
npm i rativ --save
```

**with YARN**

```bash
yarn add rativ
```

## Motivation

This library is inspired by SolidJS. Rativ aims to optimize React app in the best way, so it provides many ways to achieve that goal.

## Concepts

A stable component is divided into 2 parts: Stable and Unstable parts. Stable part contains the declarations that are fixed since initialization phase, they runs once only, Unstable part contains the changes that are re-rendered continuously by changes of the component itself or its parent. Stable part cannot contains any React hook but Unstable part can

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
    // the props object is always fresh
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

## Recipes

### Every callbacks are stable

You often have optimization problems with callbacks, Rativ will free you from those.
Let's get check the example below

```js
const ParentComponent = () => {
  const rerender = useState()[1];
  // this callback will be recreated every time the component re-renders
  const childCallback = () => {};

  return <>
    <ChildComponent callback={callback}>
    <button onClick={() => rerender({})}>Re-render</button>
  </>
};
```

If the child component is not stable component, you must use useEvent() or similar library to make the childCallback() stable before passing it to child component. That makes you code more complex.
Rative does that for you automatically

```js
const ChildComponent = stable((props) => {
  const customCallback = () => {
    props.callback();
  };

  // THIS STABLE PART, you can return React Node for rendering UI or UNSTABLE PART where you can use React hooks to control rendering
  return (
    <div>
      {
        // props.callback is stable, no matter the callback is changed by parent component
        // so it does not make OtherChildComponent re-render
        // and customCallback is stable too
      }
      <OtherChildComponent onClick={props.callback} callback={customCallback} />
    </div>
  );
});
```

### Amazing signals

Rativ provides signal logic, it is similar to a store or pub/sub logic. You can store data with signal and receive updates everywhere. You can use signal locally or globally, it depends on kind of your data

```js
import { singal, stable } from "rativ";

// use signal globally
const themeSignal = signal("light");

const ThemeSwitcher = stable(() => {
  const changeTheme = () =>
    themeSignal.set((prev) => (prev === "dark" ? "light" : "dark"));

  // return unstable part, that will re-render evertime themeSignal updated
  return () => <button onClick={changeTheme}>{themeSignal.get()}</button>;
});

const Counter = stable(() => {
  // use signal locally
  const countSignal = signal(0);
  const increment = () => countSignal.set((prev) => prev + 1);

  // this unstable part will re-render when countSignal or themeSignal updated
  return () => {
    // receive data from global signal
    const theme = themeSignal.get();

    const style =
      theme === "dark"
        ? { backgroundColor: "black", color: "white" }
        : { backgroundColor: "white", color: "black" };

    return (
      <div style={style}>
        <h1>{countSignal.get()}</h1>
        <button onClick={increment}>Increment</button>
      </div>
    );
  };
});
```

There are 3 kinds of signal: computed, emittable, and normal signals

```js
// normal signal, you can update it by using set() function or assign new value to countSignal.state
const countSignal = signal(0);
const factorSignal = signal(1);

// contruct computed signal. The computed signal retrieves the computed function, this function will be called every time its dependency signals are updated
// in this case, it depends on countSignal and factorSignal
const bigCountSignal = signal(() => {
  return countSignal.get() * factorSignal.get();
});
// you can update the computed signal, but you must be aware that when its dependency signals are changed, it receives a new value from a computed function
const accessTokenSignal = signal("USER_ACCESS_TOKEN");
// computed signal can works with async function
const userProfileSignal = signal(async () => {
  const accessToken = accessTokenSignal.get();
  if (!accessToken) return { name: "Anonymous" };
  const profile = await getUserProfile(accessToken);
  return pofile;
});

const updateEmail = async (email) => {
  // call API to update profile email
  await updateEmail(userProfileSignal.get().id, email);
  // update signal state to make sure all UI are updated as well
  userProfileSignal.set((prev) => ({
    ...prev,
    email,
  }));
};

const logout = () => {
  // after clearing access token, userProfileSignal will re-compute and its stable will be { name: "Anonymous" }
  accessTokenSignal.set("");
};

// construct emittable signal, the emittable signal retrieves a reducer (yep, it is like Redux reducer)
const counterSignal = signal(0, (state, action) => {
  if (action === "increment") return state + 1;
  if (action === "decrement") return state - 1;
  return state;
});

counterSignal.emit("increment");
counterSignal.emit("decrement");
```

### Performance Test

https://codesandbox.io/s/rativ-performance-smuok9?file=/src/App.js

## Caveats

### Do not destruct props object

The props object is always fresh, you can access the latest prop values with ease. If you try to destruct prop values, your values might be stale afterward

RIGHT

```js
const GreetingButton = stable((props) => {
  const onClick = () => {
    alert(props.message);
  };
  return <button onClick={onClick}>Say Hi</button>;
});
```

WRONG

```js
const GreetingButton = stable(({ message }) => {
  const onClick = () => {
    alert(message);
  };
  return <button onClick={onClick}>Say Hi</button>;
});
```

## API reference

https://linq2js.github.io/rativ/

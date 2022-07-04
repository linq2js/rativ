- [`Rativ`](#rativ)
  - [Installation](#installation)
  - [Motivation](#motivation)
  - [Concepts](#concepts)
  - [Recipes](#recipes)
    - [Every callbacks are stable](#every-callbacks-are-stable)
    - [Amazing atoms](#amazing-atoms)
    - [Dealing with async data](#dealing-with-async-data)
    - [Selective update with Slots](#selective-update-with-slots)
    - [Element directive](#element-directive)
    - [Mutation helpers](#mutation-helpers)
    - [Performance Test](#performance-test)
  - [Caveats](#caveats)
    - [Do not destruct props object](#do-not-destruct-props-object)
    - [Taking snapshot of atom](#taking-snapshot-of-atom)
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

If you think you component does not need to re-render any more, just returning React node instead of unstable part

```js
const StableGreating = stable((props) => {
  // Even though the component doesn't re-render, the values of the props are still up to date
  return <button onClick={() => alert(props.message)}>Greeting</button>;
});
// The above component works different this memoized component
const MemoizedGreating = memo((props) => {
  // this component will re-render when message prop changed and returns new React node with new callback
  return <button onClick={() => alert(props.message)}>Greeting</button>;
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

### Amazing atoms

Rativ provides atom logic, it is similar to a store or pub/sub logic. You can store data with atom and receive updates everywhere. You can use atom locally or globally, it depends on kind of your data

```js
import { singal, stable } from "rativ";

// use atom globally
const themeAtom = atom("light");

const ThemeSwitcher = stable(() => {
  const changeTheme = () =>
    themeAtom.set((prev) => (prev === "dark" ? "light" : "dark"));

  // return unstable part, that will re-render evertime themeAtom updated
  return () => <button onClick={changeTheme}>{themeAtom.get()}</button>;
});

const Counter = stable(() => {
  // use atom locally
  const countAtom = atom(0);
  const increment = () => countAtom.set((prev) => prev + 1);

  // this unstable part will re-render when countAtom or themeAtom updated
  return () => {
    // receive data from global atom
    const theme = themeAtom.get();

    const style =
      theme === "dark"
        ? { backgroundColor: "black", color: "white" }
        : { backgroundColor: "white", color: "black" };

    return (
      <div style={style}>
        <h1>{countAtom.get()}</h1>
        <button onClick={increment}>Increment</button>
      </div>
    );
  };
});
```

There are 3 kinds of atom: computed, emittable, and updatable atoms

```js
import { task, atom } from "rative";
// normal atom, you can update it by using set() function or assign new value to countAtom.state
const countAtom = atom(0);
const factorAtom = atom(1);

// contruct computed atom. The computed atom retrieves the computed function, this function will be called every time its dependency atoms are updated
// in this case, it depends on countAtom and factorAtom
const bigCountAtom = atom(() => {
  return countAtom.get() * factorAtom.get();
});
// you can update the computed atom, but you must be aware that when its dependency atoms are changed, it receives a new value from a computed function
const accessTokenAtom = atom("USER_ACCESS_TOKEN");

const getUserProfile = (token) =>
  fetch("API_URL", { headers: { authorization: token } }).then((res) =>
    res.json()
  );

const userProfileAtom = atom(() => {
  // define tasks, the task runs once
  // the task uses to handle async call or heavy computation
  const getUserProfileTask = task(getUserProfile);
  // similar tasks
  const delayIn10msTask = task(() => delay(10));
  const delayIn20msTask = task(() => delay(20));
  // DO NOT DO THIS
  const delayTask = task(delay); // delayTask(10); delayTask(20);

  const accessToken = accessTokenAtom.get();
  if (!accessToken) return { name: "Anonymous" };
  // no await needed
  const profile = getUserProfileTask(accessToken);
  return pofile;
});

const updateEmail = async (email) => {
  // call API to update profile email
  await updateEmail(userProfileAtom.get().id, email);
  // update atom state to make sure all UI are updated as well
  userProfileAtom.set((prev) => ({
    ...prev,
    email,
  }));
};

const logout = () => {
  // after clearing access token, userProfileAtom will re-compute and its stable will be { name: "Anonymous" }
  accessTokenAtom.set("");
};

// construct emittable atom, the emittable atom retrieves a reducer (yep, it is like Redux reducer)
const counterAtom = atom(0, (state, action) => {
  if (action === "increment") return state + 1;
  if (action === "decrement") return state - 1;
  return state;
});

counterAtom.emit("increment");
counterAtom.emit("decrement");
```

To handle atom changes, you can use `watch` function. A `watch` function retrieves changeSelector and options

```js
const a = atom(1);
const b = atom(2);
let sum: number;

// when result of a plus b is changed, the watch callback will be called
watch(
  () => a.get() + b.get(),
  (result) => {
    console.log("result:", result);
  }
);

// OR we can pass only the watching change function, the function will be called immediately after watching starts and whenever the atoms that it depends on changed
watch(() => {
  sum = a.get() + b.get();
});
console.log(sum); // CONSOLE: 3

a.state++;
// CONSOLE: result: 4
```

### Dealing with async data

Atom can handle async with ease

```js
const user = atom(
  fetch("https://jsonplaceholder.typicode.com/users/1").then((res) =>
    res.json()
  )
);
console.log(user.loading); // true
console.log(user.state); // undefined
// wait in few seconds
console.log(user.loading); // false
console.log(user.state);
/*
{
  "id": 1,
  "name": "Leanne Graham",
  "username": "Bret",
  "email": "Sincere@april.biz",
  "address": {
    "street": "Kulas Light",
    "suite": "Apt. 556",
    "city": "Gwenborough",
    "zipcode": "92998-3874",
    "geo": {
      "lat": "-37.3159",
      "lng": "81.1496"
    }
  },
  "phone": "1-770-736-8031 x56442",
  "website": "hildegard.org",
  "company": {
    "name": "Romaguera-Crona",
    "catchPhrase": "Multi-layered client-server neural-net",
    "bs": "harness real-time e-markets"
  }
}
*/

// assigning promise object to atom
user.set(
  fetch("https://jsonplaceholder.typicode.com/users/1").then((res) =>
    res.json()
  )
);

// the above example equivalents to this
user.set(async (prev) => {
  const res = await fetch("https://jsonplaceholder.typicode.com/users/1");
  return await res.json();
});
```

Async counter example

```js
import { delay, atom, slot } from "rativ";

const count = atom(0);
const increment = () => count.set((prev) => delay(1000).then(() => prev + 1));

const CounterWithoutSlot = stable(() => {
  // a promise object will be thrown if trying access state of processing atom
  // Suspense will handle a promise object and show fallback
  return () => (
    // unstable part
    <h1 onClick={incrementAsync}>{count.get()}</h1>
  );
});

// with slot, dont need to wrap this component by Suspense
// we can control loading state inside this component
const CounterWithSlot = stable(() => {
  // return React node instead of unstable part
  return (
    <Suspense fallback="Custom processing message">{slot(count)}</Suspense>
  );
});

const App = () => {
  return (
    <>
      <Suspense fallback="Processing...">
        <CounterWithoutSlot />
        <CounterWithSlot />
      </Suspense>
    </>
  );
};
```

### Selective update with Slots

Sometimes you need some selective parts of the component re-render and keep other parts are stable, you can achieve that goal with slots. Slot can be used with any component type (normal React component and stable component)

```js
const theme = atom("dark");

const Counter = stable(() => {
  const count = atom(0);

  // we returns React node instead of unstable part, that means the button does not re-render any more
  return (
    <>
      <button>
        Counter:
        {
          // we still need display current count value
          slot(count) // this equipvalent to slot(() => count.get())
        }
      </button>
      Theme: {
        // slot can be used with local/global atoms
        slot(theme)
      }
    </>
  );
});

// using slot with normal React component
const DataView = () => {
  return (
    <>
      <BigDataTable />
      Theme {slot(theme)}
    </>
  );
};
```

Slot can work with local/global mode

```js
const theme = atom("dark");
// better performance than local slot
const themeSlot = slot(theme);

const DataView = () => {
  return (
    <>
      <BigDataTable />
      Local Theme Slot: {slot(theme)}
      Global Theme Slot: {themeSlot}
    </>
  );
};
```

### Element directive

Rativ supports directives through the `directive` function. This is just a side effect over the ref, but is useful in that it resembles typical bindings and there can be multiple bindings on the same element without conflict. This makes it a better tool for reusable DOM element behavior.

```js
import { directive } from "rativ";
// define clickOutside directive
const clickOutside = (onClick) => {
  // return a directive body
  return (element: HTMLElement) => {
    const handleClick = (e: any) => !element.contains(e.target) && onClick();
    document.body.addEventListener("click", handleClick);
    return () => {
      document.body.removeEventListener("click", handleClick);
    };
  };
};

const Modal = stable(() => {
  const show = atom(true);
  const showModal = () => show.set(true);
  const hideModal = () => show.set(false);
  const modalRef = directive(clickOutside(hideModal)); // it also support multiple directives directive([dir1, dir2, dir3, ...])

  return () => (
    <>
      {!show.get() && <button onClick={showModal}>Show modal</button>}
      {show.get() && (
        <div className="modal" ref={modalRef}>
          Modal contents
        </div>
      )}
    </>
  );
});
```

### Mutation helpers

Rativ provides a slot of mutation helpers, that helps you to mutate atom state with ease, chaining update

```js
import { sort, prop, item, push, add, toggle, push } from "rative/mutation";

const complexData = atom({
  userCount: 1,
  token: "",
  todos: [
    { id: 1, title: "Todo 1", completed: true },
    { id: 2, title: "Todo 2", completed: false },
  ],
});

complexData.mutate(
  // increse userCount
  prop("userCount", add(10)),
  // change token value
  prop("token", () => Math.random().toString()),
  prop(
    "todos",
    // update items that match predicate
    item(
      (todo) => todo.id === 1,
      // rename todo
      prop("title", () => "TODO 1"),
      // toggle the boolean value
      prop("completed", toggle())
    ),
    // remove todo(2) from the todos array
    exclude((todo) => todo.id === 2),
    push({ id: 3, title: "Todo 3" }, { id: 4, title: "Todo 4" }),
    // sort the todo list by title
    sort((x) => x.asc("title")) // this equipvalents to sort(x => x.asc(todo => todo.title))
  )
);
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

### Taking snapshot of atom

Rativ atom can create and revert snapshot with ease. The atom snapshot is useful for writing unit testing

```js
import { snapshot, atom } from "rativ";

const count = atom(0);
count.state++; // count = 1
// create a snapshot from current state
const revertCount1 = count.snapshot();
count.state++; // count = 2
reverCount1();
count.state; // count = 1
count.state++; // count = 2
// create a snapshot with initial state
const revertCount2 = count.snapshort(true);
count.state; // count = 0
reverCount1();
count.state; // count = 2

// create snapshot for multiple atoms
const revertAll = snapshot([atom1, atom2] /*, reset  */);

// execute the callback with new snapshots (from current state) of atom1 and atom2
// after callback done, the input atoms are reverted automatically
snapshot([atom1, atom2], callback);

// execute the callback with new snapshots (from initial state) of atom1 and atom2
snapshot([atom1, atom2], reset, callback);
```

## API reference

https://linq2js.github.io/rativ/

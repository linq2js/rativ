import React, { Suspense, useState } from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { delay, Atom, atom, wait } from "../lib/main";
import { defaultProps, effect, slot, stable, Refs } from "../lib/react";
import { signal } from "../lib/saga";

test("default props", () => {
  const Component = stable((props: { message?: string }) => {
    defaultProps(props, { message: "Hello World" });

    return () => <div data-testid="output">{props.message}</div>;
  });
  const { getByTestId } = render(<Component />);
  expect(getByTestId("output").textContent).toBe("Hello World");
});

test("counter", () => {
  const Component = stable(() => {
    const count = atom(0);
    const increment = () => count.set((prev) => prev + 1);
    return () => (
      <button data-testid="output" onClick={increment}>
        {count.get()}
      </button>
    );
  });
  const { getByTestId } = render(<Component />);
  expect(getByTestId("output").textContent).toBe("0");
  fireEvent.click(getByTestId("output"));
  expect(getByTestId("output").textContent).toBe("1");
});

test("dispose local atoms", () => {
  const globalAtom = atom(1);
  let localAtom: Atom<number> | undefined;
  const Component = stable(() => {
    localAtom = atom(() => globalAtom.get() * 2);
    return () => <div data-testid="output">{localAtom?.get()}</div>;
  });
  const { getByTestId, unmount } = render(<Component />);
  expect(getByTestId("output").textContent).toBe("2");
  act(() => {
    globalAtom.state++;
  });
  expect(getByTestId("output").textContent).toBe("4");
  unmount();
  expect(localAtom?.state).toBe(4);
  // try to change the global atom and make sure the local atom is not affected
  globalAtom.state++;
  expect(localAtom?.state).toBe(4);
});

test("suspense", async () => {
  const loadDataAtom = atom(() => wait(delay(10), () => 10));
  const Component = stable(() => {
    return (
      <Suspense fallback={<div data-testid="loading"></div>}>
        <div data-testid="output">{slot(loadDataAtom)}</div>
      </Suspense>
    );
  });
  const { getByTestId } = render(<Component />);
  getByTestId("loading");
  await act(() => delay(20));
  expect(getByTestId("output").textContent).toBe("10");
});

test("rerender", async () => {
  let updateCount = 0;
  const count = atom(
    () => {
      return wait(delay(10), () => 100);
    },
    { key: "count" }
  );
  const factor = atom(1, { key: "factor" });
  const result = atom(
    () => {
      return wait([count, factor], ([count, factor]) => count * factor);
    },
    { key: "result" }
  );
  result.on(() => {
    updateCount++;
  });
  const Component = stable(() => () => (
    <div data-testid="output">{result.get()}</div>
  ));
  const Wrapper = () => (
    <Suspense fallback={<div data-testid="loading" />}>
      <Component />
    </Suspense>
  );
  const { getByTestId } = render(<Wrapper />);
  getByTestId("loading");
  await act(() => delay(20));
  expect(getByTestId("output").textContent).toEqual("100");
  act(() => {
    factor.state++;
  });
  await act(() => delay(20));

  expect(getByTestId("output").textContent).toEqual("200");
  act(() => {
    factor.state++;
  });
  await act(() => delay(20));
  expect(getByTestId("output").textContent).toEqual("300");
  expect(updateCount).toBe(3);
});

test("onRender", () => {
  const clicked = signal();
  let renderCount = 0;
  const doSomething = () => {
    effect(
      () => {},
      () => {
        const rerender = useState<any>()[1];
        clicked.on(() => {
          rerender({});
        });
      }
    );
  };
  const Component = stable(() => {
    doSomething();
    return () => {
      renderCount++;
      return null;
    };
  });
  render(<Component />);
  expect(renderCount).toBe(1);
  act(() => {
    clicked();
  });
  expect(renderCount).toBe(2);
});

test("ref", () => {
  let count = 0;
  const Component = stable((_, refs: Refs<{ count: number }>) => {
    refs.count = 1;

    return () => {
      refs.count++;
      count = refs.count;
      return null;
    };
  });
  render(<Component />);
  expect(count).toBe(2);
});

test("stable function", () => {
  const Stable = stable((props: { onPress: () => void }) => {
    return <button data-testid="button" onClick={props.onPress} />;
  });

  const Counter = () => {
    const [count, setCount] = useState(0);
    return (
      <>
        <Stable onPress={() => setCount(count + 1)} />
        <div data-testid="output">{count}</div>
      </>
    );
  };

  const { getByTestId } = render(<Counter />);

  expect(getByTestId("output").textContent).toBe("0");
  act(() => {
    fireEvent.click(getByTestId("button"));
  });
  expect(getByTestId("output").textContent).toBe("1");
  act(() => {
    fireEvent.click(getByTestId("button"));
  });
  expect(getByTestId("output").textContent).toBe("2");
});

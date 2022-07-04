import React, { Suspense } from "react";
import { act, fireEvent, render } from "@testing-library/react";
import {
  defaultProps,
  delay,
  Atom,
  atom,
  slot,
  stable,
  task,
} from "../lib/main";

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
  const globalSignal = atom(1);
  let localSignal: Atom<number> | undefined;
  const Component = stable(() => {
    localSignal = atom(() => globalSignal.get() * 2);
    return () => <div data-testid="output">{localSignal?.get()}</div>;
  });
  const { getByTestId, unmount } = render(<Component />);
  expect(getByTestId("output").textContent).toBe("2");
  act(() => {
    globalSignal.state++;
  });
  expect(getByTestId("output").textContent).toBe("4");
  unmount();
  expect(localSignal?.state).toBe(4);
  // try to change the global signal and make sure the local signal is not affected
  globalSignal.state++;
  expect(localSignal?.state).toBe(4);
});

test("suspense", async () => {
  const loadDataSignal = atom(() => {
    const delayTask = task(() => delay(10));
    delayTask();
    return 10;
  });
  const Component = stable(() => {
    return (
      <Suspense fallback={<div data-testid="loading"></div>}>
        <div data-testid="output">{slot(loadDataSignal)}</div>
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
  const count = atom(() => {
    const delayTask = task(delay);
    delayTask(10);
    return 100;
  });
  const factor = atom(1);
  const result = atom(() => count.get() * factor.get());
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
  expect(getByTestId("output").textContent).toEqual("200");
  act(() => {
    factor.state++;
  });
  expect(getByTestId("output").textContent).toEqual("300");
  expect(updateCount).toBe(4);
});

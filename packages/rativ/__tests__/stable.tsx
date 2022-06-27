import React from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { defaultProps, Signal, signal, stable } from "../lib/main";

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
    const count = signal(0);
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

test("dispose local signals", () => {
  const globalSignal = signal(1);
  let localSignal: Signal<number> | undefined;
  const Component = stable(() => {
    localSignal = signal(() => globalSignal.get() * 2);
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

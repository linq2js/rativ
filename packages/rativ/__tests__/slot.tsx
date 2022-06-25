import React from "react";
import { signal, slot, stable } from "../lib/main";
import { act, fireEvent, render } from "@testing-library/react";

test("slot with signal", () => {
  let renderCount = 0;
  const OtherComponent = () => {
    renderCount++;
    return <h1>Other</h1>;
  };
  const Component = stable(() => {
    const count = signal(0);

    return (
      <>
        <OtherComponent />
        <h1 data-testid="output">{slot(count)}</h1>
        <button data-testid="button" onClick={() => count.state++}>
          Increment
        </button>
      </>
    );
  });
  const { getByTestId } = render(<Component />);
  expect(getByTestId("output").textContent).toBe("0");
  fireEvent.click(getByTestId("button"));
  expect(getByTestId("output").textContent).toBe("1");
  expect(renderCount).toBe(1);
});

test("slot with computed function", () => {
  let renderCount = 0;
  const OtherComponent = () => {
    renderCount++;
    return <h1>Other</h1>;
  };

  // even we can put signals outside the component
  const a = signal(1);
  const b = signal(2);

  const Component = () => {
    return (
      <>
        <OtherComponent />
        <h1 data-testid="output">{slot(() => a.get() + b.get())}</h1>
      </>
    );
  };

  const { getByTestId } = render(<Component />);
  expect(getByTestId("output").textContent).toBe("3");
  act(() => {
    a.state++;
  });
  expect(getByTestId("output").textContent).toBe("4");
  act(() => {
    b.state++;
  });
  expect(getByTestId("output").textContent).toBe("5");
  expect(renderCount).toBe(1);
});

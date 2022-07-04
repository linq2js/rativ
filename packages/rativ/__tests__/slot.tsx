import React from "react";
import { atom, slot, stable } from "../lib/main";
import { act, fireEvent, render } from "@testing-library/react";

test("slot with atom", () => {
  let renderCount = 0;
  const OtherComponent = () => {
    renderCount++;
    return <h1>Other</h1>;
  };
  const Component = stable(() => {
    const count = atom(0);

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

  // even we can put atoms outside the component
  const a = atom(1);
  const b = atom(2);

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

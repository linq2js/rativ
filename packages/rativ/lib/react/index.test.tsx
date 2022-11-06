import React from "react";
import { atom } from "../main";
import { stable } from ".";
import { render, act } from "@testing-library/react";
import { push } from "../mutation";

test("stable comp with global atom", () => {
  const globalAtom = atom<number[]>([]);
  const Child = stable(() => {
    // reset atom
    globalAtom.set([1]);

    return () => <div data-testid="value">{globalAtom().toString()}</div>;
  });
  const showChildAtom = atom(true);
  const App = stable(() => {
    return () => (showChildAtom() ? <Child /> : <div data-testid="nothing" />);
  });

  const { getByTestId } = render(<App />);

  expect(getByTestId("value").textContent).toBe("1");

  act(() => {
    // change atom value
    globalAtom.mutate(push(2));
  });

  expect(getByTestId("value").textContent).toBe("1,2");

  act(() => {
    // hide Child
    showChildAtom.set(false);
  });

  getByTestId("nothing");

  act(() => {
    // show Child again
    showChildAtom.set(true);
  });

  expect(getByTestId("value").textContent).toBe("1");

  act(() => {
    // change atom value
    globalAtom.mutate(push(2));
  });

  expect(getByTestId("value").textContent).toBe("1,2");
});

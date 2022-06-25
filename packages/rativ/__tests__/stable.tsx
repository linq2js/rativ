import React from "react";
import { render } from "@testing-library/react";
import { defaultProps, stable } from "../lib/main";

test("default props", () => {
  const Component = stable((props: { message?: string }) => {
    defaultProps(props, { message: "Hello World" });

    return () => <div data-testid="output">{props.message}</div>;
  });
  const { getByTestId } = render(<Component />);
  expect(getByTestId("output").textContent).toBe("Hello World");
});

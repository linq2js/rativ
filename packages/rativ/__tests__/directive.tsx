import React from "react";
import { directive, signal, stable } from "../lib/main";
import { fireEvent, render } from "@testing-library/react";

test("click outside", () => {
  const clickOutside = (onClick: VoidFunction) => {
    // return a directive body
    return (element: HTMLElement) => {
      const handleClick = (e: any) => !element.contains(e.target) && onClick();
      document.body.addEventListener("click", handleClick);
      return () => {
        document.body.removeEventListener("click", handleClick);
      };
    };
  };
  const Component = stable(() => {
    const showModal = signal(true);
    // create directive
    const modalRef = directive(
      clickOutside(() => {
        // hide modal if click outside
        showModal.set(false);
      })
    );

    return () => (
      <div data-testid="overlay">
        <div data-testid="output">
          {showModal.get() && <div ref={modalRef}>Modal</div>}
        </div>
      </div>
    );
  });

  const { getByTestId } = render(<Component />);
  // the modal element is visible now
  expect(getByTestId("output").textContent).toBe("Modal");
  // click on the overlay element
  fireEvent.click(getByTestId("overlay"));
  // the modal element should be hidden
  expect(getByTestId("output").textContent).toBe("");
});

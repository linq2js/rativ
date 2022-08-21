import { rearg } from "./main";

test("rearg", () => {
  const sum = (a: number, b: number) => a + b;
  expect(rearg(sum, 2)(1, 2, 3, 4)).toBe(7);
  expect(rearg(sum, [1, 3])(1, 2, 3, 4)).toBe(6);
});

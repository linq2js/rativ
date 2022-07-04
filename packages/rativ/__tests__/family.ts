import { family, atom } from "../lib/main";

test("single key", () => {
  const counterFamily = family((initial: number) => atom(initial));
  const counter1 = counterFamily.get(1);
  const counter2 = counterFamily.get(2);
  expect(counter1.state).toBe(1);
  expect(counter2.state).toBe(2);
});

test("multiple keys", () => {
  const sumFamily = family((a: number, b: number) => atom(a + b));
  const sum1 = sumFamily.get(1, 2);
  const sum2 = sumFamily.get(3, 4);
  expect(sum1.state).toBe(3);
  expect(sum2.state).toBe(7);
});

test("delete", () => {
  const sumFamily = family((a: number, b: number) => atom(a + b));
  expect(sumFamily.has(1, 2)).toBe(false);
  expect(sumFamily.has(3, 4)).toBe(false);
  const sum1 = sumFamily.get(1, 2);
  const sum2 = sumFamily.get(3, 4);
  expect(sum1.state).toBe(3);
  expect(sum2.state).toBe(7);
  expect(sumFamily.has(1, 2)).toBe(true);
  expect(sumFamily.has(3, 4)).toBe(true);
  sumFamily.delete(1, 2);
  expect(sumFamily.has(1, 2)).toBe(false);
});

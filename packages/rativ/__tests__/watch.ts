import { atom, watch } from "../lib/main";

test("watch", () => {
  let result = 0;
  const a = atom(1);
  const b = atom(2);

  const unwatch = watch(() => a.get() + b.get(), {
    callback: (x) => (result = x),
  });

  expect(result).toBe(0);
  a.state++;
  expect(result).toBe(4);
  a.state++;
  expect(result).toBe(5);

  unwatch();
  a.state++;
  expect(result).toBe(5);
});

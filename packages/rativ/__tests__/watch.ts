import { signal, watch } from "../lib/main";

test("watch", () => {
  let result = 0;
  const a = signal(1);
  const b = signal(2);

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

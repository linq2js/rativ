import { signal, wait } from "./main";
import { delay } from "./util";

test("simple siganl", () => {
  const a = signal(0);
  expect(a.state).toBe(0);
  a.state++;
  expect(a.state).toBe(1);
  a.set((prev) => prev + 1);
  expect(a.state).toBe(2);
  // reset state
  a.reset();
  expect(a.state).toBe(0);
});

test("sync computed signal", () => {
  const a = signal(1);
  const b = signal(2);
  const sum = signal(() => a.get() + b.get());
  expect(sum.state).toBe(3);
  a.state++;
  expect(sum.state).toBe(4);
  b.state++;
  expect(sum.state).toBe(5);
});

test("async computed signal", async () => {
  const a = signal(1);
  const b = signal(2);
  const sum = signal(() => a.get() + b.get());
  expect(sum.state).toBe(3);
  a.set(delay(10, 2));
  expect(sum.loading).toBe(true);
  await delay(15);
  expect(sum.state).toBe(4);
  // allow updating for computed signal
  sum.state = 100;
  expect(sum.state).toBe(100);
  // but if dependency signals changed, it is still invalidated again
  a.set(delay(10, 3));
  await delay(15);
  expect(sum.state).toBe(5);
  sum.state = 100;
  expect(sum.state).toBe(100);
});

test("wait all", async () => {
  const a = signal(delay(10, 1));
  const b = signal(delay(5, 2));
  expect(a.loading).toBe(true);
  expect(b.loading).toBe(true);
  const sum = signal(() => {
    const [av, bv] = wait([a, b]);
    return av + bv;
  });
  expect(sum.loading).toBe(true);
  await delay(8);
  // b is completed but sum is still in progress
  expect(b.loading).toBe(false);
  expect(sum.loading).toBe(true);
  await delay(8);
  expect(sum.loading).toBe(false);
  expect(sum.state).toBe(3);
});

test("wait any", async () => {
  const a = signal(delay(10, 1));
  const b = signal(delay(5, 2));
  expect(a.loading).toBe(true);
  expect(b.loading).toBe(true);
  const sum = signal(() => {
    const result = wait({ a, b });
    return "a" in result ? "a" : "b";
  });
  expect(sum.loading).toBe(true);
  await delay(8);
  // b wins
  expect(sum.state).toBe("b");
});

import { signal, snapshot } from "../lib/main";

test("simple snapshot", () => {
  const count = signal(0);
  count.state++;
  expect(count.state).toBe(1);
  const s1 = count.snapshot();
  expect(count.state).toBe(0);
  count.state += 3;
  expect(count.state).toBe(3);
  s1();
  expect(count.state).toBe(1);
});

test("computed snapshot", () => {
  const count = signal(1);
  const double = signal(() => count.get() * 2);
  expect(double.state).toBe(2);
  count.state++;
  expect(double.state).toBe(4);
  snapshot([count, double], () => {
    count.state++;
    expect(double.state).toBe(6);
  });
  // count and double signals are reverted
  expect(double.state).toBe(4);
});

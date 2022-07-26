import { atom, delay, wait } from "../lib/main";

test("simple atom", () => {
  const a = atom(0);
  expect(a.state).toBe(0);
  a.state++;
  expect(a.state).toBe(1);
  a.set((prev) => prev + 1);
  expect(a.state).toBe(2);
  // reset state
  a.reset();
  expect(a.state).toBe(0);
});

test("sync computed atom", () => {
  const a = atom(1);
  const b = atom(2);
  const sum = atom(() => a.get() + b.get());
  expect(sum.state).toBe(3);
  a.state++;
  expect(sum.state).toBe(4);
  b.state++;
  expect(sum.state).toBe(5);
});

test("async computed atom #1", async () => {
  const a = atom(1);
  const b = atom(2);
  const sum = atom(() => wait([a, b], ([a, b]) => a + b));
  await delay();
  expect(sum.state).toBe(3);
  a.set(delay(10, 2));
  expect(sum.loading).toBe(true);
  await delay(15);
  expect(sum.state).toBe(4);
  // allow updating for computed atom
  sum.state = 100;
  expect(sum.state).toBe(100);
  // but if dependency atoms changed, it is still invalidated again
  a.set(delay(10, 3));
  await delay(15);
  expect(sum.state).toBe(5);
  sum.state = 100;
  expect(sum.state).toBe(100);
});

test("wait all", async () => {
  const a = atom(delay(20, 1));
  const b = atom(delay(10, 2));
  expect(a.loading).toBe(true);
  expect(b.loading).toBe(true);
  const sum = atom(() => wait([a, b], ([a, b]) => a + b));
  expect(sum.loading).toBe(true);
  await delay(15);
  // b is completed but sum is still in progress
  expect(b.loading).toBe(false);
  expect(sum.loading).toBe(true);
  await delay(15);
  expect(sum.loading).toBe(false);
  expect(sum.state).toBe(3);
});

test("emittable: sync", () => {
  const emittalbe = atom(0, (state, action: "inc" | "dec") => {
    if (action === "inc") return state + 1;
    if (action === "dec") return state - 1;
    return state;
  });
  expect(emittalbe.state).toBe(0);
  emittalbe.emit("inc");
  expect(emittalbe.state).toBe(1);
  emittalbe.emit("dec");
  expect(emittalbe.state).toBe(0);
});

test("emittable: async", async () => {
  const step = atom(delay(10, 1));
  const emittalbe = atom(0, (state, action: "inc" | "dec") => {
    if (action === "inc") return wait(step, (step) => state + step);
    if (action === "dec") return wait(step, (step) => state - step);
    return state;
  });
  expect(emittalbe.state).toBe(0);
  emittalbe.emit("inc");
  expect(emittalbe.loading).toBe(true);
  expect(emittalbe.state).toBe(0);
  await delay(50);
  expect(step.state).toBe(1);
  expect(step.loading).toBe(false);
  expect(emittalbe.state).toBe(1);
  emittalbe.emit("dec");
  await delay();
  expect(emittalbe.state).toBe(0);
});

test("emittable: init", () => {
  const emittalbe = atom(
    0,
    (state, action: "inc" | "dec" | "init") => {
      if (action === "init") return 100;
      if (action === "inc") return state + 1;
      if (action === "dec") return state - 1;
      return state;
    },
    { initAction: "init" }
  );

  expect(emittalbe.state).toBe(100);
  emittalbe.emit("inc");
  expect(emittalbe.state).toBe(101);
  emittalbe.emit("dec");
  expect(emittalbe.state).toBe(100);
});

test("toJSON", () => {
  expect(JSON.stringify(atom(1))).toBe("1");
  expect(JSON.stringify(atom({ a: 1, b: 2 }))).toBe(
    JSON.stringify({ a: 1, b: 2 })
  );
});

test("async computed atom #2", async () => {
  let updateCount = 0;
  const count = atom(() => wait(delay(10), () => 100), { name: "count" });
  const factor = atom(1, { name: "factor" });
  const result = atom(
    () => wait([count, factor], ([count, factor]) => count * factor),
    { name: "result" }
  );

  result.on(() => {
    updateCount++;
  });

  await delay(20);

  expect(result.state).toEqual(100);
  factor.state++;

  await delay(20);

  expect(result.state).toEqual(200);
  factor.state++;
  await delay(20);
  expect(result.state).toEqual(300);
  expect(updateCount).toBe(4);
});

test("updater", async () => {
  const count = atom(1);
  const update1 = async () => {
    const updater = count.set();
    await delay(10);
    updater.update(1);
  };
  const update2 = () => {
    const updater = count.set();
    updater.update(2);
  };

  update1();
  update2();

  await delay(15);
  expect(count.state).toBe(2);
});

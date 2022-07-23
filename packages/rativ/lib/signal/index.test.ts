import { signal, spawn, delay, Flow } from "./";

test("signal without payload", () => {
  let count = 0;
  const clicked = signal();
  clicked.on(() => count++);
  expect(count).toBe(0);
  clicked();
  expect(count).toBe(1);
  clicked();
  clicked();
  expect(count).toBe(3);
});

test("signal with payload", () => {
  let count = 0;
  const increment = signal<number>();
  increment.on(() => (count += increment.payload()));
  expect(count).toBe(0);
  increment(2);
  expect(count).toBe(2);
});

test("task success", async () => {
  const task = spawn(async () => {
    await delay(10);
    return 1;
  });
  expect(task.status()).toBe("running");
  await delay(15);
  expect(task.status()).toBe("success");
});

test("task error #1", () => {
  const task = spawn(() => {
    throw "invalid";
  });
  expect(task.status()).toBe("error");
});

test("task error #2", async () => {
  const task = spawn(async () => {
    throw "invalid";
  });
  await delay();
  expect(task.status()).toBe("error");
});

test("task should be disposed after done", async () => {
  let disposed = false;
  spawn((context) => {
    context.onDispose(() => (disposed = true));
  });
  expect(disposed).toBeTruthy();
});

test("task should be disposed after error #1", async () => {
  let disposed = false;
  const task = spawn((context) => {
    context.onDispose(() => (disposed = true));
    throw "invalid";
  });
  expect(task.status()).toBe("error");
  expect(disposed).toBeTruthy();
});

test("task should be disposed after error #2", async () => {
  let disposed = false;
  const task = spawn(async (context) => {
    context.onDispose(() => (disposed = true));
    throw "invalid";
  });
  await delay();
  expect(task.status()).toBe("error");
  expect(disposed).toBeTruthy();
});

test("listen signal emit", async () => {
  const clicked = signal<number>();
  let count = 0;
  spawn(({ on }) => {
    const listenTask = on(clicked, (_, value) => {
      count += value;
      if (count >= 3) {
        listenTask.cancel();
      }
    });
  });
  await delay();
  clicked(1);
  expect(count).toBe(1);
  clicked(1);
  expect(count).toBe(2);
  clicked(2);
  expect(count).toBe(4);
  clicked(10);
  clicked(10);
  expect(count).toBe(4);
});

test("debounce", async () => {
  const clicked = signal<number>();
  let count = 0;
  spawn(({ debounce }) => {
    debounce(10, clicked, (_, value) => {
      count += value;
    });
  });
  clicked(1);
  clicked(1);
  clicked(1);
  clicked(1);
  await delay(15);
  expect(count).toBe(1);
  clicked(1);
  await delay(15);
  expect(count).toBe(2);
});

test("throttle", async () => {
  const clicked = signal<number>();
  let count = 0;
  spawn(({ throttle }) => {
    throttle(10, clicked, (_, value) => {
      count += value;
    });
  });
  clicked(1);
  expect(count).toBe(1);
  clicked(1);
  expect(count).toBe(1);
  clicked(1);
  expect(count).toBe(1);
  clicked(1);
  expect(count).toBe(1);
  await delay(15);
  clicked(1);
  expect(count).toBe(2);
  clicked(1);
  expect(count).toBe(2);
  clicked(1);
  expect(count).toBe(2);
});

test("when() with promise #1", async () => {
  let count = 0;
  spawn(async ({ when }) => {
    count++;
    await when(delay(10));
    count++;
  });
  await delay();
  expect(count).toBe(1);
  await delay(15);
  expect(count).toBe(2);
});

test("when() with promise #2", async () => {
  let count = 0;
  const task = spawn(async ({ when }) => {
    count++;
    await when(delay(10));
    count++;
  });
  await delay();
  expect(count).toBe(1);
  task.cancel();
  await delay(15);
  expect(count).toBe(1);
  await delay(15);
  expect(count).toBe(1);
});

test("when() with signal", async () => {
  const clicked = signal<number>();
  let count = 0;
  spawn(async ({ when }) => {
    count++;
    const value = await when(clicked);
    count += value;
  });
  await delay();
  expect(count).toBe(1);
  clicked(2);
  await delay();
  expect(count).toBe(3);
});

test("call() async", async () => {
  let count = 0;
  const task = spawn(async ({ call }) => {
    count++;
    await call(() => delay(10));
    count++;
  });
  await delay();
  expect(count).toBe(1);
  task.cancel();
  await delay(15);
  expect(count).toBe(1);
  await delay(15);
  expect(count).toBe(1);
});

test("race", async () => {
  const task = spawn(async ({ race, delay }) => {
    const { p1, p2 } = await race({ p1: delay(5, 1), p2: delay(3, 2) });
    expect(p1).toBeUndefined();
    expect(p2?.result).toBe(2);
  });
  await delay(20);
  expect(task.error()).toBeUndefined();
});

test("race() with task", async () => {
  const clicked = signal();
  let count = 0;
  spawn(async ({ race, delay, on }) => {
    await race({
      p1: delay(10),
      p2: on(clicked, () => count++),
    });
  });
  clicked();
  clicked();
  expect(count).toBe(2);
  await delay(15);
  clicked();
  clicked();
  clicked();
  expect(count).toBe(2);
});

test("all", async () => {
  const task = spawn(async ({ all, delay }) => {
    const { p1, p2 } = await all({ p1: delay(5, 1), p2: delay(3, 2) });
    expect(p1.result).toBe(1);
    expect(p2.result).toBe(2);
  });
  await delay(20);
  expect(task.error()).toBeUndefined();
});

test("restartable", async () => {
  let count = 0;
  const clicked = signal();
  const increment: Flow = async ({ delay }) => {
    await delay(10);
    count++;
  };
  spawn(({ restartable }) => {
    restartable(clicked, increment);
  });
  clicked();
  await delay(15);
  expect(count).toBe(1);
  clicked();
  clicked();
  clicked();
  clicked();
  await delay(15);
  expect(count).toBe(2);
});

test("droppable", async () => {
  let count = 0;
  const clicked = signal();
  const increment: Flow = async ({ delay }) => {
    await delay(10);
    count++;
  };
  spawn(({ droppable }) => {
    droppable(clicked, increment);
  });
  clicked();
  clicked();
  clicked();
  clicked();
  clicked();
  await delay(15);
  expect(count).toBe(1);
});

test("sequential", async () => {
  let count = 0;
  const clicked = signal();
  const increment: Flow = async ({ delay }) => {
    await delay(10);
    count++;
  };
  spawn(({ sequential }) => {
    sequential(clicked, increment);
  });
  clicked();
  clicked();
  clicked();
  await delay(12);
  expect(count).toBe(1);
  await delay(12);
  expect(count).toBe(2);
  await delay(12);
  expect(count).toBe(3);
});

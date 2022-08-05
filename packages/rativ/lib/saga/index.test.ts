import { atom } from "../main";
import { signal, spawn, delay, Saga, SagaContext, SC } from ".";

test("listen atom", () => {
  const counter = atom(1);
  let result = 0;
  spawn(({ on }) => {
    on(counter, (_, value) => {
      result += value;
    });
  });
  counter.set(2);
  expect(result).toBe(2);
});

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

test("race()", async () => {
  const task = spawn(async ({ race, delay }) => {
    const { p1, p2 } = await race({ p1: delay(5, 1), p2: delay(3, 2) });
    expect(p1).toBeUndefined();
    expect(p2?.result).toBe(2);
  });
  await delay(20);
  expect(task.error()).toBeUndefined();
});

test("race() with flow #1", async () => {
  let cancelled = false;
  const myFlow = async ({ delay, onCancel }: SagaContext) => {
    onCancel(() => (cancelled = true));
    await delay(10, 2);
    return 2;
  };
  const task = spawn(async ({ race, delay, fork }) => {
    const results = await race({ p1: delay(5, 1), myFlow: fork(myFlow) });
    expect(results.p1?.result).toBe(1);
    expect(results.myFlow?.result).toBeUndefined();
  });
  await delay(20);
  expect(cancelled).toBeTruthy();
  expect(task.error()).toBeUndefined();
});

test("race() with flow #2", async () => {
  let cancelled = false;
  const myFlow = async ({ delay, onCancel }: SagaContext) => {
    onCancel(() => (cancelled = true));
    await delay(10, 2);
    return 2;
  };
  const clicked = signal();
  const task = spawn(async ({ race, fork }) => {
    const results = await race({ p1: clicked, myFlow: fork(myFlow) });
    expect(results.p1).not.toBeUndefined();
    expect(results.myFlow?.result).toBeUndefined();
  });
  clicked();
  await delay(20);
  expect(cancelled).toBeTruthy();
  expect(task.error()).toBeUndefined();
});

test("race() with task", async () => {
  const clicked = signal();
  let count = 0;

  spawn(async ({ race, delay, on }) => {
    const p2 = on(clicked, () => {
      count++;
    });
    await race({
      p1: delay(10),
      p2,
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
  const increment: Saga = async ({ delay }) => {
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
  const increment: Saga = async ({ delay }) => {
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
  const increment: Saga = async ({ delay }) => {
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

test("search", async () => {
  const logs: string[] = [];
  const searchTermChanged = signal<string>();
  const cancelSearch = signal();

  const searchUsers = async ({ delay }: SagaContext, term: string) => {
    logs.push("delay");
    await delay(10);
    logs.push("result:" + term);
  };

  const handleSearchTermChanged = async (
    { race, fork }: SagaContext,
    term: string
  ) => {
    logs.push("handleSearchTermChanged");
    // cancel searchUsers task if cancelSearch signal is emitted
    race({
      searchUsers: fork(searchUsers, term),
      cancelSearch,
    });
  };

  spawn(async ({ debounce }) => {
    // listen searchTermChanged signal and debounce execution of handleSearchTermChanged in 300ms
    debounce(10, searchTermChanged, handleSearchTermChanged);
  });

  searchTermChanged("abc");
  await delay(30);
  expect(logs).toEqual(["handleSearchTermChanged", "delay", "result:abc"]);
});

test("once", () => {
  let count = 0;
  const clicked = signal();
  spawn(({ on }) => {
    on(clicked, () => count++).once();
  });
  clicked();
  clicked();
  clicked();
  clicked();
  expect(count).toBe(1);
});

test("times", () => {
  let count = 0;
  const clicked = signal();
  spawn(({ on }) => {
    on(clicked, () => count++).times(3);
  });
  clicked();
  clicked();
  clicked();
  clicked();
  expect(count).toBe(3);
});

test("infinite", async () => {
  const clicked = signal();
  let count = 0;

  spawn(async ({ infinite, when }) => {
    await infinite(async () => {
      await when(clicked);
      count++;
    });
  });

  clicked();
  await delay();
  expect(count).toBe(1);

  clicked();
  await delay();
  expect(count).toBe(2);

  clicked();
  await delay();
  expect(count).toBe(3);
});

test("custom emitter", () => {
  let count = 0;
  const external = signal();
  const mouseMove = signal(external.on).start();
  mouseMove.on(() => {
    count++;
  });
  external();
  external();
  external();
  expect(count).toBe(3);
  mouseMove.pause();
  external();
  external();
  external();
  expect(count).toBe(3);
  mouseMove.start();
  external();
  external();
  external();
  expect(count).toBe(6);
});

test("debounce #2 ", async () => {
  const results = [1, 2, 3];
  const searchTermAtom = atom("");
  const searchRepoResultAtom = atom<number | undefined>(0);
  const cancelSignal = signal();
  const searchSaga = async ({ delay }: SC) => {
    await delay(20);
    return results.shift();
  };
  const startSearchingSaga = async ({ call, set }: SC) => {
    const result = call(searchSaga);
    set(searchRepoResultAtom, result);
  };

  const onSearchTermChanged = async ({ race }: SC) => {
    await race({
      startSearchingSaga,
      cancelSignal,
    });
  };

  const mainSaga = ({ debounce }: SC) => {
    debounce(10, searchTermAtom, onSearchTermChanged);
  };

  spawn(mainSaga);
  searchTermAtom.set("a");
  await delay(15);
  searchTermAtom.set("b");
  await delay(15);
  searchTermAtom.set("c");
  await delay(35);
  expect(results).toEqual([2, 3]);
});

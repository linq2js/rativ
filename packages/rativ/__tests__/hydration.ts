import { hydrate } from "../lib/hydration";
import { delay, atom } from "../lib/main";

test("hydrate: sync", () => {
  let onLoadCalls = 0;
  let onSaveCalls = 0;
  const hydration = hydrate({
    state: [["count", { state: 1 }]],
    onLoad: () => onLoadCalls++,
    onSave: () => onSaveCalls++,
  });
  const count = atom(0, hydration("count"));
  expect(count.state).toBe(1);
  expect(onLoadCalls).toBe(1);
  expect(onSaveCalls).toBe(0);
  count.state++;
  expect(onSaveCalls).toBe(1);
});

test("dehydrate: async", async () => {
  const hydration = hydrate();
  const count1 = atom(delay(10, 5), hydration("count1"));
  const count2 = atom(delay(5, 3), hydration("count2"));
  const data = await hydration.dehydrate();
  expect(count1.state).toBe(5);
  expect(count2.state).toBe(3);
  const map = new Map(data);
  expect(map.get("count1")).toEqual({ state: 5 });
  expect(map.get("count2")).toEqual({ state: 3 });
});

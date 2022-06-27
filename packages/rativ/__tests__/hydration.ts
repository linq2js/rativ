import { hydrate } from "../lib/hydration";
import { signal } from "../lib/main";

test("hydrate", () => {
  const hydration = hydrate({ data: [["count", { data: 1 }]] });
  const count = signal(0, hydration("count"));
  expect(count.state).toBe(1);
});

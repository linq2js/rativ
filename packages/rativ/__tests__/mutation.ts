import { signal } from "../lib/main";
import { include, exclude, nonNull, prop, push } from "../lib/mutation";

test("push with optional prop", () => {
  const data = signal({
    values: undefined as undefined | number[],
  });

  data.mutate(prop("values", push(1, 2, 3)));

  expect(data.state).toEqual({ values: [1, 2, 3] });
});

test("nonNull", () => {
  const data = signal({
    values: undefined as undefined | number[],
  });

  data.mutate(
    prop(
      "values",
      nonNull(() => [])
    )
  );

  expect(data.state.values).toEqual([]);
});

test("nested props", () => {
  const data = signal({
    p1: {
      other: 1,
      p2: {
        other: 2,
        p3: {
          value: 5,
          other: 3,
        },
      },
    },
  });
  data.mutate(
    prop(
      "p1",
      prop(
        "p2",
        prop(
          "p3",
          prop("value", (prev) => prev + 1)
        )
      )
    )
  );
  expect(data.state).toEqual({
    p1: {
      other: 1,
      p2: {
        other: 2,
        p3: {
          value: 6,
          other: 3,
        },
      },
    },
  });
});

test("include: indices", () => {
  const data = signal([1, 2, 3, 4, 5]);
  data.mutate(include([1, 2, 3]));
  expect(data.state).toEqual([2, 3, 4]);
});

test("include: predicate", () => {
  const data = signal([1, 2, 3, 4, 5]);
  data.mutate(include((x) => x % 2 === 0));
  expect(data.state).toEqual([2, 4]);
});

test("include: predicate with limit", () => {
  const data = signal([1, 2, 3, 4, 5]);
  data.mutate(include((x) => x % 2 === 0, 1));
  expect(data.state).toEqual([2]);
});

test("exclude: indices", () => {
  const data = signal([1, 2, 3, 4, 5]);
  data.mutate(exclude([1, 2, 3]));
  expect(data.state).toEqual([1, 5]);
});

test("exclude: predicate", () => {
  const data = signal([1, 2, 3, 4, 5]);
  data.mutate(exclude((x) => x % 2 === 0));
  expect(data.state).toEqual([1, 3, 5]);
});

test("exclude: predicate with limit", () => {
  const data = signal([1, 2, 3, 4, 5]);
  data.mutate(exclude((x) => x % 2 === 0, 1));
  expect(data.state).toEqual([1, 3, 4, 5]);
});

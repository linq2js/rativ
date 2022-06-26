import { signal } from "../lib/main";
import {
  include,
  exclude,
  nonNull,
  prop,
  push,
  splice,
  insert,
  slice,
  sort,
  move,
} from "../lib/mutation";

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

test("splice", () => {
  const data = signal([1, 2, 3, 4, 5]);
  data.mutate(splice(0, 2, [6, 7]));
  expect(data.state).toEqual([6, 7, 3, 4, 5]);
});

test("insert", () => {
  const data = signal([1, 2, 3, 4, 5]);
  data.mutate(insert(0, [6, 7]));
  expect(data.state).toEqual([6, 7, 1, 2, 3, 4, 5]);
});

test("slice", () => {
  const data = signal([1, 2, 3, 4, 5]);
  data.mutate(slice(0, 2));
  expect(data.state).toEqual([1, 2]);
});

test("sort: without field selector", () => {
  const data = signal([5, 4, 2, 1, 6, 3]);
  data.mutate(sort());
  expect(data.state).toEqual([1, 2, 3, 4, 5, 6]);
});

test("sort", () => {
  const data = signal([
    { name: "A", age: 1 },
    { name: "A", age: 2 },
    { name: "B", age: 1 },
  ]);
  data.mutate(sort((b) => b.desc((x) => x.name).asc((x) => x.age)));
  expect(data.state).toEqual([
    { name: "B", age: 1 },
    { name: "A", age: 1 },
    { name: "A", age: 2 },
  ]);
});

test("move", () => {
  const data = signal([1, 2, 3, 4, 5, 6]);
  data.mutate(move(3, (x) => x % 2 === 0));
  expect(data.state).toEqual([1, 3, 2, 4, 6, 5]);
  data.mutate(move(0, [4, 5]));
  expect(data.state).toEqual([6, 5, 1, 3, 2, 4]);
});

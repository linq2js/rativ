import { atom } from "../lib/main";
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
  mutate,
  item,
} from "../lib/mutation";

test("array item", () => {
  const value = atom([{ current: 1 }]);

  value.mutate(
    item(
      () => true,
      prop("current", (prev) => prev + 1)
    )
  );
  expect(value.state[0].current).toBe(2);
});

test("push with optional prop", () => {
  const result = mutate(
    { values: undefined as undefined | number[] },
    prop("values", push(1, 2, 3))
  );

  expect(result).toEqual({ values: [1, 2, 3] });
});

test("nonNull", () => {
  const result = mutate(
    { values: undefined as undefined | number[] },
    prop(
      "values",
      nonNull(() => [])
    )
  );

  expect(result.values).toEqual([]);
});

test("nested props", () => {
  const result = mutate(
    {
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
    },
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
  expect(result).toEqual({
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
  const data = [1, 2, 3, 4, 5];
  const result = mutate(data, include([1, 2, 3]));
  expect(result).toEqual([2, 3, 4]);
});

test("include: predicate", () => {
  const data = [1, 2, 3, 4, 5];
  const result = mutate(
    data,
    include((x) => x % 2 === 0)
  );
  expect(result).toEqual([2, 4]);
});

test("include: predicate with limit", () => {
  const data = [1, 2, 3, 4, 5];
  const result = mutate(
    data,
    include((x) => x % 2 === 0, 1)
  );
  expect(result).toEqual([2]);
});

test("exclude: indices", () => {
  const data = [1, 2, 3, 4, 5];
  const result = mutate(data, exclude([1, 2, 3]));
  expect(result).toEqual([1, 5]);
});

test("exclude: predicate", () => {
  const data = [1, 2, 3, 4, 5];
  const result = mutate(
    data,
    exclude((x) => x % 2 === 0)
  );
  expect(result).toEqual([1, 3, 5]);
});

test("exclude: predicate with limit", () => {
  const data = [1, 2, 3, 4, 5];
  const result = mutate(
    data,
    exclude((x) => x % 2 === 0, 1)
  );
  expect(result).toEqual([1, 3, 4, 5]);
});

test("splice", () => {
  const data = [1, 2, 3, 4, 5];
  const result = mutate(data, splice(0, 2, [6, 7]));
  expect(result).toEqual([6, 7, 3, 4, 5]);
});

test("insert", () => {
  const data = [1, 2, 3, 4, 5];
  const result = mutate(data, insert(0, [6, 7]));
  expect(result).toEqual([6, 7, 1, 2, 3, 4, 5]);
});

test("slice", () => {
  const data = [1, 2, 3, 4, 5];
  const result = mutate(data, slice(0, 2));
  expect(result).toEqual([1, 2]);
});

test("sort: without field selector", () => {
  const data = [5, 4, 2, 1, 6, 3];
  const result = mutate(data, sort());
  expect(result).toEqual([1, 2, 3, 4, 5, 6]);
});

test("sort", () => {
  const data = [
    { name: "A", age: 1 },
    { name: "A", age: 2 },
    { name: "B", age: 1 },
  ];
  const result = mutate(
    data,
    sort((b) => b.desc((x) => x.name).asc("age"))
  );
  expect(result).toEqual([
    { name: "B", age: 1 },
    { name: "A", age: 1 },
    { name: "A", age: 2 },
  ]);
});

test("move", () => {
  const r1 = mutate(
    [1, 2, 3, 4, 5, 6],
    move(3, (x) => x % 2 === 0)
  );
  expect(r1).toEqual([1, 3, 2, 4, 6, 5]);
  const r2 = mutate(r1, move(0, [4, 5]));
  expect(r2).toEqual([6, 5, 1, 3, 2, 4]);
});

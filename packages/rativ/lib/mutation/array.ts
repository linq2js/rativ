import { Mutation, NoInfer, Nullable } from "../main";

export type Move = {
  <
    T extends Nullable<any[]>,
    I extends T extends Nullable<Array<infer I>> ? I : never
  >(
    to: number,
    predicate: (item: I, index: number) => boolean
  ): Mutation<T>;
  <T extends Nullable<any[]>>(to: number, indices: number[]): Mutation<T>;
};

export type Compare<T> = (a: T, b: T) => number;

export type SortBuilder<T> = {
  add(...compareFns: Compare<T>[]): SortBuilder<T>;
  asc<P extends keyof T>(prop: P, compare?: Compare<T[P]>): SortBuilder<T>;
  desc<P extends keyof T>(prop: P, compare?: Compare<T[P]>): SortBuilder<T>;
  asc<R>(selector: (value: T) => R, compare?: Compare<R>): SortBuilder<T>;
  desc<R>(selector: (value: T) => R, compare?: Compare<R>): SortBuilder<T>;
};

export type ExcludeInclude = {
  <T extends Nullable<any[]>>(indices: number[]): Mutation<T>;
  <T extends Nullable<any[]>>(indices: number[], count: number): Mutation<T>;
  <
    T extends Nullable<any[]>,
    I extends T extends Nullable<Array<infer I>> ? I : never
  >(
    predicate: (item: I, index: number) => boolean
  ): Mutation<T>;
  <
    T extends Nullable<any[]>,
    I extends T extends Nullable<Array<infer I>> ? I : never
  >(
    predicate: (item: I, index: number) => boolean,
    count: number
  ): Mutation<T>;
};

const item = <T>(
  predicate: boolean | number[] | ((item: T, index: number) => boolean),
  ...mutations: Mutation<T>[]
): Mutation<Nullable<T[]>, T[]> => {
  return (prev): any => {
    if (!prev || !mutations.length) return prev;
    let hasChange = false;
    const next: T[] = [];
    const predicateWrapper =
      typeof predicate === "boolean"
        ? () => predicate
        : typeof predicate === "function"
        ? predicate
        : (_: T, index: number) => predicate.includes(index);
    prev.forEach((prevItem, index) => {
      if (predicateWrapper(prevItem, index)) {
        const nextItem = mutations.reduce((p, m) => m(p), prevItem);
        if (nextItem !== prevItem) {
          hasChange = true;
        }
        next.push(nextItem);
      } else {
        next.push(prevItem);
      }
    });
    return hasChange ? next : prev;
  };
};

const push = <T>(...values: NoInfer<T>[]): Mutation<Nullable<T[]>, T[]> => {
  return (prev) => (prev ?? []).concat(values);
};

const unshift = <T>(...values: NoInfer<T>[]): Mutation<Nullable<T[]>, T[]> => {
  return (prev) => values.concat(prev ?? []);
};

const pop = <T>(): Mutation<T> => {
  return (prev) =>
    Array.isArray(prev) && prev.length
      ? (prev.slice(0, prev.length - 1) as unknown as T)
      : prev;
};

const shift = <T>(): Mutation<T> => {
  return (prev) =>
    Array.isArray(prev) && prev.length ? (prev.slice(1) as unknown as T) : prev;
};

const exclude: ExcludeInclude = (...args: any[]): any => {
  if (typeof args[0] === "function") {
    let [predicate, count = Number.MAX_VALUE] = args as [
      (item: any, index: number) => boolean,
      number | undefined
    ];
    return (prev: any[]) => {
      return prev && prev.length
        ? prev.filter((x, i) => {
            if (count && predicate(x, i)) {
              count--;
              return false;
            }
            return true;
          })
        : prev;
    };
  }
  return (prev: any[]) => {
    let [indices, count = Number.MAX_VALUE] = args as [
      number[],
      number | undefined
    ];
    return prev && prev.length
      ? prev.filter((_, i) => {
          if (count && indices.includes(i)) {
            count--;
            return false;
          }
          return true;
        })
      : prev;
  };
};

const include: ExcludeInclude = (...args: any[]): any => {
  if (typeof args[0] === "function") {
    let [predicate, count = Number.MAX_VALUE] = args as [
      (item: any, index: number) => boolean,
      number | undefined
    ];
    return (prev: any[]) => {
      return prev && prev.length
        ? prev.filter((x, i) => {
            if (count && predicate(x, i)) {
              count--;
              return true;
            }
            return false;
          })
        : prev;
    };
  }
  return (prev: any[]) => {
    let [indices, count = Number.MAX_VALUE] = args as [
      number[],
      number | undefined
    ];
    return prev && prev.length
      ? prev.filter((_, i) => {
          if (count && indices.includes(i)) {
            count--;
            return true;
          }
          return false;
        })
      : prev;
  };
};

const splice =
  <
    T extends Nullable<any[]>,
    I extends T extends Nullable<Array<infer I>> ? I : never
  >(
    index: number,
    deleteCount?: number,
    insert?: NoInfer<I>[]
  ): Mutation<T> =>
  (prev) => {
    const nothingToDelete = !deleteCount;
    const nothingToInsert = !insert?.length;
    if (nothingToInsert && nothingToDelete) return prev;
    const copy = (prev ?? []).slice();
    if (insert) {
      copy.splice(index, deleteCount ?? 0, ...insert);
    } else {
      copy.splice(index, deleteCount);
    }
    return copy as any;
  };

const insert = <
  T extends Nullable<any[]>,
  I extends T extends Nullable<Array<infer I>> ? I : never
>(
  index: number,
  items: NoInfer<I>[]
): Mutation<T> => splice(index, 0, items);

const slice =
  <T extends Nullable<any[]>>(from: number, to?: number): Mutation<T> =>
  (prev) => {
    const next = prev?.slice(from, to) ?? [];
    if (
      prev &&
      next.length === prev.length &&
      prev[0] === next[0] &&
      next[next.length - 1] === prev[prev.length - 1]
    ) {
      return prev;
    }
    return next as any;
  };

const createSortBuilder = <T>(sortFns: Compare<T>[]): SortBuilder<T> => {
  const orderBy =
    <R>(
      selector: (value: T) => R,
      factor: number,
      compare?: Compare<R>
    ): Compare<T> =>
    (a, b) => {
      const av = selector(a);
      const bv = selector(b);
      if (compare) return compare(av, bv) * factor;
      return (av > bv ? 1 : av < bv ? -1 : 0) * factor;
    };

  return {
    add(...compareFns) {
      sortFns.push(...compareFns);
      return this;
    },
    asc(selector: any, compare: any) {
      if (typeof selector === "string") {
        const prop = selector;
        selector = (x: any) => x?.[prop];
      }
      sortFns.push(orderBy(selector, 1, compare));
      return this;
    },
    desc(selector: any, compare: any) {
      if (typeof selector === "string") {
        const prop = selector;
        selector = (x: any) => x?.[prop];
      }
      sortFns.push(orderBy(selector, -1, compare));
      return this;
    },
  };
};

const sort =
  <
    T extends Nullable<any[]>,
    I extends T extends Nullable<Array<infer I>> ? I : never
  >(
    sortBuilder?: (builder: SortBuilder<I>) => any
  ): Mutation<T> =>
  (prev): any => {
    if (!prev) return prev;
    const sortFns: Compare<I>[] = [];

    if (sortBuilder) {
      sortBuilder(createSortBuilder(sortFns));
    }

    if (!sortFns.length) return prev.slice().sort();

    return prev.slice().sort((a, b) => {
      for (const f of sortFns) {
        const result = f(a, b);
        if (result) return result;
      }
      return 0;
    });
  };

const move: Move =
  (to: number, predicate: any) =>
  (prev: any[]): any => {
    if (!prev) return prev;
    if (Array.isArray(predicate)) {
      const indices = predicate;
      predicate = (_: any, index: number) => indices.includes(index);
    }
    const placeholder = {};
    const movedItems: any[] = [];
    const otherItems: any[] = [];
    prev.forEach((item, index) => {
      if (predicate(item, index)) {
        movedItems.push(item);
        otherItems.push(placeholder);
      } else {
        otherItems.push(item);
      }
    });
    if (!movedItems.length) return prev;
    otherItems.splice(to, 0, ...movedItems);
    return otherItems.filter((x) => x !== placeholder);
  };

const reverse =
  <T extends Nullable<any[]>>(): Mutation<T> =>
  (prev): any =>
    prev?.length ? prev.slice().reverse() : prev;

export {
  push,
  unshift,
  pop,
  sort,
  item,
  reverse,
  move,
  shift,
  exclude,
  include,
  splice,
  slice,
  insert,
};

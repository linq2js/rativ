import { Mutation, Nullable } from "../main";

export const item = <T>(
  predicate: (item: T, index: number) => boolean,
  ...mutations: Mutation<T>[]
): Mutation<Nullable<T[]>> => {
  return (prev) => {
    if (!prev || !mutations.length) return prev;
    let hasChange = false;
    const next: T[] = [];
    prev.forEach((prevItem, index) => {
      if (predicate(prevItem, index)) {
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

export const push = <T>(...values: T[]): Mutation<Nullable<T[]>, T[]> => {
  return (prev) => (prev ?? []).concat(values);
};

export const unshift = <T>(...values: T[]): Mutation<Nullable<T[]>, T[]> => {
  return (prev) => values.concat(prev ?? []);
};

export const pop = <T>(): Mutation<T> => {
  return (prev) =>
    Array.isArray(prev) && prev.length
      ? (prev.slice(0, prev.length - 1) as unknown as T)
      : prev;
};

export const shift = <T>(): Mutation<T> => {
  return (prev) =>
    Array.isArray(prev) && prev.length ? (prev.slice(1) as unknown as T) : prev;
};

export type ExcludeInclude = {
  <T extends Nullable<any[]>>(indices: number[]): Mutation<T>;
  <T extends Nullable<any[]>>(indices: number[], count: number): Mutation<T>;
  <T extends Nullable<any[]>>(
    predicate: (
      item: T extends Nullable<Array<infer I>> ? I : never,
      index: number
    ) => boolean
  ): Mutation<T>;
  <T extends Nullable<any[]>>(
    predicate: (
      item: T extends Nullable<Array<infer I>> ? I : never,
      index: number
    ) => boolean,
    count: number
  ): Mutation<T>;
};

export const exclude: ExcludeInclude = (...args: any[]): any => {
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

export const include: ExcludeInclude = (...args: any[]): any => {
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

import { Mutation, NoInfer, Nullable } from "../util/commonTypes";
import { deepEqual, shallowEqual } from "../util/compare";

export * from "./array";
export * from "./object";
export * from "./value";

const mutate = <T>(value: T, ...mutations: Mutation<T>[]) => {
  return mutations.reduce((p, m) => m(p), value);
};

/**
 * perform shallow comparison for prev and next values, if nothing is changed, keep prev value
 * @param mutations
 * @returns
 */
const shallow = <T>(...mutations: Mutation<T>[]): Mutation<T> => {
  return (prev) => {
    const next = mutate(prev, ...mutations);
    if (shallowEqual(prev, next)) return prev;
    return next;
  };
};

/**
 * perform deep comparison for prev and next values, if nothing is changed, keep prev value
 * @param mutations
 * @returns
 */
const deep = <T>(...mutations: Mutation<T>[]): Mutation<T> => {
  return (prev) => {
    const next = mutate(prev, ...mutations);
    if (deepEqual(prev, next)) return prev;
    return next;
  };
};

/**
 * conditional mutating
 * @param fn
 * @returns
 */
const cond = <T>(
  fn: (prev: T) => NoInfer<void | Mutation<T> | Mutation<T>[]>
): Mutation<Nullable<T>, T> => {
  return (prev: Nullable<T>): any => {
    const mutations = fn(prev as T);
    if (!mutations) return prev;
    if (Array.isArray(mutations)) return mutate(prev as T, ...mutations);
    return mutations(prev as T);
  };
};

export { mutate, shallow, deep, cond };

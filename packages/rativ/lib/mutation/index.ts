export type Mutation<T, R = T> = (prev: T) => R;

export * from "./array";
export * from "./object";
export * from "./value";

export const mutate = <T>(value: T, ...mutations: Mutation<T>[]) => {
  return mutations.reduce((p, m) => m(p), value);
};

import { Mutation, NoInfer, Nullable } from "../main";

export const nonNull = <T>(
  defaultValue: () => NoInfer<T>,
  ...mutations: Mutation<NoInfer<T>>[]
): Mutation<Nullable<T>, T> => {
  return (prev): T => {
    const nonNullableValue =
      typeof prev === "undefined" || prev === null ? defaultValue() : prev;

    if (!mutations.length) {
      return nonNullableValue;
    }

    return mutations.reduce((p, m) => m(p), nonNullableValue);
  };
};

export const prop = <T, P extends keyof T>(
  name: P,
  ...mutations: Mutation<T[P]>[]
): Mutation<T> => {
  return (prev): T => {
    if (!prev) return prev;
    const next = mutations.reduce((p, m) => m(p), prev[name]);
    if (next === prev[name]) return prev;
    return { ...prev, [name]: next };
  };
};

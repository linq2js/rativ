import { Mutation, NoInfer, Nullable } from "../main";

const nonNull = <T>(
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

const prop = <T, P extends keyof T>(
  name: P,
  ...mutations: Mutation<T[P]>[]
): Mutation<T> => {
  return (prev): T => {
    if (!prev) return prev;
    const next = mutations.reduce((p, m) => m(p), prev[name]);
    if (next === prev[name]) return prev;
    if (Array.isArray(prev)) {
      const nextObj = [...prev] as unknown as T;
      nextObj[name] = next;
      return nextObj;
    }
    return { ...prev, [name]: next };
  };
};

const swap =
  <T, P extends keyof T>(from: P, to: P): Mutation<T> =>
  (prev) => {
    if (!prev) return prev;
    const a = prev[from];
    const b = prev[to];
    if (a === b) return prev;
    const next = Array.isArray(prev)
      ? (prev.slice() as unknown as T)
      : ({ ...prev } as T);
    next[to] = a;
    next[from] = b;
    return next;
  };

const unset =
  <T, P extends keyof T>(...props: P[]): Mutation<T> =>
  (prev) => {
    if (!prev) return prev;
    let next: any = prev;
    props.forEach((prop) => {
      if (prop in next) {
        if (next === prev) {
          next = { ...prev };
        }
        delete next[prop];
      }
    });
    return next;
  };

export { nonNull, unset, swap, prop };

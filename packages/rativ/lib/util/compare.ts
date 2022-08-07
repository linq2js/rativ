import { CompareFn } from "./types";

const arraySliceMethod = [].slice;
const regexpExecMethod = /a/.exec;
const dateGetTimeMethod = new Date().getTime;

/**
 * perform comparison for 2 values. This compare function also handle Date and Regex comparisons
 * the date values are equal if their timestamps (a value return from getTime() method) are equal
 * the regex values are equal if their string values (a value return from toString() method) are equal
 * objectCompare will be called if both values are objects
 * @param a
 * @param b
 * @param objectCompare
 * @returns
 */
const defaultEqual = (a: any, b: any, objectCompare?: CompareFn) => {
  if (a === b) return true;
  if (!a && b) return false;
  if (a && !b) return false;

  if (typeof a === "object" && typeof b === "object") {
    // detect date obj
    if (a.getTime === dateGetTimeMethod) {
      if (b.getTime === dateGetTimeMethod) return a.getTime() === b.getTime();
      return false;
    }
    // detect regex obj
    if (a.exec === regexpExecMethod) {
      if (b.exec === regexpExecMethod) return a.toString() === b.toString();
      return false;
    }

    if (objectCompare) return objectCompare(a, b);
  }

  return false;
};

/**
 * perfrom shallow compare for 2 values. by default, shallowCompare uses defaultCompare to compare array items, object prop values
 * @param a
 * @param b
 * @param valueCompare
 * @returns
 */
const shallowEqual = (
  a: any,
  b: any,
  valueCompare: CompareFn = defaultEqual
) => {
  const objectCompare = (a: any, b: any) => {
    if (a.slice === arraySliceMethod) {
      if (b.slice !== arraySliceMethod) return false;
      const length = a.length;
      if (length !== b.length) return false;
      for (let i = 0; i < length; i++) {
        if (!valueCompare(a[i], b[i])) return false;
      }
      return true;
    }

    const keys = new Set(Object.keys(a).concat(Object.keys(b)));

    for (const key of keys) {
      if (!valueCompare(a[key], b[key])) return false;
    }

    return true;
  };
  return defaultEqual(a, b, objectCompare);
};

/**
 * peform deep comparison for 2 values
 * @param a
 * @param b
 * @returns
 */
const deepEqual = (a: any, b: any) => {
  return shallowEqual(a, b, deepEqual);
};

export { shallowEqual, deepEqual, defaultEqual };

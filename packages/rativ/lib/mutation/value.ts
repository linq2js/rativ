import { Mutation, Nullable } from "../main";

export type Add = {
  (value: number): Mutation<Nullable<number>>;
  (duration: {
    years?: number;
    months?: number;
    days?: number;
    hours?: number;
    minutes?: number;
    seconds?: number;
    milliseconds?: number;
    Y?: number;
    M?: number;
    D?: number;
    h?: number;
    m?: number;
    s?: number;
    ms?: number;
  }): Mutation<Nullable<Date>>;
};

const add: Add = (input): any => {
  if (typeof input === "number") {
    return (prev: Nullable<number>) => (prev || 0) + input;
  }

  return (prev: Nullable<Date>) => {
    const base = prev ?? new Date(0);
    const {
      Y,
      years,
      M,
      months,
      D,
      days,
      h,
      hours,
      m,
      minutes,
      s,
      seconds,
      ms,
      milliseconds,
    } = input;
    const next = new Date(
      base.getFullYear() + (years || Y || 0),
      base.getMonth() + (months || M || 0),
      base.getDate() + (days || D || 0),
      base.getHours() + (hours || h || 0),
      base.getMinutes() + (minutes || m || 0),
      base.getSeconds() + (seconds || s || 0),
      base.getMilliseconds() + (milliseconds || ms || 0)
    );
    if (next.getTime() === base.getTime()) return prev;
    return next;
  };
};

const toggle = (): Mutation<Nullable<boolean>, boolean> => (prev) => !prev;

export { add, toggle };

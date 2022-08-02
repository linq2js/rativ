import { Updater } from "./asyncUpdate";

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type Listener<T, A = void> = (e: T, a: A) => void;

export type Nullable<T> = T | undefined | null;

export type Mutation<T, R = T> = (prev: T) => R;

export type Atom<T = any> = {
  /**
   * name of atom
   */
  readonly name: string | undefined;
  /**
   * get loading status of the atom
   */
  readonly loading: boolean;
  /**
   * get current error of the atom
   */
  readonly error: any;
  /**
   * get current task of the atom
   */
  readonly task: Promise<T> | undefined;
  /**
   * listen atom state changing event
   * @param listener
   */
  on(listener: Listener<T>): VoidFunction;
  /**
   * listen atom status changing event
   * @param type
   * @param listener
   */
  on(type: "status", listener: Listener<void>): VoidFunction;
  readonly get: Get<T>;
  /**
   * reset atom state
   */
  reset(): void;
  /**
   * abort the task of the atom if it is processing
   */
  abort(): void;
  /**
   * create a snapshot of the atom
   * @param reset
   */
  snapshot(reset?: boolean): VoidFunction;
  /**
   * get current state of the atom
   */
  readonly state: T;
};

export type Get<T> = {
  /**
   * get current state of the atom
   */
  (): T;
  /**
   * get result of the selector, the selector retrieves current state of the atom
   * @param selector
   */
  <R>(selector: (state: T) => R): R;
};

export type Set<T> = {
  (): Updater<
    T,
    | Mutation<T>[]
    | [
        | ((prev: T, context: Context) => T | Promise<T> | Awaiter<T>)
        | T
        | Promise<T>
        | Awaiter<T>
      ]
  >;
  /**
   * update current state of the atom by using specfied mutations
   * @param mutations
   */
  (...mutations: Mutation<T>[]): VoidFunction;
  /**
   * update current state of the atom
   * @param state
   */
  (
    state:
      | ((prev: T, context: Context) => T | Promise<T> | Awaiter<T>)
      | T
      | Promise<T>
      | Awaiter<T>
  ): VoidFunction;
};

export type UpdatableAtom<T = any> = Omit<Atom<T>, "state"> & {
  /**
   * get or set current state of the atom
   */
  state: T;
  readonly set: Set<T>;

  cancel(): void;
};

export type Context = {
  /**
   * AbortController signal
   */
  readonly signal: AbortController["signal"] | undefined;
  /**
   * is aborted
   */
  readonly aborted: boolean;
  /**
   *  abort the context
   */
  abort(): void;
};

export type Emit<T, A> = {
  /**
   * emit an action and atom reducer will handle the action
   * @param action
   */
  (action: A): EmittableAtom<T, A>;
};

export type EmittableAtom<T = any, A = void> = Atom<T> & {
  /**
   * emit an action and atom reducer will handle the action
   * @param action
   */
  readonly emit: Emit<T, A>;
  /**
   * listen action emitting event
   * @param type
   * @param listener
   */
  on(type: "emit", listener: Listener<T, A>): VoidFunction;

  cancel(): void;
};

export type AtomExtraProps<THelpers = {}> = {
  [key in keyof THelpers]: THelpers[key] extends (
    context: any,
    ...args: infer A
  ) => infer R
    ? (...args: A) => R
    : never;
};

export type AtomHelpers<T> = {
  [key: string]: (context: T, ...args: any[]) => any;
};

export type AtomOptions = {
  /**
   * name of atom, for debugging purpose
   */
  name?: string;
  /**
   * this function will be called when initializing atom
   */
  load?: () => { state: any } | undefined;
  /**
   * this function will be called when atom state changed
   */
  save?: (state: any) => void;
  onChange?: VoidFunction;
  onError?: (error: any) => void;
  onLoading?: VoidFunction;
};

export type EmittableOptions<A = any> = AtomOptions & {
  initAction?: A;
  onEmit?: (action: A) => void;
};

export type ComputedAtom<T> = UpdatableAtom<T>;

export type Awaiter<T> = { $$type: "awaiter"; promise: Promise<T> };

export type Wait = {
  <A, T, P extends any[]>(
    awaitable: Atom<A> | Promise<A>,
    fn: (value: A, ...args: P) => T | Awaiter<T>,
    ...args: P
  ): T extends Promise<any> ? never : Awaiter<T>;
  <A extends { [key: number]: Atom | Promise<any> }, T, P extends any[]>(
    awaitables: A,
    fn: (
      values: {
        [key in keyof A]: A[key] extends Atom<infer V>
          ? V
          : A[key] extends Promise<infer V>
          ? V
          : never;
      },
      ...args: P
    ) => T | Awaiter<T>,
    ...args: P
  ): T extends Promise<any> ? never : Awaiter<T>;
};

export type KeyOf = {
  <T, E extends keyof T>(obj: T, exclude: E[]): Exclude<keyof T, E>[];
  <T>(obj: T): (keyof T)[];
};

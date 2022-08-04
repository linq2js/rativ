import { createCallbackGroup } from "../util/createCallbackGroup";
import { isPromiseLike } from "../util/isPromiseLike";
import { delay } from "../util/delay";
import { Atom, EmittableAtom, isAtom, SetFn, UpdatableAtom } from "../main";

export type TaskStatus = "idle" | "running" | "error" | "success" | "cancelled";

export type Saga<A extends any[] = any[], R = any> = (
  context: SagaContext,
  ...args: A
) => R | Promise<R>;

export type Awaitable<T = void> = {
  on(listener: (value: T) => void): VoidFunction;
};

export type Emittable<T = void> = Awaitable<T> & {
  emit(payload: T): void;
  clear(): void;
};

export type Cancellable = {
  cancelled(): boolean;
  cancel(): void;
};

export type AsyncResult<T> = { result: T; error: any };

export type WaitResult<T> = {
  [key in keyof T]: T[key] extends Promise<infer V>
    ? AsyncResult<V>
    : T[key] extends Signal<infer V>
    ? AsyncResult<V>
    : T[key] extends Task<infer V>
    ? AsyncResult<V>
    : T[key] extends Saga<any[], infer V>
    ? AsyncResult<V>
    : never;
};

export type AnySignal<T = void> = Signal<T> | CustomSignal<T>;

export type Listenable<T = void> = Atom<T> | AnySignal<T>;

export type ListenableList = Listenable<any> | Listenable<any>[];

export type AwaitableMap = Record<
  string,
  Saga<any[], any> | Awaitable | Promise<any>
>;

export type ContinuousTask = Task & {
  once(): ContinuousTask;
  times(value: number): ContinuousTask;
};

/**
 * Saga context
 */
export type SagaContext = Cancellable & {
  abortController(): AbortController | undefined;
  onCancel(listener: VoidFunction): VoidFunction;
  onDispose(listener: VoidFunction): VoidFunction;
  onError(listener: (error: any) => void): VoidFunction;
  race<T extends AwaitableMap>(awaitables: T): Promise<Partial<WaitResult<T>>>;
  all<T extends AwaitableMap>(awaitables: T): Promise<WaitResult<T>>;
  allSettled<T extends AwaitableMap>(awaitables: T): Promise<WaitResult<T>>;
  fork<A extends any[], R = void>(flow: Saga<A, R>, ...args: A): Task<R>;

  set<T>(atom: UpdatableAtom<T>, ...args: Parameters<SetFn<T>>): Promise<void>;

  emit<T, A>(atom: EmittableAtom<T, A>, payload: A): Promise<void>;

  call<A extends any[], R, F extends Saga<A, R>>(
    flow: F,
    ...args: A
  ): ReturnType<F>;

  callback<A extends any[]>(fn: (...args: A) => void): (...args: A) => void;

  delay(): Promise<void>;
  delay(ms: number): Promise<void>;
  delay<T>(ms: number, value: T): Promise<T>;

  when<T>(promise: Promise<T>): Promise<T>;
  when<T>(listenable: Listenable<T>): Promise<T>;

  on<T, A extends any[]>(
    atom: Atom<T>,
    flow: Saga<[T, ...A]>,
    ...args: A
  ): ContinuousTask;
  on<T, A extends any[]>(
    listenable: Listenable<T>,
    flow: Saga<[T, ...A]>,
    ...args: A
  ): ContinuousTask;
  on<A extends any[]>(
    listenables: ListenableList,
    flow: Saga<[any, ...A]>,
    ...args: A
  ): ContinuousTask;

  debounce<T, A extends any[]>(
    ms: number,
    listenable: Listenable<T>,
    flow: Saga<[T, ...A]>,
    ...args: A
  ): ContinuousTask;
  debounce<T, A extends any[]>(
    ms: number,
    atom: Atom<T>,
    flow: Saga<[T, ...A]>,
    ...args: A
  ): ContinuousTask;
  debounce<A extends any[]>(
    ms: number,
    listenables: ListenableList,
    flow: Saga<[any, ...A]>,
    ...args: A
  ): ContinuousTask;

  throttle<T, A extends any[]>(
    ms: number,
    listenable: Listenable<T>,
    flow: Saga<[T, ...A]>,
    ...args: A
  ): ContinuousTask;
  throttle<T, A extends any[]>(
    ms: number,
    atom: Atom<T>,
    flow: Saga<[T, ...A]>,
    ...args: A
  ): ContinuousTask;
  throttle<A extends any[]>(
    ms: number,
    listenables: ListenableList,
    flow: Saga<[any, ...A]>,
    ...args: A
  ): ContinuousTask;

  sequential<T, A extends any[]>(
    listenable: Listenable<T>,
    flow: Saga<[T, ...A]>,
    ...args: A
  ): ContinuousTask;
  sequential<T, A extends any[]>(
    atom: Atom<T>,
    flow: Saga<[T, ...A]>,
    ...args: A
  ): ContinuousTask;
  sequential<A extends any[]>(
    listenables: ListenableList,
    flow: Saga<[any, ...A]>,
    ...args: A
  ): ContinuousTask;

  restartable<T, A extends any[]>(
    listenable: Listenable<T>,
    flow: Saga<[T, ...A]>,
    ...args: A
  ): ContinuousTask;
  restartable<T, A extends any[]>(
    atom: Atom<T>,
    flow: Saga<[T, ...A]>,
    ...args: A
  ): ContinuousTask;
  restartable<A extends any[]>(
    listenables: ListenableList,
    flow: Saga<[any, ...A]>,
    ...args: A
  ): ContinuousTask;

  droppable<T, A extends any[]>(
    listenable: Listenable<T>,
    flow: Saga<[T, ...A]>,
    ...args: A
  ): ContinuousTask;
  droppable<T, A extends any[]>(
    atom: Atom<T>,
    flow: Saga<[T, ...A]>,
    ...args: A
  ): ContinuousTask;
  droppable<A extends any[]>(
    listenables: ListenableList,
    flow: Saga<[any, ...A]>,
    ...args: A
  ): ContinuousTask;

  infinite<A extends any[], R extends void | boolean | Promise<void | boolean>>(
    callback: (...args: A) => R,
    ...args: A
  ): R;
};

export type Task<T = void> = Cancellable &
  Awaitable & {
    (): Promise<T>;
    result(): T;
    status(): TaskStatus;
    error(): any;
  };

export type Signal<T = void> = Awaitable & {
  (payload: T): void;
  payload(): T;
};

export type SignalStatus = "idle" | "active" | "pausing";

export type CustomSignal<T> = Awaitable & {
  payload(): T;
  status(): SignalStatus;
  pause(): CustomSignal<T>;
  start(): CustomSignal<T>;
  start(flush: boolean): CustomSignal<T>;
  end(): CustomSignal<T>;
};

export type SignalEmitter<T> = (
  emit: (payload: T) => void,
  end: VoidFunction
) => VoidFunction | void;

export type CreateSignal = {
  <T = void>(): Signal<T>;
  <T = void>(emitter: SignalEmitter<T>): CustomSignal<T>;
};

const isAwaitableProp = "$$awaitable";
const isCancellableProp = "$$cancellable";
const isEmittableProp = "$$emittable";
const isTaskProp = "$$task";
const isSignalProp = "$$signal";
const noop = () => {};
const forever = new Promise<any>(noop);

const isAwaitable = (value: any): value is Awaitable =>
  value && value[isAwaitableProp];

const isCancellable = (value: any): value is Cancellable =>
  value && value[isCancellableProp];

const isTask = <T = any>(value: any): value is Task<T> =>
  value && value[isTaskProp];

const isSignal = <T = any>(value: any): value is Signal<T> =>
  value && value[isSignalProp];

const isEmittable = <T = any>(value: any): value is Emittable<T> =>
  value && value[isEmittableProp];

const createCancellable = (onCancel?: VoidFunction): Cancellable => {
  let cancelled = false;
  return Object.assign(
    {
      cancelled: () => cancelled,
      cancel() {
        if (cancelled) return;
        cancelled = true;
        onCancel?.();
      },
    },
    { [isCancellableProp]: true }
  );
};

const createSignal: CreateSignal = (emitter?: SignalEmitter<void>): any => {
  const emittable = createEmittable();
  let payload: any;

  const signal: Signal = Object.assign(
    (value: any) => {
      if (emitter) {
        throw new Error("Cannot emit the signal manually");
      }
      payload = value;
      emittable.emit();
    },
    {
      [isSignalProp]: true,
      [isAwaitableProp]: true,
      payload: () => payload,
      on: emittable.on,
    }
  );

  if (emitter) {
    let status: SignalStatus = "idle";
    let dispose: VoidFunction | void;
    const queue: any[] = [];
    const end = () => {
      if (status === "idle") {
        return signal;
      }
      status = "idle";
      queue.length = 0;
      if (typeof dispose === "function") {
        dispose();
      }
      emittable.clear();
      return signal;
    };
    const emit = (payload: void) => {
      if (status !== "active") {
        if (status === "pausing") {
          queue.push(payload);
        }
        return;
      }
      emittable.emit(payload);
    };
    const start = (flush?: boolean) => {
      if (status === "active") {
        return signal;
      }
      const q = queue.slice();
      queue.length = 0;
      if (status === "pausing") {
        status = "active";
        flush && q.forEach(emittable.emit);
      } else {
        status = "active";
        dispose = emitter(emit, end);
      }
      return signal;
    };
    const pause = () => {
      if (status !== "active") {
        return signal;
      }
      status = "pausing";
      return signal;
    };

    return Object.assign(signal, { start, status: () => status, pause, end });
  }

  return signal;
};

const createEmittable = <T = void>(): Emittable<T> => {
  const callbacks = createCallbackGroup();
  return Object.assign(
    {
      on: callbacks.add,
      emit: callbacks.call,
      clear: callbacks.clear,
    },
    {
      [isEmittableProp]: true,
      [isAwaitableProp]: true,
    }
  );
};

const createTask = <T = void>(
  fn: (context: SagaContext) => T | Promise<T>,
  parentContext?: SagaContext
): Task<T> => {
  let status: TaskStatus = "idle";
  let error: any;
  let result: T;
  let promise: Promise<T>;

  const forkedTasks: Task<any>[] = [];
  const emittable = createEmittable();
  const context = createTaskContext(
    (ex) => {
      if (status !== "running") return;
      error = ex;
      status = "error";
      emittable.emit();
    },
    (forkedTask) => {
      forkedTasks.push(forkedTask);
    }
  );
  const dispose = () => {
    const disposeContext = (context as any).dispose as VoidFunction;
    if (forkedTasks.length) {
      const handleForkedTaskDone = () => {
        disposeContext();
      };
      forkedTasks.forEach((task) => {
        if (task.status() === "running") {
          task.on(handleForkedTaskDone);
        }
      });
    } else {
      disposeContext();
    }
  };

  if (parentContext) {
    parentContext.onDispose(context.cancel);
  }

  context.onCancel(() => {
    status = "cancelled";
  });

  return Object.assign(
    () => {
      if (status !== "idle") return promise;
      status = "running";
      try {
        const r = fn(context);
        if (r && typeof (r as any).cancel === "function") {
          context.onDispose((r as any).cancel);
        }
        if (isPromiseLike(r)) {
          promise = new Promise<T>((resolve, reject) => {
            r.then((value) => {
              if (status !== "running") return;
              result = value;
              status = "success";
              dispose();
              emittable.emit();
              resolve(value);
            }).catch((ex) => {
              if (status !== "running") return;
              error = ex;
              status = "error";
              dispose();
              emittable.emit();
              reject(ex);
            });
          });
        } else {
          status = "success";
          dispose();
          emittable.emit();
          promise = Promise.resolve(r);
        }
      } catch (ex) {
        error = ex;
        status = "error";
        dispose();
        emittable.emit();
        promise = Promise.reject(ex);
      }
      // always catch error
      promise.catch(noop);
      return promise;
    },
    {
      [isCancellableProp]: true,
      [isAwaitableProp]: true,
      [isTaskProp]: true,
      cancel: context.cancel,
      cancelled() {
        return (
          context.cancelled() ||
          (parentContext ? parentContext.cancelled() : false)
        );
      },
      on: emittable.on,
      result: () => result,
      status: () => status,
      error: () => error,
    }
  );
};

const spawn = <A extends any[] = [], R = any>(
  flow: Saga<A, R>,
  ...args: A
): Task<R> => {
  const task = createTask((context) => flow(context, ...args));
  task();
  return task;
};

const throwError = (context: SagaContext, error: any) => {
  (context as any).throwError(error);
};

const forEachSignalList = (
  listenables: ListenableList,
  callback: (listenable: Listenable<any>) => void
) => {
  if (isSignal(listenables) || isAtom(listenables)) {
    callback(listenables);
  } else if (Array.isArray(listenables)) {
    listenables.forEach((listenable) =>
      forEachSignalList(listenable, callback)
    );
  }
};

const listen = (
  listenables: ListenableList,
  parentContext: SagaContext,
  callback: (
    context: SagaContext,
    signal: Listenable<any>,
    prevTask: Task<any> | undefined
  ) => void,
  mode?: "sequential" | "droppable"
) => {
  let maxTimes = Number.MAX_VALUE;

  return Object.assign(
    parentContext.fork(async (listenContext) => {
      const cleanup = createCallbackGroup();
      const signalQueue: Listenable<any>[] = [];
      let done: Function | undefined;
      let currentTask: Task<any> | undefined;
      let taskDoneHandled = false;
      let times = 0;
      const createForkedTask = (listenable: Listenable<any>) =>
        listenContext.fork(
          callback,
          isAtom(listenable) ? listenable.state : listenable.payload(),
          currentTask
        );
      const stopIfPossible = () => {
        if (times < maxTimes) return;
        cleanup.call();
        done?.();
      };

      const handleTaskDone = () => {
        if (listenContext.cancelled()) return;
        if (!signalQueue.length) return;
        if (taskDoneHandled) return;
        times++;
        currentTask = createForkedTask(signalQueue.shift()!);
        taskDoneHandled = true;
        currentTask.on(() => {
          if (currentTask?.error()) {
            throwError(listenContext, currentTask.error());
            return;
          }
          taskDoneHandled = false;
          handleTaskDone();
        });
        stopIfPossible();
      };

      forEachSignalList(listenables, (listenable) => {
        cleanup.add(
          listenable.on(() => {
            if (listenContext.cancelled()) return;
            if (mode === "droppable" && currentTask?.status() === "running") {
              return;
            }

            if (mode === "sequential") {
              signalQueue.push(listenable);
              handleTaskDone();
            } else {
              times++;
              currentTask = createForkedTask(listenable);
              stopIfPossible();
            }
          })
        );
      });
      cleanup.add(parentContext.onDispose(cleanup.call));
      listenContext.onDispose(cleanup.call);
      await new Promise((resolve) => {
        done = resolve;
      });
    }),
    {
      once() {
        maxTimes = 1;
        return this;
      },
      times(value: number) {
        maxTimes = value;
        return this;
      },
    }
  ) as ContinuousTask;
};

const isAbortControllerSupported = typeof AbortController !== "undefined";
const createTaskContext = (
  handleError: (error: any) => void,
  handleForkedTask: (task: Task<any>) => void
): SagaContext => {
  let disposed = false;
  let abortController: AbortController | undefined;
  const onCancel = createCallbackGroup();
  const onDispose = createCallbackGroup();
  const onError = createCallbackGroup();
  const cancellable = createCancellable(() => {
    onCancel.call();
    onDispose.call();
  });

  const wait = (awaitables: any, mode: "race" | "all" | "allSettled") => {
    return new Promise<any>((resolve, reject) => {
      const results: Record<string, AsyncResult<any>> = {};
      const cleanup = createCallbackGroup();
      let awaitableCount = 0;
      let dones = 0;

      cleanup.add(onDispose.add(cleanup.call));

      const handleDone = (key: string, result?: any, error?: any) => {
        results[key] = { result, error };

        if (error && mode !== "allSettled") {
          cleanup.call();
          reject(error);
          return;
        }

        dones++;

        if (mode === "race" || dones >= awaitableCount) {
          cleanup.call();
          resolve(results);
          return;
        }
      };

      const handleTask = (key: string, task: Task<any>) => {
        if (task.status() !== "running") {
          handleDone(key, task.result(), task.error());
          return;
        }
        cleanup.add(
          task.on(() => handleDone(key, task.result(), task.error()))
        );
        cleanup.add(task.cancel);
      };

      Object.keys(awaitables).forEach((key) => {
        awaitableCount++;
        const awaitable: Awaitable | Promise<any> | Saga = awaitables[key];

        if (isPromiseLike(awaitable)) {
          const task = createTask(() => awaitable);
          task();
          return handleTask(key, task);
        }

        if (isTask(awaitable)) {
          return handleTask(key, awaitable);
        }

        if (isSignal(awaitable)) {
          cleanup.add(awaitable.on(() => handleDone(key, awaitable.payload())));
          return;
        }

        if (typeof awaitable === "function") {
          return handleTask(key, context.fork(awaitable));
        }

        // normal awaitable
        cleanup.add(awaitable.on(() => handleDone(key)));
      });
    });
  };

  const context: SagaContext = {
    ...cancellable,
    onCancel: onCancel.add,
    onDispose: onDispose.add,
    onError: onError.add,
    abortController() {
      if (!abortController && isAbortControllerSupported) {
        abortController = new AbortController();
        onCancel.add(() => abortController?.abort());
      }
      return abortController;
    },
    race(awaitables) {
      return wait(awaitables, "race");
    },
    delay(ms?: number, value?: any) {
      return context.when(delay(ms, value));
    },
    callback(fn) {
      return (...args: Parameters<typeof fn>) => {
        if (cancellable.cancelled()) return;
        return fn(...args);
      };
    },
    call(effect, ...args): any {
      const result = effect(context, ...args);
      if (isPromiseLike(result)) {
        return new Promise((resolve, reject) => {
          result.then(
            (value) => {
              if (cancellable.cancelled()) return;
              resolve(value);
            },
            (reason) => {
              if (cancellable.cancelled()) return;
              reject(reason);
            }
          );
        });
      }
      return result;
    },
    when(target) {
      // is promise
      if (isPromiseLike(target)) {
        return Object.assign(
          new Promise<any>((resolve, reject) => {
            target.then(
              (value) => {
                if (cancellable.cancelled()) return;
                resolve(value);
              },
              (reason) => {
                if (cancellable.cancelled()) return;
                reject(reason);
              }
            );
          }),
          { cancel: (target as any).cancel }
        );
      }
      // is signal
      return new Promise<any>((resolve) => {
        const cleanup = createCallbackGroup();
        onDispose.add(cleanup.call);
        cleanup.add(
          target.on(() => {
            if (cancellable.cancelled()) return;
            resolve(
              isAtom(target)
                ? target.state
                : isSignal(target)
                ? target.payload()
                : undefined
            );
          })
        );
      });
    },
    set(atom, ...args) {
      const cancelUpdate = atom.set(...args);
      onCancel.add(cancelUpdate);
      if (atom.loading) {
        const promise = new Promise<void>((resolve, reject) => {
          onDispose.add(
            atom.on("status", () => {
              if (atom.error) {
                return reject(atom.error);
              }
              resolve();
            })
          );
        });
        // context.fork(() => promise);
        return promise;
      }
      return Promise.resolve();
    },
    emit(atom, payload) {
      atom.emit(payload);
      if (atom.loading) {
        const promise = new Promise<void>((resolve, reject) => {
          onDispose.add(
            atom.on("status", () => {
              if (atom.error) {
                return reject(atom.error);
              }
              resolve();
            })
          );
        });
        // context.fork(() => promise);
        return promise;
      }
      return Promise.resolve();
    },
    fork(effect, ...args) {
      const childTask = createTask((childContext) =>
        effect(childContext, ...args)
      );
      handleForkedTask(childTask);
      onDispose.add(childTask.cancel);
      childTask();
      return childTask;
    },
    all(awaitables) {
      return wait(awaitables, "all");
    },
    allSettled(awaitables) {
      return wait(awaitables, "allSettled");
    },
    on(listenables: ListenableList, flow: Saga, ...args: any[]) {
      return listen(listenables, context, (context, signal) =>
        flow(context, signal, ...args)
      );
    },
    debounce(
      ms: number,
      listenables: ListenableList,
      flow: Saga,
      ...args: any[]
    ) {
      let timer: any;
      return listen(listenables, context, (context, signal, prevTask) => {
        prevTask?.cancel();
        context.onCancel(() => clearTimeout(timer));

        timer = setTimeout(() => {
          flow(context, signal, ...args);
        }, ms);
      });
    },
    throttle(
      ms: number,
      listenables: ListenableList,
      flow: Saga,
      ...args: any[]
    ) {
      let lastExecution = 0;
      return listen(listenables, context, (context, signal) => {
        const now = Date.now();
        if (lastExecution && lastExecution + ms > now) return;
        lastExecution = now;
        return flow(context, signal, ...args);
      });
    },
    sequential(listenables: ListenableList, flow: Saga, ...args: any[]) {
      return listen(
        listenables,
        context,
        (context, listenable) => flow(context, listenable, ...args),
        "sequential"
      );
    },
    restartable(listenables: ListenableList, flow: Saga, ...args: any[]) {
      return listen(listenables, context, (context, listenable, prevTask) => {
        prevTask?.cancel();
        return flow(context, listenable, ...args);
      });
    },
    droppable(listenables: ListenableList, flow: Saga, ...args: any[]) {
      return listen(
        listenables,
        context,
        (context, listenable) => flow(context, listenable, ...args),
        "droppable"
      );
    },
    infinite(callback, ...args) {
      const next = (): any => {
        if (cancellable.cancelled()) return;
        const result = callback(...args);
        if (result === false) return;
        if (isPromiseLike(result)) {
          return result.finally(next);
        }
        return next();
      };

      return next();
    },
  };

  Object.assign(context, {
    dispose() {
      if (disposed) return;
      disposed = true;
      onDispose.call();
    },
    throwError(error: any) {
      onError.call(error);
      handleError(error);
    },
  });

  return context;
};

export {
  forever,
  createSignal as signal,
  createTask as task,
  SagaContext as SC,
  delay,
  spawn,
  isTask,
  isSignal,
  isAwaitable,
  isEmittable,
  isCancellable,
};

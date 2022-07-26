import { createCallbackGroup } from "../util/createCallbackGroup";
import { isPromiseLike } from "../util/isPromiseLike";
import { delay } from "../util/delay";

export type TaskStatus = "idle" | "running" | "error" | "success" | "cancelled";

export type Flow<A extends any[] = any[], R = any> = (
  context: FlowContext,
  ...args: A
) => R | Promise<R>;

export type Awaitable<T = void> = {
  on(listener: (value: T) => void): VoidFunction;
};

export type Emittable<T = void> = Awaitable<T> & {
  emit(payload: T): void;
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
    : T[key] extends Flow<any[], infer V>
    ? AsyncResult<V>
    : never;
};

export type SignalList = Signal | (Signal | SignalList)[];

export type AwaitableMap = Record<
  string,
  Flow<any[], any> | Awaitable | Promise<any>
>;

export type FlowContext = Cancellable & {
  onCancel(listener: VoidFunction): VoidFunction;
  onDispose(listener: VoidFunction): VoidFunction;
  onError(listener: (error: any) => void): VoidFunction;
  race<T extends AwaitableMap>(awaitables: T): Promise<Partial<WaitResult<T>>>;
  all<T extends AwaitableMap>(awaitables: T): Promise<WaitResult<T>>;
  allSettled<T extends AwaitableMap>(awaitables: T): Promise<WaitResult<T>>;
  fork<A extends any[], R = void>(flow: Flow<A, R>, ...args: A): Task<R>;

  call<A extends any[], R>(flow: Flow<A, R>, ...args: A): R;

  callback<A extends any[]>(fn: (...args: A) => void): (...args: A) => void;

  delay(): Promise<void>;
  delay(ms: number): Promise<void>;
  delay<T>(ms: number, value: T): Promise<T>;

  when<T>(promise: Promise<T>): Promise<T>;
  when<T>(signal: Signal<T>): Promise<T>;

  on<T, A extends any[]>(
    signal: Signal<T>,
    flow: Flow<[T, ...A]>,
    ...args: A
  ): Task;
  on<A extends any[]>(
    signals: SignalList,
    flow: Flow<[any, ...A]>,
    ...args: A
  ): Task;

  debounce<T, A extends any[]>(
    ms: number,
    signal: Signal<T>,
    flow: Flow<[T, ...A]>,
    ...args: A
  ): Task;
  debounce<A extends any[]>(
    ms: number,
    signals: SignalList,
    flow: Flow<[any, ...A]>,
    ...args: A
  ): Task;

  throttle<T, A extends any[]>(
    ms: number,
    signal: Signal<T>,
    flow: Flow<[T, ...A]>,
    ...args: A
  ): Task;
  throttle<A extends any[]>(
    ms: number,
    signals: SignalList,
    flow: Flow<[any, ...A]>,
    ...args: A
  ): Task;

  sequential<T, A extends any[]>(
    signal: Signal<T>,
    flow: Flow<[T, ...A]>,
    ...args: A
  ): Task;
  sequential<A extends any[]>(
    signals: SignalList,
    flow: Flow<[any, ...A]>,
    ...args: A
  ): Task;

  restartable<T, A extends any[]>(
    signal: Signal<T>,
    flow: Flow<[T, ...A]>,
    ...args: A
  ): Task;
  restartable<A extends any[]>(
    signals: SignalList,
    flow: Flow<[any, ...A]>,
    ...args: A
  ): Task;

  droppable<T, A extends any[]>(
    signal: Signal<T>,
    flow: Flow<[T, ...A]>,
    ...args: A
  ): Task;
  droppable<A extends any[]>(
    signals: SignalList,
    flow: Flow<[any, ...A]>,
    ...args: A
  ): Task;

  infinite<A extends any[], R>(callback: (...args: A) => R, ...args: A): void;
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

export type CreateSignal = {
  (): Signal<void>;
  <T>(): Signal<T>;
};

const isAwaitableProp = "$$awaitable";
const isCancellableProp = "$$cancellable";
const isEmittableProp = "$$emittable";
const isTaskProp = "$$task";
const isSignalProp = "$$signal";
const noop = () => {};
const forever = new Promise(noop);

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

const createSignal: CreateSignal = () => {
  const emittable = createEmittable();
  let payload: any;

  return Object.assign(
    (value: any) => {
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
};

const createEmittable = <T = void>(): Emittable<T> => {
  const callbacks = createCallbackGroup();
  return Object.assign(
    {
      on: callbacks.add,
      emit: callbacks.call,
    },
    {
      [isEmittableProp]: true,
      [isAwaitableProp]: true,
    }
  );
};

const createTask = <T = void>(
  fn: (context: FlowContext) => T | Promise<T>,
  parentContext?: FlowContext
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
  flow: Flow<A, R>,
  ...args: A
): Task<R> => {
  const task = createTask((context) => flow(context, ...args));
  task();
  return task;
};

const throwError = (context: FlowContext, error: any) => {
  (context as any).throwError(error);
};

const forEachSignalList = (
  signals: SignalList,
  callback: (signal: Signal<any>) => void
) => {
  if (isSignal(signals)) {
    callback(signals);
  } else if (Array.isArray(signals)) {
    signals.forEach((signal) => forEachSignalList(signal, callback));
  }
};

const listen = (
  signals: SignalList,
  parentContext: FlowContext,
  callback: (
    context: FlowContext,
    signal: Signal<any>,
    prevTask: Task<any> | undefined
  ) => void,
  mode?: "sequential" | "droppable"
) => {
  return parentContext.fork(async (listenContext) => {
    const cleanup = createCallbackGroup();
    const signalQueue: Signal<any>[] = [];
    let currentTask: Task<any> | undefined;
    let taskDoneHandled = false;

    const handleTaskDone = () => {
      if (listenContext.cancelled()) return;
      if (!signalQueue.length) return;
      if (taskDoneHandled) return;
      const signal = signalQueue.shift()!;
      currentTask = listenContext.fork(callback, signal.payload(), currentTask);
      taskDoneHandled = true;
      currentTask.on(() => {
        if (currentTask?.error()) {
          throwError(listenContext, currentTask.error());
          return;
        }
        taskDoneHandled = false;
        handleTaskDone();
      });
    };

    forEachSignalList(signals, (signal) => {
      cleanup.add(
        signal.on(() => {
          if (listenContext.cancelled()) return;
          if (mode === "droppable" && currentTask?.status() === "running") {
            return;
          }

          if (mode === "sequential") {
            signalQueue.push(signal);
            handleTaskDone();
          } else {
            currentTask = listenContext.fork(
              callback,
              signal.payload(),
              currentTask
            );
          }
        })
      );
    });
    cleanup.add(parentContext.onDispose(cleanup.call));
    listenContext.onDispose(cleanup.call);
    await forever;
  });
};

const createTaskContext = (
  handleError: (error: any) => void,
  handleForkedTask: (task: Task<any>) => void
): FlowContext => {
  let disposed = false;
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
        const awaitable: Awaitable | Promise<any> | Flow = awaitables[key];

        if (isPromiseLike(awaitable)) {
          const task = createTask(() => awaitable);
          task();
          return handleTask(key, task);
        }

        if (isTask(awaitable)) {
          return handleTask(key, awaitable);
        }

        if (typeof awaitable === "function") {
          return handleTask(key, context.fork(awaitable));
        }

        if (isSignal(awaitable)) {
          cleanup.add(awaitable.on(() => handleDone(key, awaitable.payload())));
          return;
        }

        // normal awaitable
        cleanup.add(awaitable.on(() => handleDone(key)));
      });
    });
  };

  const context: FlowContext = {
    ...cancellable,
    onCancel: onCancel.add,
    onDispose: onDispose.add,
    onError: onError.add,
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
            resolve(target.payload());
          })
        );
      });
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
    on(signals: SignalList, flow: Flow, ...args: any[]) {
      return listen(signals, context, (context, signal) =>
        flow(context, signal, ...args)
      );
    },
    debounce(ms: number, signals: SignalList, flow: Flow, ...args: any[]) {
      let timer: any;
      return listen(signals, context, (context, signal, prevTask) => {
        prevTask?.cancel();
        context.onCancel(() => clearTimeout(timer));

        timer = setTimeout(() => {
          flow(context, signal, ...args);
        }, ms);
      });
    },
    throttle(ms: number, signals: SignalList, flow: Flow, ...args: any[]) {
      let lastExecution = 0;
      return listen(signals, context, (context, signal) => {
        const now = Date.now();
        if (lastExecution && lastExecution + ms > now) return;
        lastExecution = now;
        return flow(context, signal, ...args);
      });
    },
    sequential(signals: SignalList, flow: Flow, ...args: any[]) {
      return listen(
        signals,
        context,
        (context, signal) => flow(context, signal, ...args),
        "sequential"
      );
    },
    restartable(signals: SignalList, flow: Flow, ...args: any[]) {
      return listen(signals, context, (context, signal, prevTask) => {
        prevTask?.cancel();
        return flow(context, signal, ...args);
      });
    },
    droppable(signals: SignalList, flow: Flow, ...args: any[]) {
      return listen(
        signals,
        context,
        (context, signal) => flow(context, signal, ...args),
        "droppable"
      );
    },
    infinite(callback, ...args) {
      while (true) {
        if (cancellable.cancelled()) break;
        callback(...args);
      }
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
  createSignal as signal,
  createTask as task,
  delay,
  spawn,
  isTask,
  isSignal,
  isAwaitable,
  isEmittable,
  isCancellable,
};

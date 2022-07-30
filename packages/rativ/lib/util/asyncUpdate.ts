export type Updater<T, A extends any[]> = {
  getValue(): T;
  isStale(): boolean;
  update(...args: A): void;
  cancel(): void;
};

const asyncUpdate = <T, A extends any[]>(
  current: T,
  getSnapshot: () => any,
  dispatchUpdate: (...args: A) => T
): Updater<T, A> => {
  let originalVersion = getSnapshot();
  const getValue = () => current;
  const isStale = () => getSnapshot() !== originalVersion;
  const update = (...args: A) => {
    if (isStale()) return;
    current = dispatchUpdate(...args);
    originalVersion = getSnapshot();
  };
  const cancel = () => {
    originalVersion = {};
  };
  return {
    getValue,
    isStale,
    update,
    cancel,
  };
};

export { asyncUpdate };

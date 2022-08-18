export type Updater<T, A extends any[]> = {
  getValue(): T;
  isStale(): boolean;
  update(...args: A): void;
  cancel(): void;
};

const asyncUpdate = <T, A extends any[]>(
  current: T,
  getCurrentSnapshot: () => any,
  dispatchUpdate: (...args: A) => T
): Updater<T, A> => {
  let currentSnapshot = getCurrentSnapshot();
  const getValue = () => current;
  const isStale = () => getCurrentSnapshot() !== currentSnapshot;
  const update = (...args: A) => {
    if (isStale()) return;
    current = dispatchUpdate(...args);
    currentSnapshot = getCurrentSnapshot();
  };
  const cancel = () => {
    currentSnapshot = {};
  };
  return {
    getValue,
    isStale,
    update,
    cancel,
  };
};

export { asyncUpdate };

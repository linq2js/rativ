export type Updater<T, A extends any[]> = {
  getValue(): T;
  isStale(): boolean;
  update(...args: A): void;
  cancel(): void;
};

export const asyncUpdate = <T, A extends any[]>(
  current: T,
  getVersion: () => any,
  performUpdate: (...args: A) => T
): Updater<T, A> => {
  let originalVersion = getVersion();
  const getValue = () => current;
  const isStale = () => getVersion() !== originalVersion;
  const update = (...args: A) => {
    if (isStale()) return;
    current = performUpdate(...args);
    originalVersion = getVersion();
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

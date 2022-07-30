export type CallbackGroup = {
  /**
   * add callback into the group and return `remove` function
   * @param callback
   */
  add(callback: Function): VoidFunction;
  called(): number;
  /**
   * call all callbacks with specified args
   * @param args
   */
  call(...args: any[]): void;
  /**
   * remove all callbacks
   */
  clear(): void;
  size(): number;
};

const createCallbackGroup = (): CallbackGroup => {
  const callbacks: Function[] = [];
  let called = 0;

  return {
    size: () => callbacks.length,
    called: () => called,
    add(callback: Function) {
      callbacks.push(callback);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        const index = callbacks.indexOf(callback);
        if (index !== -1) callbacks.splice(index, 1);
      };
    },
    clear() {
      callbacks.length = 0;
    },
    call(...args: any[]) {
      // optimize performance
      if (args.length > 2) {
        callbacks.slice().forEach((callback) => callback(...args));
      } else if (args.length === 2) {
        callbacks.slice().forEach((callback) => callback(args[0], args[1]));
      } else if (args.length === 1) {
        callbacks.slice().forEach((callback) => callback(args[0]));
      } else {
        callbacks.slice().forEach((callback) => callback());
      }
    },
  };
};

export { createCallbackGroup };

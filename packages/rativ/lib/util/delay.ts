export const delay = <T>(ms = 0, value?: T) => {
  let timer: any;
  return Object.assign(
    new Promise<T>((resolve) => (timer = setTimeout(resolve, ms, value))),
    {
      cancel() {
        clearTimeout(timer);
      },
    }
  );
};

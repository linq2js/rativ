export const delay = <T = void>(ms: number, resolved?: T) =>
  new Promise<T>((resolve) => setTimeout(resolve, ms, resolved));

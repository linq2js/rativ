const OVERLOAD = async ({ key, write }) => {
  key = parseInt(key, 10);
  if (key < 2) return;

  const params = new Array(key).fill(null);
  await write()`<P0,${params.map((_, pi) => `R${pi}`)}>(${params.map(
    (_, pi) => `r${pi}: Resolver<${pi ? `R${pi - 1}` : "P" + pi}, ${"R" + pi}>`
  )}): Resolver<P0, R${key - 1}>;`;
};

module.exports = async ({ data: { overloads }, write, $each }) => {
  await write()`
    import type { Resolver } from "./types";

    export type Pipe = {
        ${$each(new Array(overloads).fill(null), OVERLOAD)}
    }
    `;
};

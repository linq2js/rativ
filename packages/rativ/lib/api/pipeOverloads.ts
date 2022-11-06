import type { Resolver } from "./types";

export type Pipe = {
  <P0, R0, R1>(r0: Resolver<P0, R0>, r1: Resolver<R0, R1>): Resolver<P0, R1>;
  <P0, R0, R1, R2>(
    r0: Resolver<P0, R0>,
    r1: Resolver<R0, R1>,
    r2: Resolver<R1, R2>
  ): Resolver<P0, R2>;
  <P0, R0, R1, R2, R3>(
    r0: Resolver<P0, R0>,
    r1: Resolver<R0, R1>,
    r2: Resolver<R1, R2>,
    r3: Resolver<R2, R3>
  ): Resolver<P0, R3>;
  <P0, R0, R1, R2, R3, R4>(
    r0: Resolver<P0, R0>,
    r1: Resolver<R0, R1>,
    r2: Resolver<R1, R2>,
    r3: Resolver<R2, R3>,
    r4: Resolver<R3, R4>
  ): Resolver<P0, R4>;
  <P0, R0, R1, R2, R3, R4, R5>(
    r0: Resolver<P0, R0>,
    r1: Resolver<R0, R1>,
    r2: Resolver<R1, R2>,
    r3: Resolver<R2, R3>,
    r4: Resolver<R3, R4>,
    r5: Resolver<R4, R5>
  ): Resolver<P0, R5>;
  <P0, R0, R1, R2, R3, R4, R5, R6>(
    r0: Resolver<P0, R0>,
    r1: Resolver<R0, R1>,
    r2: Resolver<R1, R2>,
    r3: Resolver<R2, R3>,
    r4: Resolver<R3, R4>,
    r5: Resolver<R4, R5>,
    r6: Resolver<R5, R6>
  ): Resolver<P0, R6>;
  <P0, R0, R1, R2, R3, R4, R5, R6, R7>(
    r0: Resolver<P0, R0>,
    r1: Resolver<R0, R1>,
    r2: Resolver<R1, R2>,
    r3: Resolver<R2, R3>,
    r4: Resolver<R3, R4>,
    r5: Resolver<R4, R5>,
    r6: Resolver<R5, R6>,
    r7: Resolver<R6, R7>
  ): Resolver<P0, R7>;
  <P0, R0, R1, R2, R3, R4, R5, R6, R7, R8>(
    r0: Resolver<P0, R0>,
    r1: Resolver<R0, R1>,
    r2: Resolver<R1, R2>,
    r3: Resolver<R2, R3>,
    r4: Resolver<R3, R4>,
    r5: Resolver<R4, R5>,
    r6: Resolver<R5, R6>,
    r7: Resolver<R6, R7>,
    r8: Resolver<R7, R8>
  ): Resolver<P0, R8>;
};

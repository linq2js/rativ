import { SagaContext } from "../saga";
import { ApiContext, Resolver } from "./types";

const memory =
  <P = void, R = void>(
    saga: (context: ApiContext & SagaContext, payload: P) => Promise<R>
  ): Resolver<P, R> =>
  (apiContext) =>
  (sagaContext, payload) => {
    return saga({ ...apiContext, ...sagaContext }, payload);
  };

export { memory };

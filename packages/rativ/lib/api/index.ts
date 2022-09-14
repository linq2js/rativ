import { ApiContext, Configs, Dictionary, Resolver } from "./types";
import { http as defaultHttp } from "./http";
import { isSagaContext, SagaContext, spawn } from "../saga";
export * from "./types";

export type Mappings<T> = {
  [key in keyof T]: T[key] extends Resolver<infer P, infer R>
    ? {
        (payload: P): Promise<R>;
        (context: SagaContext, payload: P): Promise<R>;
      }
    : never;
};

export type Definitions = { configs?: Configs } & {
  [key: string]: any;
};

const define = <T extends Definitions>({
  configs: { http, onError, dismissErrors } = {},
  ...resolvers
}: T): Mappings<T> => {
  const configs = { http, onError, dismissErrors };
  const customHttp = http?.driver ?? defaultHttp;
  const mappings: Dictionary = {};
  const shared = new Map();
  const context: ApiContext = { configs, http: customHttp, shared, mappings };
  Object.keys(resolvers).forEach((key) => {
    const saga = resolvers[key](context);
    mappings[key] = (...args: any[]) => {
      if (isSagaContext(args[0])) {
        return saga(...args);
      }
      const task = spawn(saga, args[0]);
      return task.promise;
    };
  });
  return mappings as Mappings<T>;
};

export { define };

import { ApiContext, Configs, Dictionary, Resolver } from "./types";
import { http as defaultHttp } from "./http";
import { Saga } from "../saga";
export * from "./types";

export type Mappings<T> = {
  [key in keyof T]: T[key] extends Resolver<infer P, infer R>
    ? Saga<[P], R>
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
    mappings[key] = resolvers[key](context);
  });
  return mappings as Mappings<T>;
};

export { define };

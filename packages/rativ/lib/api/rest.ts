import {
  Dictionary,
  ErrorBase,
  HttpConfigs,
  HttpMethod,
  OptionFactory,
  Resolver,
  ApiContext,
} from ".";
import { forever, SagaContext } from "../saga";
import { getOption } from "./getOption";

export interface RestOptions<P = any> extends Omit<HttpConfigs<P>, "baseUrl"> {
  method?: HttpMethod;
  convertPayloadTo?: "query" | "params" | "body";
  onError?(error: RestError): void;
  params?: OptionFactory<P, Dictionary>;
  query?: OptionFactory<P, Dictionary>;
  body?: OptionFactory<P, {} | null | undefined>;
  dismissErrors?: boolean;
}

export class RestError extends ErrorBase {
  constructor(e: any) {
    super(e);
  }
}

export interface RestConfigs extends Omit<RestOptions, "token">, HttpConfigs {}

const create =
  <P = void, R = any>(
    url: OptionFactory<P, string>,
    options?: RestOptions<P>
  ): Resolver<P, R> =>
  ({ configs, http }: ApiContext) => {
    const restConfigs = configs.$rest as RestConfigs | undefined;
    const baseUrl = restConfigs?.baseUrl ?? configs.http?.baseUrl ?? "";
    return (async (
      { abortController }: SagaContext,
      payload?: P
    ): Promise<R> => {
      const convertPayloadTo = options?.convertPayloadTo;
      const headers: Dictionary = {
        ...getOption(configs.http?.headers, payload),
        ...getOption(restConfigs?.headers, payload),
        ...getOption(options?.headers, payload),
      };
      const query: Dictionary = {
        ...(convertPayloadTo === "query"
          ? payload
          : getOption(options?.query, payload)),
      };
      const params: Dictionary = {
        ...(convertPayloadTo === "params"
          ? payload
          : getOption(options?.params, payload)),
      };
      const body =
        convertPayloadTo === "body"
          ? payload
          : getOption(options?.body, payload);

      try {
        const res = await http({
          url: `${baseUrl}${getOption(url, payload)}`.replace(
            /\{([^{}]+)\}/g,
            (_, k) => params[k] ?? ""
          ),
          method: options?.method ?? "get",
          headers,
          query,
          body,
          abortController: abortController(),
        });

        return res.data as R;
      } catch (e) {
        const error = new RestError(e);
        configs.onError?.(error);
        restConfigs?.onError?.(error);
        options?.onError?.(error);
        if (
          options?.dismissErrors ||
          restConfigs?.dismissErrors ||
          configs.dismissErrors
        ) {
          return forever;
        }
        throw e;
      }
    }) as any;
  };

const configure = (configs: RestConfigs) => ({ $rest: configs });

const createRestMethod =
  (method: HttpMethod) =>
  <P = void, R = any>(url: string, options?: Omit<RestOptions<P>, "method">) =>
    create<P, R>(url, { method: method, ...options });

/**
 * create a dispatcher that works with RESTful API
 */
const rest = Object.assign(create, {
  configs: configure,
  post: createRestMethod("post"),
  patch: createRestMethod("patch"),
  put: createRestMethod("put"),
  get: createRestMethod("get"),
  delete: createRestMethod("delete"),
  options: createRestMethod("options"),
  head: createRestMethod("head"),
});

export { rest };

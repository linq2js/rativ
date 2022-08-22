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
  extra?: any;
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
      let retries = 0;
      const retryOptions =
        options?.retry === false
          ? false
          : {
              ...(typeof configs.http?.retry === "object"
                ? configs.http?.retry
                : {}),
              ...(typeof options?.retry === "object" ? options?.retry : {}),
            };
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

      const ac = abortController();

      return new Promise<R>((resolve, reject) => {
        const request = async () => {
          if (ac?.signal.aborted) return;

          try {
            const res = await http({
              url: `${baseUrl}${getOption(url, payload)}`.replace(
                /\{([^{}]+)\}/g,
                (_, k) => params[k] ?? ""
              ),
              extra: options?.extra,
              method: options?.method ?? "get",
              headers,
              query,
              body,
              abortController: ac,
            });

            return resolve(res.data as R);
          } catch (e) {
            const error = new RestError(e);
            if (retryOptions) {
              const {
                retries: maxRetries = 1,
                delay = 0,
                onRetry,
                when,
              } = retryOptions;

              if (retries < maxRetries && (!when || when(error))) {
                retries++;
                onRetry?.();
                if (delay) {
                  // custom delay fn
                  if (typeof delay === "function") {
                    delay(request);
                  } else {
                    setTimeout(request, delay);
                  }

                  return;
                }
                request();
                return;
              }
            }

            configs.onError?.(error);
            restConfigs?.onError?.(error);
            options?.onError?.(error);

            const dismissErrors =
              options?.dismissErrors ||
              restConfigs?.dismissErrors ||
              configs.dismissErrors;

            if (dismissErrors) {
              return forever;
            }

            reject(e);
          }
        };

        request();
      });
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

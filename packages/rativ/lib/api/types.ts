import { Saga } from "../saga";

export interface ApiContext {
  configs: Configs;
  http: HttpDriver;
  shared: Map<any, any>;
  mappings: any;
}

export type Dictionary<T = any> = { [key: string]: T };

export interface HttpOptions {
  url: string;
  method?: HttpMethod;
  headers?: Dictionary;
  query?: Dictionary;
  body?: any;
  abortController?: AbortController;
}

export type HttpDriver = (options: HttpOptions) => Promise<HttpResult>;

export interface HttpResult {
  data: any;
}

export type OptionFactory<P = void, T = any> = ((payload: P) => T) | T;

export type HttpMethod =
  | "get"
  | "post"
  | "head"
  | "options"
  | "put"
  | "delete"
  | "patch";

export abstract class ErrorBase extends Error {
  constructor(e: any) {
    super(typeof e === "string" ? e : (e?.message as string));
  }
}

export interface HttpConfigs<P = any> {
  baseUrl?: string;
  /**
   * Default headers for all HTTP requests
   */
  headers?: OptionFactory<P, Dictionary>;
  /**
   * Custom HTTP driver
   */
  driver?: HttpDriver;
}

export interface Configs {
  http?: HttpConfigs;
  onError?(error: ErrorBase): void;
  dismissErrors?: boolean;
  [key: string]: any;
}

export type Resolver<P, R> = (context: ApiContext) => Saga<[P], R>;

import axios from "axios";
import { HttpOptions, HttpResult } from "./types";

export const http = (options: HttpOptions): Promise<HttpResult> => {
  const { headers, url, body, method, query, abortController } = options;
  //   console.log(url, options);
  return axios({
    url,
    method,
    headers,
    params: query,
    data: body,
    signal: abortController?.signal,
  });
};

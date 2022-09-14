import { throws } from "../main";
import { spawn } from "../saga";
import { define } from "./";
import { rest } from "./rest";

test("configs", async () => {
  const api = define({
    configs: { http: { baseUrl: "https://jsonplaceholder.typicode.com" } },
    test: rest<void, { id: number }>("/todos/1"),
  });
  const result = spawn(api.test);
  await expect(result().then((x) => x.id)).resolves.toBe(1);
});

test("convert payload to params", async () => {
  const api = define({
    configs: { http: { baseUrl: "https://jsonplaceholder.typicode.com" } },
    test: rest<{ id: number }, { id: number }>("/todos/{id}", {
      convertPayloadTo: "params",
    }),
  });
  const result = spawn(api.test, { id: 1 });
  await expect(result().then((x) => x.id)).resolves.toBe(1);
});

test("rest api", async () => {
  const api = define({
    test: rest<void, { id: number }>(
      "https://jsonplaceholder.typicode.com/todos/1"
    ),
  });
  const result = spawn(api.test);
  await expect(result().then((x) => x.id)).resolves.toBe(1);
});

test("rest api call directly", async () => {
  const api = define({
    test: rest<void, { id: number }>(
      "https://jsonplaceholder.typicode.com/todos/1"
    ),
  });
  const result = await api.test();
  expect(result.id).toBe(1);
});

test("retry #1", async () => {
  let retries = 0;
  const errors = [
    new Error("Network Error"),
    new Error("Network Error"),
    new Error("API Error"),
  ];
  const api = define({
    configs: {
      http: {
        driver: () => throws(errors.shift()!),
        retry: {
          when: (e) => e.message === "Network Error",
          retries: 1000,
          onRetry: () => retries++,
        },
      },
    },
    test: rest<void, { id: number }>(
      "https://jsonplaceholder.typicode.com/todos/1"
    ),
  });
  const result = spawn(api.test);
  await expect(result().then((x) => x.id)).rejects.toThrow("API Error");
  expect(retries).toBe(2);
});

test("retry #2", async () => {
  let retries = 0;
  const errors = [
    new Error("Network Error"),
    new Error("Network Error"),
    new Error("API Error"),
  ];
  const api = define({
    configs: {
      http: {
        driver: () => throws(errors.shift()!),
        retry: { onRetry: () => retries++ },
      },
    },
    test: rest<void, { id: number }>(
      "https://jsonplaceholder.typicode.com/todos/1"
    ),
  });
  const result = spawn(api.test);
  await expect(result().then((x) => x.id)).rejects.toThrow("Network Error");
  expect(retries).toBe(1);
});

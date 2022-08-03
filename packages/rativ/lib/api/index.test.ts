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

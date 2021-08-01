import rexq from "./index";

test("simple resolver", async () => {
  const { resolve } = rexq({ search: (_, { term }) => term });
  const result = await resolve(
    `
    search [
      $term: term
    ]
  `,
    { term: 1 }
  );
  expect(result.data.search).toBe(1);
});

test("using alias for resolver", async () => {
  const { resolve } = rexq({ search: (_, { term }) => term });
  const result = await resolve(
    `
    search:result [
      $term: term
    ]
  `,
    { term: 1 }
  );
  expect(result.data.result).toBe(1);
});

test("should not call resolver if it does not present in query", async () => {
  const { resolve } = rexq({
    SearchResult: { count: () => 2 },
    search: ["SearchResult", () => ({ count: 1 })],
  });
  const result = await resolve(`search`);
  expect(result.data.search.count).toBeUndefined();
});

test("the result resolver can overwrite property value of result", async () => {
  const { resolve } = rexq({
    SearchResult: { count: () => 2 },
    search: ["SearchResult", () => ({ count: 1 })],
  });
  const result = await resolve(`search[count]`);
  expect(result.data.search.count).toBe(2);
});

test("calling resolver order", async () => {
  const orders = [];
  const { resolve } = rexq({
    test: [
      () => (next) => {
        orders.push(1);
        return next();
      },
      () => (next) => {
        orders.push(2);
        return next();
      },
      () => (next) => {
        orders.push(3);
        return 1;
      },
    ],
  });
  const result = await resolve(`test`);
  expect(result.data.test).toBe(1);
  expect(orders).toEqual([1, 2, 3]);
});

test("middleware supported", async () => {
  const { resolve } = rexq(
    { test: (_, { value }) => value },
    {
      middleware: async (resolver) => {
        const value = await resolver();
        return value + 1;
      },
    }
  );
  const result = await resolve("test[$value: value]", { value: 1 });
  expect(result.data.test).toBe(2);
});

test("multiple resolver errors supported", async () => {
  const { resolve } = rexq({
    r1: () => 1,
    r2: () => 2,
    r3: () => {
      throw new Error("");
    },
  });
  const result = await resolve(`r1,r2,r3`);
  expect(result).toMatchObject({
    data: {
      r1: 1,
      r2: 2,
      r3: null,
    },
    errors: {
      length: 1,
    },
  });
});

test("parallel resolving", async () => {
  const order = [];
  const { resolve } = rexq({
    r1: () => delay(10).then(() => order.push(1)),
    r2: () => delay(5).then(() => order.push(2)),
    r3: () => delay(20).then(() => order.push(3)),
  });
  await resolve("r1,r2,r3");
  expect(order).toEqual([2, 1, 3]);
});

test("serial resolving", async () => {
  const order = [];
  const { resolve } = rexq({
    r1: () => delay(10).then(() => order.push(1)),
    r2: () => delay(5).then(() => order.push(2)),
    r3: () => delay(20).then(() => order.push(3)),
  });
  await resolve("r1,r2,r3", { $execute: "serial" });
  expect(order).toEqual([1, 2, 3]);
});

const delay = (ms, value) =>
  new Promise((resolve) => setTimeout(resolve, ms, value));

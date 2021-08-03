import rexq from "./index";

test("simple resolver", async () => {
  const { resolve } = rexq({ search: (_, { term }) => term });
  const result = await resolve(
    `
    search (
      $term: term
    )
  `,
    { term: 1 }
  );
  expect(result.data.search).toBe(1);
});

test("shorthand argument", async () => {
  const { resolve } = rexq({ search: (_, { term }) => term });
  const result = await resolve(`search($term)`, { term: 1 });
  expect(result.data.search).toBe(1);
});

test("using alias for resolver", async () => {
  const { resolve } = rexq({ search: (_, { term }) => term });
  const result = await resolve(
    `
    search:result($term: term)
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
  const result = await resolve(`search(count)`);
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

test("root middleware", async () => {
  const { resolve } = rexq(
    { test: (_, { value }) => value },
    {
      middleware: async (resolver) => {
        const value = await resolver();
        return value + 1;
      },
    }
  );
  const result = await resolve("test($value)", { value: 1 });
  expect(result.data.test).toBe(2);
});

test("resolver middleware", async () => {
  const { resolve } = rexq({
    test: [
      (_, { value }) =>
        (next) => {
          if (!value) throw new Error("value required");
          return next();
        },
      (_, { value }) => value,
    ],
  });
  const result1 = await resolve("test($value)", { value: 1 });
  expect(result1.data.test).toBe(1);

  const result2 = await resolve("test($value)", { value: 0 });
  expect(result2.data.test).toBeNull();
  expect(result2.errors).toEqual([
    {
      path: "test",
      message: "value required",
      stack: expect.anything(),
    },
  ]);
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

test("modularizing supported", async () => {
  const module1 = { r1: () => 1 };
  const module2 = { require: module1, r2: () => 2 };
  const { resolve } = rexq([module2]);
  const result = await resolve(`r1,r2`);
  expect(result.data).toEqual({ r1: 1, r2: 2 });
});

test("resolver tree", async () => {
  const companyModule = { company: ["Company", (_, { code }) => ({ code })] };
  const triggersModule = {
    Company: {
      triggers: (company) => {
        expect(company).not.toBeUndefined();
        return [1, 2, 3];
      },
    },
  };
  const { resolverTree, resolve } = rexq([companyModule, triggersModule]);
  const result = await resolve(
    `company($code:code, code, triggers($year: year))`,
    {
      code: "ZIM",
      year: 2019,
    }
  );

  expect(resolverTree).toEqual({
    Company: {
      triggers: "resolver",
    },
    company: "resolver",
  });

  expect(result.data.company).toEqual({
    code: "ZIM",
    triggers: [1, 2, 3],
  });
});

test("resolving non-object", async () => {
  const { resolve } = rexq({
    todoList: ["Todo", () => [1, 2, 3]],
    Todo: (id) => {
      return { id, title: `title${id}` };
    },
  });

  const result = await resolve(`todoList(id,title)`);
  expect(result.data.todoList).toEqual([
    { id: 1, title: "title1" },
    { id: 2, title: "title2" },
    { id: 3, title: "title3" },
  ]);
});

test("wildcard", async () => {
  const { resolve } = rexq({
    num: () => 1,
    Object: { c: () => 3 },
    obj: ["Object", () => ({ a: 1, b: 2 })],
  });
  const result = await resolve("num(*),obj(*)");
  expect(result.data).toEqual({
    num: 1,
    obj: { a: 1, b: 2, c: undefined },
  });
});

test("single query allowed", async () => {
  const { resolve } = rexq({});
  const result = await resolve("q1, q2", { $single: true });
  expect(result.errors).toEqual([{ path: "query", message: "Invalid query" }]);
});

test("root object", async () => {
  const { resolve } = rexq({ getRoot: (root) => root }, { root: () => 1 });
  const result = await resolve("getRoot");
  expect(result.data.getRoot).toBe(1);
});

test("fallback for server", async () => {
  const resolver = (_, args) => args.value;
  const fallback = rexq({ r3: resolver, r4: resolver });
  const { resolve } = rexq(
    { r1: resolver, r2: resolver },
    { fallback: fallback.resolve }
  );
  const result = await resolve(
    "r1($value:r1),r2($value:r2),r3($value:r3),r4($value:r4)",
    { r1: 1, r2: 2, r3: 3, r4: 4 }
  );
  expect(result.data).toEqual({
    r1: 1,
    r2: 2,
    r3: 3,
    r4: 4,
  });
});

test("fallback for client", async () => {
  const resolver = (_, args) => args.value;
  const { resolve, parse } = rexq(
    { r1: resolver, r2: resolver },
    { fallback: true }
  );
  const result = await resolve(
    "r1($value:r1),r2($value:r2),r3($value:r3),r4($value:r4)",
    { r1: 1, r2: 2, r3: 3, r4: 4 }
  );
  expect(result.data).toEqual({
    r1: 1,
    r2: 2,
  });

  expect(result.fallback).toEqual({
    query: expect.any(String),
    variables: expect.any(Object),
  });
});

test("links", async () => {
  const link1 = rexq({
    r1: (_, args) => args.value,
    r2: (_, args) => args.value,
  });
  const link2 = rexq({
    r1: (_, args) => args.value,
    r2: (_, args) => args.value,
  });
  const gateway = rexq(
    {},
    {
      links: [
        {
          execute: link1.resolve,
          resolvers: { r1: "r1($value)", r2: "r2($value)" },
        },
        {
          execute: link2.resolve,
          resolvers: { r3: "r1($value)", r4: "r2($value)" },
        },
      ],
    }
  );
  const result = await gateway.resolve(
    `r1($value:r1), r2($value:r2), r3($value:r3), r4($value:r4)`,
    { r1: 1, r2: 2, r3: 3, r4: 4 }
  );

  expect(result.data).toEqual({
    r1: 1,
    r2: 2,
    r3: 3,
    r4: 4,
  });
});

test("links with placeholder", async () => {
  const remoteLink = rexq({
    remoteParent: ["_Parent", () => ({})],
    _Parent: {
      child1: (_, args) => args.value,
      child2: (_, args) => args.value,
    },
  });
  const { resolve } = rexq(
    {},
    {
      links: {
        execute: remoteLink.resolve,
        resolvers: {
          parent: "remoteParent(?)",
        },
      },
    }
  );
  const result = await resolve(
    `parent( child1( $value:child1 ), child2( $value: child2) )`,
    { child1: "abc", child2: "def" }
  );
  expect(result.data).toEqual({
    parent: {
      child1: "abc",
      child2: "def",
    },
  });
});

const delay = (ms, value) =>
  new Promise((resolve) => setTimeout(resolve, ms, value));

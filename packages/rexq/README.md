# REXQ

## Installation

**npm**

```bash
npm i rexq --save
```

**yarn**

```bash
yarn add rexq
```

## Features

- No schema/typeDefs required
- Lightweight
- Easy to use and setup
- Simple query language
- Resolver middleware supported (apply for root/resolver level)
- Modularize supported
- No dependencies
- Compatible with many REST libs/frameworks
- File download/upload supported
- HTTP Redirect supported
- Can handle query and mutate data in one request
- Parallel/Serial executing supported

## Getting started

Building rexq app using express

```js
import express from "express";
import rexq from "rexq";

// create express app
const app = express();

// define resolvers
const resolvers = {
  greeting: (_, { name }) => `Hello ${name}!`,
};

// creating query resolver
const { resolve } = rexq(resolvers);

app.get("/", (req, res) =>
  resolve(
    // rexq query
    req.query.query,
    // using request query as rexq query variables
    req.query
  )
    // resolve function returns a promise
    // wait until the promise resolved and send the result to client in JSON format
    .then((result) => res.json(result))
);

app.listen(3000);
```

Open this url "http://localhost:3000/?query=greeting[$name:name]&name=World" in the browser you will got the result below

```json
{ "data": { "greeting": "Hello World!" }, "errors": [] }
```

### Explaining query syntax

In this example we try to call **greeting** resolver and pass **name** argument to the resolver

```
greeting[ => resolver name
    $name:name => resolver argument
]
```

The name argument's value is extracted from req.query

```
&name=World
```

The **greeting** can retrieve **name** its arguments by destructing second function argument

```js
const greeting = (parent, args) => {
  const { name } = args;
  return `Hello ${name}!`;
};
```

## Rexq Query Syntax

### Selector

Rexq parses the query and call all resolvers which matches given selector. The query can contains multiple root selectors, the selectors are separated by comma

**Query**

```
    selector1, selector2, selector2
```

**Example**

```js
const resolvers = {
  selector1: () => 1,
  selector2: () => 2,
  selectro3: () => 3,
};

const result = {
  data: {
    selector1: 1,
    selector2: 2,
    selector3: 3,
  },
  errors: [],
};
```

### Nested Selector

**Query**

```
    search[
        id,
        title
    ]
```

**Example**

```js
const resolvers = {
  search: () => {
    return [
      { id: 1, title: "result 1", description: "desc 1" },
      { id: 2, title: "result 2", description: "desc 2" },
      { id: 3, title: "result 3", description: "desc 3" },
    ];
  },
};

const result = {
  data: {
    search: [
      // the description field values will be ignored because the client only selects id and title fields
      { id: 1, title: "result 1" },
      { id: 2, title: "result 2" },
      { id: 3, title: "result 3" },
    ],
  },
};
```

### Passing arguments

**Query**

```
    search[
        $term: searchTermVariable
    ]
    $term => argument name of search resolver
    searchTermVariable => variable name
```

**Example**

```js
const resolvers = {
  search: (_, args) => {
    return `Search results of ${args.term}`;
  },
};
const variables = { searchTermVariable: "Something" };
const result = resolve(query, variables);
/*
{
  data: { search: "Search results of Something" },
  errors: [],
}
*/
```

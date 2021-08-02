# REXQ

Extensible Query for REST API

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

Open this url "http://localhost:3000/?query=greeting($name:name)&name=World" in the browser you will got the result below

```json
{ "data": { "greeting": "Hello World!" }, "errors": [] }
```

### Explaining query syntax

In this example we try to call **greeting** resolver and pass **name** argument to the resolver

```
greeting( => resolver name
    $name:name => resolver argument
)
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
    search(id, title)
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
    search(
        $term: searchTermVariable
    )
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

### Argument shorthand

Query

```
  search($term) => using term variable value for term argument
```

## Middlware

### Root level middleware

```js
const resolvers = { hello: () => "Hello World" };
const LogMiddleware = async (next, parent, args, context, info) => {
  console.log("start");
  // dont need to pass (parent, args, context, info) to next middleware
  // rexq fills missing args automatically
  // or you can call next(modifiedParent, modifiedArgs) rexq will fill the rest args (context, info)
  const result = await next();
  console.log("end");
  return result;
};
const { resolve } = rexq(resolvers, {
  // can pass multiple middlewares here  { middleware: [m1, m2, m3] }
  middleware: LogMiddleware,
});
```

### Resolver level middleware

Let's say we have some middlewares for security and validation

```js
import * as yup from "yup";

const auth =
  (user) =>
  // return a resolver
  (parent, args, context, info) =>
  // if the resolver returns a function, that function will retrive next resolver as first argument
  (next) => {
    if (!context.user || (user !== "*" && user !== context.user)) {
      throw new Error("Access Denied");
    }
    // dont need to pass all arguments to next middleware
    // rexq will do that for you
    return next();
  };

const validate = (schema) => (parent, args) => (next) => {
  const transformedArgs = await schema.isValid(args);
  return next(parent, transformedArgs);
};

const searchResolver = (parent, { term }) => {
  return `Search result of ${term}`;
};

const profileResolver = (parent, args, context) => {
  return { name: context.user };
};

const userListResolver = () => {
  return [{ id: 1 }, { id: 2 }, { id: 3 }];
};

const resolvers = {
  search: [
    validate(
      yup.object().shape({
        term: yup.string().required(),
      })
    ),
    searchResolver,
  ],
  // this resolver can be called by any users
  profile: [auth("*"), profileResolver],
  // this resolver can be called by admin users only
  userList: [auth("admin"), userListResolver],
};
```

## Indicate query executing mode

By default, rexq executes query in parallel mode, but users can force query executing in Serial mode

**Query**

```
  resolver1,resolver2,resolver3
```

**Example**

```js
const resolvers = {
  resolver1: async () => {
    await delay(1000);
  },
  resolver2: async () => {
    await delay(200);
  },
  resolver3: async () => {
    await delay(500);
  },
};
resolve(query, { $execute: "serial" });
```

```
with $execute = "serial"
=> resolver1, resolver2, resolver3

without $execute = "serial" or $execute = "parallel"
=> resolver2, resolver3, resolver1
```

## Using context for uploading/downloading file and redirecting

```js
import fileUpload from "express-fileupload";

// app is an express app object
const resolvers = {
  downloadReport: (parent, args, { res }) => {
    res.download(filePath, fileName);
  },
  // the query might be "uploadPhoto($photo)"
  // client user must submit the photo with name=photo
  uploadPhoto: (parent, { photo }) => {
    // the photo now is file object
    console.log(photo);
  },
  redirect: (parent, { url }, { res }) => res.redirect(url),
};
const { resolve } = rexq(resolvers, {
  // context can be object or factory
  // in this case, we retrive $res and $req from variables and assign these objects to context object
  context: ({ $res, $req }) => ({
    res: $res,
    req: $req,
    otherContextProp: null,
  }),
});
app.use(fileUpload());
app.use("/", async (req, res) => {
  const result = await resolve(
    req.query.query || req.body.query,
    // passing request and response objects to context factory
    {
      // using query, body, files as query variables
      ...req.query,
      ...req.body,
      ...req.files,
      $res: res,
      $req: req,
    }
  );
  setTimeout(() => {
    // do nothing if response already sent headers to client
    // this means there is a resolver triggered file download/redirect
    if (res.headersSent) return;
    res.json(result);
  });
});
```

## Modularize

```js
// modules/user/index.js
module.exports = {
  me: [
    // specific result type is User
    "User",
    () => ({ name: "my user name" }),
  ],
  // user type resolver
  User: {
    photo: () => {},
  },
  userList: () => {},
};

// modules/post/index.js
module.exports = {
  searchPost: () => {},
  // user type resolver
  User: {
    // return posts of current user
    posts: (user) => [1, 2, 3],
  },
};

// index.js
import user from "./modules/user";
import post from "./modules/user";

// create rexq with user module only
rexq([user]);
resolve("me(name,posts)"); // { data: { name: "my user name", post: null } }

// create rexq with user and post modules
rexq([user, post]);
resolve("me(name,posts)"); // { data: { name: "my user name", post: [1, 2, 3] } }

// if the post module specified its required modules
module.exports = {
  // require accepts module or array of module
  require: user,
  // resolvers...
};
// we use post module only, user module will import later automatically
rexq([post]);
```

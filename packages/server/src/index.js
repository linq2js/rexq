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
    // query variables
    req.query
  )
    // resolve function returns a promise
    // wait until the promise resolved and send the result to client in JSON format
    .then((result) => res.json(result))
);

app.listen(3000);

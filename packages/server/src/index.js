import express from "express";
import rexq from "rexq";
import DataLoader from "dataloader";
import { module1 } from "shared";

console.log(module1);

// create express app
const app = express();

const resolvers = {
  userList: (root, { top }, context) =>
    new Array(parseInt(top, 10)).fill().map((_, index) =>
      // call data loader
      context.users.load(index)
    ),
};

const { resolve } = rexq(resolvers, {
  context: {
    users: new DataLoader(async (ids) => {
      console.log("loading " + ids.join(","));
      return ids.map((id) => ({ id, name: "Name of " + id }));
    }),
  },
});

app.get("/", async (req, res) => {
  const result = await resolve(req.query.query, req.query);
  res.json(result);
});

app.listen(3000);

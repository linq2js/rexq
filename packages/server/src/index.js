import dotenv from "dotenv";
import express from "express";
import samplePackageData from "my-sample-package";

dotenv.config();

console.log(
  "DATABASE_CONNECTION_STRING",
  process.env.DATABASE_CONNECTION_STRING
);

console.log("my-sample-package", samplePackageData);

const app = express();
const port = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("Hello World!!!"));

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});

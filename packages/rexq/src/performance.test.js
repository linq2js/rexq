import gql from "graphql-tag";
import { parseQuery } from "./index";

const testCount = 10000;

test("rexq: simple-query", () => {
  const cache = new Map();
  const start = new Date().getTime();
  for (let i = 0; i < testCount; i++) {
    parseQuery(
      `
        hero (
            name
            friends (
                name
            )
        )
    `,
      cache
    );
  }
  console.log("rexq: simple-query", new Date().getTime() - start);
});

test("graphql-tag: simple-query", () => {
  const start = new Date().getTime();
  for (let i = 0; i < testCount; i++) {
    gql`
      query HeroNameAndFriends {
        hero {
          name
          friends {
            name
          }
        }
      }
    `;
  }
  console.log("graphql-tag: simple-query", new Date().getTime() - start);
});

import fs from "fs";
import path from "path";

const files = fs.readdirSync(path.resolve(__dirname, "src"));

export default files.map((file) => {
  const fileName = path.basename(file);
  return {
    input: `./src/${fileName}`,
    output: {
      file: `./dist/rollup/${fileName}`,
      format: "cjs",
    },
  };
});

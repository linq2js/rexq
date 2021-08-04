const copy = require("recursive-copy");
const fs = require("fs");
const path = require("path");

module.exports = {
  presets: [
    [
      "@babel/preset-env",
      {
        targets: {
          node: "current",
        },
      },
    ],
  ],
  plugins: [
    [
      "module-resolver",
      {
        cwd: "babelrc",
        alias: {
          "^shared/(.+)": "./packages/shared/dist/rollup/\\1.js",
        },
      },
    ],
  ],
  env: {
    production: {
      presets: [["minify", { mangle: false }]],
      plugins: [
        [
          "module-resolver",
          {
            cwd: "packagejson",
            resolvePath(sourcePath, currentFile, opts) {
              const [, sharedPart] = /^shared\/(.+)/.exec(sourcePath) || [];
              if (sharedPart) {
                const parts = currentFile.split("/");
                while (parts.length) {
                  const last = parts.pop();
                  if (last === "src") break;
                }
                const packageDir = parts.join("/");
                // up to packages
                parts.pop();
                const sourceSharedFile =
                  parts.join("/") + `/shared/dist/rollup/${sharedPart}.js`;
                const targetSharedFile = `${packageDir}/dist/shared/${sharedPart}.js`;
                const importSharedFile = `${packageDir}/src/shared/${sharedPart}.js`;
                if (
                  !fs.existsSync(targetSharedFile) &&
                  fs.existsSync(sourceSharedFile)
                ) {
                  copy(sourceSharedFile, targetSharedFile, { overwrite: true });
                }

                return getRelativePath(currentFile, importSharedFile);
              }
              return null;
            },
          },
        ],
      ],
    },
    test: {
      presets: ["@babel/preset-env", "jest"],
      plugins: [
        "@babel/plugin-transform-modules-commonjs",
        [
          "@babel/plugin-transform-runtime",
          {
            helpers: true,
            regenerator: true,
          },
        ],
      ],
    },
  },
};

function getPackageRelativePath(file, sourceDirName = "src") {
  const parts = file.split(path.sep);
  const relativeFromSource = [];
  while (parts.length) {
    const part = parts.pop();
    if (part === sourceDirName) {
      break;
    }
    relativeFromSource.unshift(part);
  }

  return {
    packageDir: parts,
    sourceDir: parts.concat(sourceDirName),
    relativePath: relativeFromSource,
  };
}

function getRelativePath(fromPath, toPath) {
  const from = getPackageRelativePath(fromPath).relativePath.slice(0);
  const to = getPackageRelativePath(toPath).relativePath.slice(0);
  const result = ["."];

  while (from.length > 1 && to.length > 1) {
    from.shift();
    to.shift();
    result.push("..");
  }

  while (from.length > 1) {
    from.pop();
    result.push("..");
  }
  return result.concat(to).join(path.sep);
}

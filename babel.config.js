const fs = require("fs");
const path = require("path");

module.exports = {
  ignore:
    process.env.BABEL_ENV === "production"
      ? [
          "**/__tests__", // ignore the whole test directory
          "**/*.test.js", // ignore test files only
        ]
      : [],
  sourceMaps: process.env.BABEL_NO_SOURCE_MAPS ? false : "inline",
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
          "^shared": "./packages/shared/dist/index.js",
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
            resolvePath(sourcePath, currentFile) {
              if (sourcePath === "shared") {
                const parts = currentFile.split("/");
                while (parts.length) {
                  const last = parts.pop();
                  if (last === "src") break;
                }
                const currentPackageDir = parts.join("/");
                // up to packages
                parts.pop();

                const allPackagesDir = parts.join("/");
                const sourceSharedDir = `${allPackagesDir}/shared/dist`;
                const targetSharedDir = `${currentPackageDir}/dist/shared`;
                const importSharedFile = `${currentPackageDir}/src/shared/index.js`;

                if (
                  !fs.existsSync(targetSharedDir) &&
                  fs.existsSync(sourceSharedDir)
                ) {
                  fs.symlinkSync(sourceSharedDir, targetSharedDir);
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

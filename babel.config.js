module.exports = {
  presets: ["@babel/preset-env"],
  env: {
    production: {
      presets: ["minify"],
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

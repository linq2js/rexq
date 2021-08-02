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
  env: {
    production: {
      presets: [["minify", { mangle: false }]],
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

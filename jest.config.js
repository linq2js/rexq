const ignorePatterns = ["node_modules/", "dist/"];

module.exports = {
  collectCoverage: true,
  collectCoverageFrom: ["packages/**/*.{js}"],
  watchPathIgnorePatterns: ignorePatterns,
  testPathIgnorePatterns: ignorePatterns,
  coveragePathIgnorePatterns: ignorePatterns,
  roots: ["packages/"],
  transform: {
    "^.+\\.jsx?$": "babel-jest",
  },
};

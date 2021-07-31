import myPackageData from "./index";

test("data should not be undefined", () => {
  expect(myPackageData).not.toBeUndefined();
});

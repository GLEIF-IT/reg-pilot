import { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testMatch: ["<rootDir>/test/*.test.ts"],
  projects: ["<rootDir>/test"],
  watch: false,
};

export default config;

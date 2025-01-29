import { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/*.test.ts"],
  projects: ["<rootDir>/test"],
  moduleNameMapper: {
    "^@src/(.*)$": "<rootDir>/src/$1"
  },
  globals: {
    "ts-jest": {
      tsconfig: "tsconfig.json"
    }
  }
};

export default config;
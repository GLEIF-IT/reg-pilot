import { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  watch: false,
};

export default config;

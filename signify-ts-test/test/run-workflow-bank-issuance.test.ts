import path from "path";
import { resolveEnvironment, TestEnvironment } from "./utils/resolve-env";
import { getConfig } from "./utils/test-data";
import { loadWorkflow, runWorkflow } from "./utils/run-workflow";

const fs = require("fs");
const yaml = require("js-yaml");

let env: TestEnvironment;

afterAll((done) => {
  done();
});
beforeAll((done) => {
  process.env.BANK_NAME = "Bank_581";
  done();
  env = resolveEnvironment();
});

test("vlei-issuance-reports-bank-test-workflow", async function run() {
  // You need to set the BANK_NAME environment variable. Ex.: export BANK_NAME=Bank_2.
  const bankName = process.env.BANK_NAME;
  console.log(
    `Running vlei issuance and reports generation test for bank: ${bankName}`
  );
  const bankDirPath = `../data/600-banks-test-data/${bankName}/`;
  const workflowName = "workflow.yaml";
  const workflow = loadWorkflow(
    path.join(__dirname, `${bankDirPath}`) + workflowName,
  );
  const configFilePath = `${bankName}/config.json`;
  const configJson = await getConfig(configFilePath, true);
  if (workflow && configJson) {
    await runWorkflow(workflow, configJson, env);
  }
}, 3600000);

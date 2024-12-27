import path from "path";
import { resolveEnvironment, TestEnvironment } from "./utils/resolve-env";

import { getConfig } from "./utils/test-data";

import { runWorkflow } from "./utils/run-workflow";

const fs = require("fs");
const yaml = require("js-yaml");

let env: TestEnvironment;

afterAll((done) => {
  done();
});
beforeAll((done) => {
  done();
  env = resolveEnvironment();
});

// Function to load and parse YAML file
function loadWorkflow(filePath: string) {
  try {
    const file = fs.readFileSync(filePath, "utf8");
    return yaml.load(file);
  } catch (e) {
    console.error("Error reading YAML file:", e);
    return null;
  }
}

test("api-verifier-bank-test-workflow", async function run() {
  // You need to set the BANK_NAME environment variable. Ex.: export BANK_NAME=Bank_2.
  const bankName = process.env.BANK_NAME;
  const workflowPath = "../src/workflows/bank-api-verifier-test-workflow.yaml";
  const workflow = loadWorkflow(path.join(__dirname, `${workflowPath}`));
  const configFilePath = `${bankName}/config.json`;
  const configJson = await getConfig(configFilePath, true);
  if (workflow && configJson) {
    await runWorkflow(workflow, configJson);
  }
}, 3600000);

test("eba-verifier-bank-test-workflow", async function run() {
  // You need to set the BANK_NAME environment variable. Ex.: export BANK_NAME=Bank_2.
  // const bank = 581
  // const offset = 10*(bank-1);
  // process.env.TEST_ENVIRONMENT = "eba_bank_test";
  // process.env.KERIA = "http://localhost:"+(offset+20001);
  // process.env.KERIA_BOOT = "http://localhost:"+(offset+20003);
  // process.env.BANK_NAME = "Bank_"+bank;
  const bankName = process.env.BANK_NAME;
  const workflowPath = "../src/workflows/eba-verifier-test-workflow.yaml";
  const workflow = loadWorkflow(path.join(__dirname, `${workflowPath}`));
  const configFilePath = `${bankName}/config.json`;
  const configJson = await getConfig(configFilePath, true);
  if (workflow && configJson) {
    await runWorkflow(workflow, configJson);
  }
}, 3600000);

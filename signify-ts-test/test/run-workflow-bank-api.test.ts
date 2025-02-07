import path from "path";
import { resolveEnvironment, TestEnvironment } from "./utils/resolve-env";
import { strict as assert } from "assert";

import {
  WorkflowRunner,
  getConfig,
  loadWorkflow,
} from "vlei-verifier-workflows";
import {
  ApiTestStepRunner,
  GenerateReportStepRunner,
  VleiVerificationTestStepRunner,
} from "./utils/workflow-step-runners";

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

test("api-verifier-bank-test-workflow", async function run() {
  // You need to set the BANK_NAME environment variable. Ex.: export BANK_NAME=Bank_2.
  const bankName = process.env.BANK_NAME;
  const workflowPath = "../src/workflows/bank-api-verifier-test-workflow.yaml";
  const workflow = loadWorkflow(path.join(__dirname, `${workflowPath}`));
  const configFileName = `${bankName}/config.json`;
  let dirPath = "./data/600-banks-test-data/";
  const configFilePath = path.join(__dirname, dirPath) + configFileName;
  const configJson = await getConfig(configFilePath);

  if (workflow && configJson) {
    const wr = new WorkflowRunner(workflow, configJson);
    await wr.prepareClients();
    wr.registerRunner("generate_report", new GenerateReportStepRunner());
    wr.registerRunner("api_test", new ApiTestStepRunner());
    wr.registerRunner(
      "vlei_verification_test",
      new VleiVerificationTestStepRunner(),
    );
    const workflowRunResult = await wr.runWorkflow();
    assert.equal(workflowRunResult, true);
  }
}, 3600000);

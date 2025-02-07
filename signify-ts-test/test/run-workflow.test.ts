import path from "path";
import { resolveEnvironment, TestEnvironment } from "./utils/resolve-env";
import {
  WorkflowRunner,
  getConfig,
  loadWorkflow,
} from "vlei-verifier-workflows";
import { strict as assert } from "assert";
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

test.only("workflow", async function run() {
  const workflowsDir = "../src/workflows/";
  const workflowFile = env.workflow;
  const workflow = loadWorkflow(
    path.join(__dirname, `${workflowsDir}${workflowFile}`),
  );
  const configFileName = env.configuration;
  let dirPath = "../src/config/";
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

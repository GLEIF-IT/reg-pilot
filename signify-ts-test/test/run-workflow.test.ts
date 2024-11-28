import { VleiIssuance } from "../src/vlei-issuance";
import path from "path";
import { getOrCreateClients } from "./utils/test-util";
import { resolveEnvironment, TestEnvironment } from "./utils/resolve-env";
import { buildAidData } from "../src/utils/handle-json-config";
import { generate_reports } from "./report.test";
import {
  ApiUser,
  getApiTestData,
  getConfig,
  getReportGenTestData,
} from "./utils/test-data";
import { run_api_revocation_test, run_api_test } from "./reg-pilot-api.test";
import { run_vlei_verification_test } from "./vlei-verification.test";
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

test.only("workflow", async function run() {
  const workflowsDir = "../src/workflows/";
  const workflowFile = env.workflow;
  const workflow = loadWorkflow(
    path.join(__dirname, `${workflowsDir}${workflowFile}`),
  );
  const configFilePath = env.configuration;
  const configJson = await getConfig(configFilePath, false);
  if (workflow && configJson) {
    await runWorkflow(workflow, configJson);
  }
}, 3600000);

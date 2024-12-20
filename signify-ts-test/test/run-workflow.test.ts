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

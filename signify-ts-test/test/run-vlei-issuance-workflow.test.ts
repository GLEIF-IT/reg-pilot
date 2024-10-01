import {
  VleiIssuance,
  SingleSigVleiIssuance,
  MultiSigVleiIssuance,
} from "../src/vlei-issuance";
import path from "path";
import { EcrTestData, buildTestData } from "../src/utils/generate-test-data";
import { boolean } from "mathjs";

const fs = require("fs");
const yaml = require("js-yaml");

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

async function runWorkflow(workflow: any) {
  let executedSteps = new Set();
  const config = workflow.workflow.config;
  let vi = new SingleSigVleiIssuance(config.secrets);
  await vi.prepareClients();
  for (const user of vi.users) {
    await vi.createRegistries(user);
    for (const [k, v] of Object.entries(workflow.workflow.steps)) {
      await executeStep(user, k, v);
    }
  }

  async function executeStep(user: any, stepName: string, step: any) {
    console.log(`Executing: ${step.name}`);
    if (step.type == "issue_credential") {
      await vi.getOrIssueCredential(
        user,
        step.credential,
        Boolean(step.generate_test_data),
        step.test_name,
      );
    }
    executedSteps.add(step.id);
  }
}

test("issue-credentials", async function run() {
  const workflowsDir = "../src/workflows/";
  const workflowFile =
    process.env.WORKFLOW || "issue-credentials-singlesig-multi-user.yaml";
  const workflow = loadWorkflow(
    path.join(__dirname, `${workflowsDir}${workflowFile}`),
  );
  if (workflow) {
    await runWorkflow(workflow);
  }
}, 3600000);

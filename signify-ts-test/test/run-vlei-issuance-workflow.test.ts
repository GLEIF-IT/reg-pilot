import {
  VleiIssuance
} from "../src/vlei-issuance";
import path from "path";

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

async function runWorkflowSingle(workflow: any) {
  let executedSteps = new Set();
  const config = workflow.workflow.config;
  let vi = new VleiIssuance(config.secrets);
  await vi.prepareClients();
  await vi.createRegistries();
  for (const [k, v] of Object.entries(workflow.workflow.steps)) {
    await executeStep(k, v);
  }
  

  async function executeStep(stepName: string, step: any) {
    console.log(`Executing: ${step.description}`);
    if (step.type == "issue_credential") {
      await vi.getOrIssueCredential(
        stepName,
        step.credential,
        step.attributes,
        step.issuer_aid,
        step.issuee_aid,
        step.credential_source,
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
    process.env.WORKFLOW || "multisig-single-user.yaml";
  const workflow = loadWorkflow(
    path.join(__dirname, `${workflowsDir}${workflowFile}`),
  );
  if (workflow) {
    await runWorkflowSingle(workflow);
  }
}, 3600000);

import { VleiIssuance } from "../src/vlei-issuance";
import path from "path";
import { getOrCreateClients } from "./utils/test-util";
import { resolveEnvironment, TestEnvironment } from "./utils/resolve-env";
import { buildAidData } from "../src/utils/handle-json-config";
import { generate_reports } from "./report.test";
import {
  ApiUser,
  getApiTestData,
  getReportGenTestData,
} from "./utils/test-data";
import { run_api_test } from "./reg-pilot-api.test";
import { run_vlei_verification_test } from "./vlei-verification.test";

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

async function runWorkflow(workflow: any) {
  let executedSteps = new Set();
  const configFileName = env.configuration;
  const configPath = "../src/config/";
  let creds: Map<string, ApiUser> = new Map<string, ApiUser>();
  const configJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, configPath) + configFileName, "utf-8"),
  );
  let vi: VleiIssuance;

  for (const [k, v] of Object.entries(workflow.workflow.steps)) {
    await executeStep(k, v);
  }

  async function executeStep(stepName: string, step: any) {
    if (step.type == "issue_credential") {
      if (!vi) {
        vi = new VleiIssuance(configFileName);
        await vi.prepareClients();
        await vi.createRegistries();
      }
      console.log(`Executing: ${step.description}`);
      const cred = await vi.getOrIssueCredential(
        stepName,
        step.credential,
        step.attributes,
        step.issuer_aid,
        step.issuee_aid,
        step.credential_source,
        Boolean(step.generate_test_data),
        step.test_name,
      );
      if (cred[1]) creds.set(stepName, cred[0]);
    } else if (step.type == "revoke_credential") {
      console.log(`Executing: ${step.description}`);
      const cred = await vi.revokeCredential(
        step.credential,
        step.issuer_aid,
        step.issuee_aid,
        Boolean(step.generate_test_data),
        step.test_name,
      );
      if (cred[1]) creds.set(stepName, cred[0]);
    } else if (step.type == "generate_report") {
      console.log(`Executing: ${step.description}`);
      const testData = getReportGenTestData();
      const aidData = await buildAidData(configJson);
      const clients = await getOrCreateClients(
        1,
        [aidData[step.aid].agent.secret],
        true,
      );
      const roleClient = clients[0];
      const ecrAid = await roleClient.identifiers().get(step.aid);
      const keeper = roleClient.manager!.get(ecrAid);
      const failDirPrefixed = path.join(
        __dirname,
        "data",
        testData["failDir"],
        ecrAid.prefix,
      );
      const signedDirPrefixed = path.join(
        __dirname,
        "data",
        testData["signedDir"],
        ecrAid.prefix,
      );
      await generate_reports(
        ecrAid,
        keeper,
        signedDirPrefixed,
        failDirPrefixed,
        testData["unsignedReports"],
        testData["reportTypes"],
        step.copy_folder,
      );
    } else if (step.type == "api_test") {
      console.log(`Executing: ${step.description}`);
      const apiUsers = await getApiTestData(configJson, env, step.aids);
      await run_api_test(apiUsers, step.test_case, creds);
    } else if (step.type == "vlei_verification_test") {
      console.log(`Executing: ${step.description}`);
      const apiUsers = await getApiTestData(configJson, env, step.aids);
      await run_vlei_verification_test(apiUsers);
    }
    executedSteps.add(step.id);
  }
}

test("workflow", async function run() {
  const workflowsDir = "../src/workflows/";
  const workflowFile = env.workflow;
  const workflow = loadWorkflow(
    path.join(__dirname, `${workflowsDir}${workflowFile}`),
  );
  if (workflow) {
    await runWorkflow(workflow);
  }
}, 3600000);

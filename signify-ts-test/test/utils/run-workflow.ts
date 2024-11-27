import { VleiIssuance } from "../../src/vlei-issuance";
import path from "path";
import { getOrCreateClients } from "./test-util";
import { resolveEnvironment, TestEnvironment } from "./resolve-env";
import { buildAidData } from "../../src/utils/handle-json-config";
import { generate_reports } from "../report.test";
import {
  ApiUser,
  getApiTestData,
  getConfig,
  getReportGenTestData,
} from "./test-data";
import { run_api_revocation_test, run_api_test } from "../reg-pilot-api.test";
import { run_vlei_verification_test } from "../vlei-verification.test";

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

export async function runWorkflow(workflow: any, configJson: any) {
  let executedSteps = new Set();
  let creds: Map<string, ApiUser> = new Map<string, ApiUser>();
  let vi: VleiIssuance;

  for (const [k, v] of Object.entries(workflow.workflow.steps)) {
    await executeStep(k, v);
  }

  async function executeStep(stepName: string, step: any) {
    let env = resolveEnvironment();
    if (step.type == "issue_credential") {
      if (!vi) {
        vi = new VleiIssuance(configJson);
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
        "../data",
        testData["failDir"],
        ecrAid.prefix,
      );
      const signedDirPrefixed = path.join(
        __dirname,
        "../data",
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
      if (step.test_case == "revoked_cred_upload_test") {
        const apiUsers = await getApiTestData(configJson, env, step.aids);
        const aidData = await buildAidData(configJson);
        const clients = await getOrCreateClients(
          1,
          [aidData[step.requestor_aid].agent.secret],
          true,
        );
        const roleClient = clients[clients.length - 1];
        const requestorAid = await roleClient
          .identifiers()
          .get(step.requestor_aid);
        const requestorAidPrefix = requestorAid.prefix;
        await run_api_revocation_test(
          roleClient,
          step.requestor_aid,
          requestorAidPrefix,
          creds,
          configJson,
        );
      } else {
        const apiUsers = await getApiTestData(configJson, env, step.aids);
        await run_api_test(apiUsers, configJson);
      }
    } else if (step.type == "vlei_verification_test") {
      console.log(`Executing: ${step.description}`);
      const apiUsers = await getApiTestData(configJson, env, step.aids);
      await run_vlei_verification_test(apiUsers, configJson);
    }
    executedSteps.add(step.id);
  }
}

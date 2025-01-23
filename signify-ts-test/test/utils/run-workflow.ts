import { VleiIssuance } from "../../src/vlei-issuance";
import path from "path";
import { getOrCreateClients } from "./test-util";
import { TestEnvironment, TestPaths } from "../../src/utils/resolve-env";
import { buildAidData } from "../../src/utils/handle-json-config";
import { generate_reports, getEbaSignedReport } from "../../src/utils/report";
import {
  ApiUser,
  getApiTestData,
  getConfig,
  getReportGenTestData,
} from "./test-data";
import {
  run_api_revocation_test,
  run_api_test,
  single_user_eba_test,
} from "../reg-pilot-api";
import { run_vlei_verification_test } from "../vlei-verification";

import fs from "fs";
import yaml from "js-yaml";

// Function to load and parse YAML file
export function loadWorkflow(filePath: string) {
  // try {
  const file = fs.readFileSync(filePath, "utf8");
  return yaml.load(file);
  // } catch (e) {
  //   console.error("Error reading YAML file:", e);
  //   return null;
  // }
}

export async function runWorkflow(
  workflow: any,
  configJson: any,
  env: TestEnvironment,
  paths: TestPaths
) {
  let executedSteps = new Set();
  let creds: Map<string, ApiUser> = new Map<string, ApiUser>();
  let vi: VleiIssuance;

  for (const [k, v] of Object.entries(workflow.workflow.steps)) {
    await executeStep(k, v, env);
  }

  async function executeStep(
    stepName: string,
    step: any,
    env: TestEnvironment
  ) {
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
        step.test_name
      );
      if (cred[1]) creds.set(stepName, cred[0]);
    } else if (step.type == "revoke_credential") {
      console.log(`Executing: ${step.description}`);
      const cred = await vi.revokeCredential(
        step.credential,
        step.issuer_aid,
        step.issuee_aid,
        Boolean(step.generate_test_data),
        step.test_name
      );
      if (cred[1]) creds.set(stepName, cred[0]);
    } else if (step.type == "generate_report") {
      console.log(`Executing: ${step.description}`);
      const testData = getReportGenTestData();
      const aidData = await buildAidData(configJson);
      const clients = await getOrCreateClients(
        1,
        [aidData[step.aid].agent.secret],
        true
      );
      const roleClient = clients[0];
      const ecrAid = await roleClient.identifiers().get(step.aid);
      const keeper = roleClient.manager!.get(ecrAid);
      await generate_reports(
        ecrAid.prefix,
        keeper,
        testData["unsignedReports"],
        testData["reportTypes"],
        step.copy_folder
      );
    } else if (step.type == "api_test") {
      console.log(`Executing: ${step.description}`);
      if (step.test_case == "revoked_cred_upload_test") {
        const apiUsers = await getApiTestData(configJson, env, step.aids);
        const aidData = await buildAidData(configJson);
        const clients = await getOrCreateClients(
          1,
          [aidData[step.requestor_aid].agent.secret],
          true
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
          configJson
        );
      } else {
        const apiUsers = await getApiTestData(configJson, env, step.aids);
        await run_api_test(apiUsers, configJson);
      }
    } else if (step.type == "eba_api_test") {
      console.log(`Executing: ${step.description}`);
      if (step.test_case == "revoked_cred_upload_test") {
        const apiUsers = await getApiTestData(configJson, env, step.aids);
        const aidData = await buildAidData(configJson);
        const clients = await getOrCreateClients(
          1,
          [aidData[step.requestor_aid].agent.secret],
          true
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
          configJson
        );
      } else {
        const apiUsers = await getApiTestData(configJson, env, step.aids);
        const apiUser = apiUsers[0];
        const keeper = apiUser.roleClient.manager!.get(apiUser.ecrAid);
        // upload signed report
        const signedReport = await getEbaSignedReport(
          paths.testBankReportZip,
          paths.testSignedReports,
          apiUser.ecrAid.prefix,
          keeper
        );
        await single_user_eba_test(apiUser, env, signedReport);
      }
    } else if (step.type == "vlei_verification_test") {
      console.log(`Executing: ${step.description}`);
      const apiUsers = await getApiTestData(configJson, env, step.aids);
      await run_vlei_verification_test(apiUsers, configJson);
    }
    executedSteps.add(step.id);
  }
}

export async function launchWorkflow() {
  const env = TestEnvironment.getInstance();
  const paths = TestPaths.getInstance();
  const workflowFile = env.workflow;
  const testPaths = TestPaths.getInstance();
  const workflow = loadWorkflow(
    path.join(process.cwd(), testPaths.workflowsDir, workflowFile)
  );
  const configFilePath = env.configuration;

  const configJson = await getConfig(configFilePath);
  if (workflow && configJson) {
    await runWorkflow(workflow, configJson, env, paths);
  }
}

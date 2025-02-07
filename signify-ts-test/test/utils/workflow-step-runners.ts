import { generate_reports } from "../report.test";
import {
  StepRunner,
  getOrCreateClients,
  buildAidData,
  VleiIssuance,
} from "vlei-verifier-workflows";

import { getReportGenTestData, getApiTestData } from "./test-data";

import {
  run_api_admin_test,
  run_api_revocation_test,
  run_api_test,
  run_api_test_no_delegation,
} from "../reg-pilot-api.test";
import { run_vlei_verification_test } from "../vlei-verification.test";
import { resolveEnvironment } from "./resolve-env";

import path from "path";

export class GenerateReportStepRunner extends StepRunner {
  type: string = "generate_report";
  public async run(
    vi: VleiIssuance,
    stepName: string,
    step: any,
    configJson: any,
  ): Promise<any> {
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
    const result = await generate_reports(
      ecrAid,
      keeper,
      signedDirPrefixed,
      failDirPrefixed,
      testData["unsignedReports"],
      testData["reportTypes"],
      step.copy_folder,
    );
    return result;
  }
}

export class ApiTestStepRunner extends StepRunner {
  type: string = "api_test";
  public async run(
    vi: VleiIssuance,
    stepName: string,
    step: any,
    configJson: any,
  ): Promise<any> {
    let env = resolveEnvironment();
    const apiUsers = await getApiTestData(configJson, env, step.aids);
    let result;
    if (step.test_case == "api_test_revocation") {
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
      result = await run_api_revocation_test(
        roleClient,
        step.requestor_aid,
        requestorAidPrefix,
        new Map(), // TODO: instead of new Map() must be map of creds.
        configJson,
      );
    } else if (step.test_case == "api_test_admin") {
      const adminUser = await getApiTestData(configJson, env, [step.admin_aid]);
      result = await run_api_admin_test(apiUsers, configJson, adminUser[0]);
    } else if (step.test_case == "api_test_no_delegation") {
      result = await run_api_test_no_delegation(apiUsers, configJson);
    } else if (step.test_case == "api_test") {
      result = await run_api_test(apiUsers, configJson);
    } else {
      console.log(`invalid workflow API test case: ${step.test_case}`);
    }
    return result;
  }
}

export class VleiVerificationTestStepRunner extends StepRunner {
  type: string = "revoke_credential";
  public async run(
    vi: VleiIssuance,
    stepName: string,
    step: any,
    configJson: any = null,
  ): Promise<any> {
    let env = resolveEnvironment();
    const apiUsers = await getApiTestData(configJson, env, step.aids);
    const result = await run_vlei_verification_test(apiUsers, configJson);
    return result;
  }
}

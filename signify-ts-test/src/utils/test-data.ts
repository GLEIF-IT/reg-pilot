import path from "path";
import fs from "fs";
import { buildAidData } from "vlei-verifier-workflows";
import { TestEnvironment, TestPaths } from "./resolve-env";
import { getOrCreateClients } from "./test-util";
import { ECR_SCHEMA_SAID } from "../constants";
import { SignifyClient } from "signify-ts";

export const EXTERNAL_MAN_TYPE = "external_manifest";
export const SIMPLE_TYPE = "simple";
export const UNFOLDERED_TYPE = "unfoldered";
export const UNZIPPED_TYPE = "unzipped";
export const FAIL_TYPE = "fail";

export function getConfig(configFilePath: string) {
  const configFile = fs.readFileSync(configFilePath, "utf-8");
  const configJson = JSON.parse(configFile);
  return configJson;
}

export async function getApiTestData(
  configJson: any,
  env: TestEnvironment,
  aids: string[],
) {
  let apiUsers: Array<ApiUser> = [];
  const aidData = await buildAidData(configJson);
  for (const aid of aids) {
    let secret;
    if (aidData[aid].identifiers) {
      secret = aidData[aidData[aid].identifiers[0]].agent.secret;
    } else {
      secret = aidData[aid].agent.secret;
    }
    const clients = await getOrCreateClients(1, [secret], true);
    const roleClient = clients[clients.length - 1];
    let apiUser: ApiUser = {
      ecrAid: null,
      creds: [],
      roleClient: null,
      lei: "",
      uploadDig: "",
      idAlias: aid,
    };
    apiUser.roleClient = roleClient;
    const ecrAid = await roleClient.identifiers().get(aid);
    apiUser.ecrAid = ecrAid;

    let userCreds = await roleClient.credentials().list();
    userCreds = userCreds.filter((cred: any) => cred.sad.a.i === ecrAid.prefix);
    // const ecrCredHolder = await getGrantedCredential(roleClient, ecrCred.sad.d);
    for (const cred of userCreds) {
      apiUser.creds.push({
        cred: cred,
        credCesr: await roleClient.credentials().get(cred.sad.d, true),
      });
    }

    apiUsers.push(apiUser);
  }
  return apiUsers;
}

export function getReportGenTestData() {
  const speed = process.env.SPEED;
  console.log("Speed mode: ", speed);
  let fast: boolean = speed == "fast";
  let reportTypes: string[];
  let unsignedReports: string[];
  reportTypes = process.env.REPORT_TYPES
    ? process.env.REPORT_TYPES.split(",")
    : fast
      ? [SIMPLE_TYPE]
      : [
          EXTERNAL_MAN_TYPE,
          SIMPLE_TYPE,
          UNFOLDERED_TYPE,
          UNZIPPED_TYPE,
          FAIL_TYPE,
        ];
  console.log("Report types: ", reportTypes);
  unsignedReports = process.env.UNSIGNED_REPORTS
    ? process.env.UNSIGNED_REPORTS.split(",")
    : fast
      ? [getDefaultOrigReports()[0]]
      : getDefaultOrigReports();

  const testPaths = TestPaths.getInstance();
  console.log("Original unsigned reports: ", testPaths.testOrigReportsDir);
  return {
    failDir: testPaths.testFailReports,
    signedDir: testPaths.testSignedReports,
    reportTypes: reportTypes,
    unsignedReports: unsignedReports,
  };
}

export async function getGrantedCredential(
  client: SignifyClient,
  credId: string,
): Promise<any> {
  const credentialList = await client.credentials().list({
    filter: { "-d": credId },
  });
  let credential: any;
  if (credentialList.length > 0) {
    credential = credentialList[0];
  }
  return credential;
}

export function getDefaultOrigReports(): string[] {
  const testPaths = TestPaths.getInstance();
  console.log(
    `UNSIGNED_REPORTS not set, getting default unsigned reports from ${testPaths.testOrigReportsDir}`,
  );

  const reports = fs.readdirSync(testPaths.testOrigReportsDir);
  console.log("Available reports: ", reports);

  const unsignedReps = [] as string[];
  for (const reportFile of reports) {
    // const file = reports[0];
    const filePath = path.join(testPaths.testOrigReportsDir, reportFile);
    unsignedReps.push(filePath);
  }

  return unsignedReps;
}

export interface ApiUser {
  roleClient: any;
  ecrAid: any;
  creds: Array<any>;
  lei: string;
  uploadDig: string;
  idAlias: string;
}

export function isEbaDataSubmitter(cred: any, aid: string): boolean {
  return (
    cred.sad.s === ECR_SCHEMA_SAID &&
    cred.sad.a.i === aid &&
    cred.sad.a?.engagementContextRole === "EBA Data Submitter"
  );
}

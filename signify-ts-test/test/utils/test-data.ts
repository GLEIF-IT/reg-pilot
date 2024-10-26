import path from "path";
import fs from "fs";
import { buildAidData } from "../../src/utils/handle-json-config";
import { TestEnvironment } from "./resolve-env";
import { getOrCreateClients } from "./test-util";
import { ECR_SCHEMA_SAID } from "../../src/constants";
import { SignifyClient } from "signify-ts";

export const EXTERNAL_MAN_TYPE = "external_manifest";
export const SIMPLE_TYPE = "simple";
export const UNFOLDERED_TYPE = "unfoldered";
export const UNZIPPED_TYPE = "unzipped";
export const FAIL_TYPE = "fail";

const origDir = "orig_reports";
const failDir = "fail_reports";
const signedDir = "signed_reports";

export async function getApiTestData(
  configJson: any,
  env: TestEnvironment,
  aids: string[],
) {
  let apiUsers: Array<ApiUser> = [];
  const aidData = await buildAidData(configJson);
  for (const aid of aids) {
    const clients = await getOrCreateClients(
      1,
      [aidData[aid].agent.secret],
      true,
    );
    const roleClient = clients[clients.length - 1];
    let apiUser: ApiUser = {
      ecrAid: null,
      creds: [],
      credsCesr: [],
      roleClient: null,
      lei: "",
      uploadDig: "",
      idAlias: aid,
    };
    apiUser.roleClient = roleClient;
    const ecrAid = await roleClient.identifiers().get(aid);
    apiUser.ecrAid = ecrAid;

    apiUser.creds = await roleClient.credentials().list();
    // const ecrCredHolder = await getGrantedCredential(roleClient, ecrCred.sad.d);
    for (const cred of apiUser.creds) {
      apiUser.credsCesr.push(
        await roleClient.credentials().get(cred.sad.d, true),
      );
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

  console.log("Unsigned reports: ", unsignedReports);
  return {
    failDir: failDir,
    signedDir: signedDir,
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
  console.log(
    `UNSIGNED_REPORTS not set, getting default unsigned reports from ${origDir}`,
  );

  // Loop over the files in the ./data/orig_reports directory
  const origReportsDir = path.join(__dirname, "..", "data", origDir);

  const reports = fs.readdirSync(origReportsDir);
  console.log("Available reports: ", reports);

  const unsignedReps = [] as string[];
  for (const reportFile of reports) {
    // const file = reports[0];
    const filePath = path.join(origReportsDir, reportFile);
    unsignedReps.push(filePath);
  }

  return unsignedReps;
}

export interface ApiUser {
  roleClient: any;
  ecrAid: any;
  creds: Array<any>;
  credsCesr: Array<any>;
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

import { strict as assert } from "assert";

import fs from "fs";
import * as process from "process";

import { getOrCreateClients } from "./utils/test-util";
import { generateFileDigest } from "./utils/generate-digest";
import { resolveEnvironment, TestEnvironment } from "./utils/resolve-env";
import { HabState, SignifyClient } from "signify-ts";
import path from "path";
import { buildUserData, User } from "../src/utils/handle-json-config";
import { ApiAdapter } from "../src/api-adapter";

const ECR_SCHEMA_SAID = "EEy9PkikFcANV1l7EHukCeXqrzT1hNZjGlUk7wuMO5jw";
const secretsJsonPath = "../src/config/";

let roleClient: SignifyClient;
let users: Array<User> = [];
let apiUsers: Array<ApiUser> = [];

const failDir = "fail_reports";
let failDirPrefixed: string;
const signedDir = "signed_reports";

let env: TestEnvironment;
let apiAdapter: ApiAdapter;

afterEach(async () => {});

beforeAll(async () => {
  let ecrAid: HabState;
  let ecrCred: any;
  let ecrCredCesr: any;
  let ecrCredHolder: any;
  env = resolveEnvironment();
  const secretsJson = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, secretsJsonPath + env.secretsJsonConfig),
      "utf-8",
    ),
  );
  users = await buildUserData(secretsJson);
  apiAdapter = new ApiAdapter(env.apiBaseUrl);
  for (const user of users) {
    const clients = await getOrCreateClients(
      1,
      [user.secrets.get("ecr")!],
      true,
    );
    roleClient = clients[clients.length - 1];
    let apiUser: ApiUser = {
      ecrAid: null,
      ecrCred: null,
      ecrCredCesr: {},
      roleClient: null,
      lei: "",
      uploadDig: "",
    };
    apiUser.roleClient = roleClient;
    ecrAid = await roleClient.identifiers().get("ecr1");
    apiUser.ecrAid = ecrAid;
    let creds = await roleClient.credentials().list();
    let ecrCreds = creds.filter(
      (cred: any) =>
        cred.sad.s === ECR_SCHEMA_SAID &&
        cred.sad.a.engagementContextRole === "EBA Data Submitter" &&
        cred.sad.a.i === ecrAid.prefix,
    );
    // generally expecting one ECR credential but compare them and take the first
    try {
      if (ecrCreds.length > 1) {
        assert.equal(
          ecrCreds[0].sad.a,
          ecrCreds[1].sad.a,
          "Expected one ECR credential the comparison of ecr sad attirbutes",
        );
      }
    } catch (error) {
      console.log(
        `Excepting only one ECR, see comparison, but continuing: ${error}`,
      );
    }

    ecrCred = ecrCreds[0];
    apiUser.ecrCred = ecrCred;
    ecrCredHolder = await getGrantedCredential(roleClient, ecrCred.sad.d);
    assert(ecrCred !== undefined);
    assert.equal(ecrCredHolder.sad.d, ecrCred.sad.d);
    assert.equal(ecrCredHolder.sad.s, ECR_SCHEMA_SAID);
    assert.equal(ecrCredHolder.status.s, "0");
    assert(ecrCredHolder.atc !== undefined);
    ecrCredCesr = await roleClient.credentials().get(ecrCred.sad.d, true);
    apiUser.ecrCredCesr = ecrCredCesr;
    apiUser.lei = ecrCred.sad.a.LEI;
    apiUsers.push(apiUser);
  }
});

// This test assumes you have run a vlei test that sets up the
// role identifiers and Credentials.
// It also assumes you have generated the different report files
// from the report test
test("reg-pilot-api", async function run() {
  if (apiUsers.length > 1) await multi_user_test(apiUsers);
  else if (apiUsers.length == 1) await single_user_test(apiUsers[0]);
}, 200000);

async function single_user_test(user: ApiUser) {
  const signedDirPrefixed = path.join(
    __dirname,
    "data",
    signedDir,
    user.ecrAid.prefix,
  );
  const signedReports = getSignedReports(signedDirPrefixed);
  failDirPrefixed = path.join(__dirname, "data", failDir, user.ecrAid.prefix);
  let ppath = "/ping";
  let preq = { method: "GET", body: null };
  let presp = await fetch(env.apiBaseUrl + ppath, preq);
  console.log("ping response", presp);
  assert.equal(presp.status, 200);

  // fails to query report status because not logged in with ecr yet
  let sresp = await apiAdapter.getReportStatusByAid(
    "ecr1",
    user.ecrAid.prefix,
    user.roleClient,
  );

  // login with the ecr credential
  let heads = new Headers();
  heads.set("Content-Type", "application/json");
  let lbody = {
    vlei: user.ecrCredCesr,
    said: user.ecrCred.sad.d,
  };
  let lreq = {
    headers: heads,
    method: "POST",
    body: JSON.stringify(lbody),
  };

  let lpath = `/login`;
  let lresp = await fetch(env.apiBaseUrl + lpath, lreq);
  console.log("login response", lresp);
  assert.equal(lresp.status, 202);
  let ljson = await lresp.json();
  const credJson = JSON.parse(ljson["creds"]);
  assert.equal(credJson.length, 1);
  assert.equal(credJson[0].sad.a.i, `${user.ecrAid.prefix}`);

  heads = new Headers();
  heads.set("Content-Type", "application/json");
  let creq = { headers: heads, method: "GET", body: null };
  let cpath = `/checklogin/${user.ecrAid.prefix}`;
  let cresp = await fetch(env.apiBaseUrl + cpath, creq);
  assert.equal(cresp.status, 200);
  let cbody = await cresp.json();
  assert.equal(cbody["aid"], `${user.ecrAid.prefix}`);
  assert.equal(cbody["msg"], "AID presented valid credential");
  assert.equal(cbody["said"], user.ecrCred.sad.d);

  // try to get status without signed headers provided
  heads = new Headers();
  let sreq = { headers: heads, method: "GET", body: null };
  let spath = `/status/${user.ecrAid.prefix}`;
  sresp = await fetch(env.apiBaseUrl + spath, sreq);
  assert.equal(sresp.status, 422); // no signed headers provided

  const dresp = await apiAdapter.dropReportStatusByAid(
    "ecr1",
    user.ecrAid.prefix,
    user.roleClient,
  );
  if (dresp.status < 300) {
    // succeeds to query report status
    sresp = await apiAdapter.getReportStatusByAid(
      "ecr1",
      user.ecrAid.prefix,
      user.roleClient,
    );
    assert.equal(sresp.status, 202);
    const sbody = await sresp.json();
    assert.equal(sbody.length, 0);
  } else {
    assert.fail("Failed to drop report status");
  }

  // Get the current working directory
  const currentDirectory = process.cwd();
  // Print the current working directory
  console.log("Current Directory:", currentDirectory);

  // sanity check that the report verifies
  const keeper = roleClient.manager!.get(user.ecrAid);
  const signer = keeper.signers[0]; //TODO - how do we support mulitple signers? Should be a for loop to add signatures

  // sanity check with expected sig and contents that the verifier will verify
  // assert.equal(ecrAid.prefix,"EOrwKACnr9y8E84xWmzfD7hka5joeKBu19IOW_xyJ50h")
  // const sig = "AABDyfoSHNaRH4foKRXVDp9HAGqol_dnUxDr-En-svEV3FHNJ0R7tgIYMRz0lIIdIkqMwGFGj8qUge03uYFMpcQP"
  // const siger = new Siger({ qb64: sig });
  // const filingIndicatorsData = "templateID,reported\nI_01.01,true\nI_02.03,true\nI_02.04,true\nI_03.01,true\nI_05.00,true\nI_09.01,true\n" //This is like FilingIndicators.csv
  // const result = signer.verfer.verify(siger.raw, filingIndicatorsData);
  // assert.equal(result, true);
  //sig is new Uint8Array([67, 201, 250, 18, 28, 214, 145, 31, 135, 232, 41, 21, 213, 14, 159, 71, 0, 106, 168, 151, 247, 103, 83, 16, 235, 248, 73, 254, 178, 241, 21, 220, 81, 205, 39, 68, 123, 182, 2, 24, 49, 28, 244, 148, 130, 29, 34, 74, 140, 192, 97, 70, 143, 202, 148, 129, 237, 55, 185, 129, 76, 165, 196, 15])
  // const uint8Array = new Uint8Array([38, 142, 242, 237, 224, 242, 74, 112, 91, 193, 125, 159, 24, 21, 0, 136, 4, 230, 252, 234, 78, 179, 82, 14, 207, 198, 163, 92, 230, 172, 153, 50]);
  // Convert Uint8Array to a binary string
  // const binaryString = String.fromCharCode.apply(null, Array.from(uint8Array));
  // Convert binary string to Base64
  // const base64String = btoa(binaryString);
  // console.log(base64String); // Output: Jo7y7eDySnBbwX2fGBUAiATm/OpOs1IOz8ajXOakmTI=
  // assert.equal(signer.verfer.qb64, "DCaO8u3g8kpwW8F9nxgVAIgE5vzqTrNSDs_Go1zmrJky")

  //Try known aid signed report upload
  //   const ecrOobi = await roleClient.oobis().get("ecr1", "agent");
  //   console.log("Verifier must have already seen the login", ecrOobi);
  // Loop over the reports directory

  // Check signed reports
  for (const signedReport of signedReports) {
    if (fs.lstatSync(signedReport).isFile()) {
      await apiAdapter.dropReportStatusByAid(
        "ecr1",
        user.ecrAid.prefix,
        user.roleClient,
      );
      console.log(`Processing file: ${signedReport}`);
      const signedZipBuf = fs.readFileSync(`${signedReport}`);
      const signedZipDig = generateFileDigest(signedZipBuf);
      const signedUpResp = await apiAdapter.uploadReport(
        "ecr1",
        user.ecrAid.prefix,
        signedReport,
        signedZipBuf,
        signedZipDig,
        user.roleClient,
      );
      await checkSignedUpload(
        signedUpResp,
        path.basename(signedReport),
        signedZipDig,
        user,
      );
    }
  }

  if(fs.existsSync(failDirPrefixed)) {
    const failReports = fs.readdirSync(failDirPrefixed);

    // Check fail reports
    for (const failReport of failReports) {
      const filePath = path.join(failDirPrefixed, failReport);
      if (fs.lstatSync(filePath).isFile()) {
        await apiAdapter.dropReportStatusByAid(
          "ecr1",
          user.ecrAid.prefix,
          user.roleClient,
        );
        console.log(`Processing file: ${filePath}`);
        const failZipBuf = fs.readFileSync(`${filePath}`);
        const failZipDig = generateFileDigest(failZipBuf);
        const failUpResp = await apiAdapter.uploadReport(
          "ecr1",
          user.ecrAid.prefix,
          failReport,
          failZipBuf,
          failZipDig,
          user.roleClient,
        );
        await checkFailUpload(
          user.roleClient,
          failUpResp,
          failReport,
          failZipDig,
          user.ecrAid,
        );
      }
    }
  }

  // Check reports with bad digest
  for (const signedReport of signedReports) {
    if (fs.lstatSync(signedReport).isFile()) {
      await apiAdapter.dropReportStatusByAid(
        "ecr1",
        user.ecrAid.prefix,
        user.roleClient,
      );
      console.log(`Processing file: ${signedReport}`);
      const badDigestZipBuf = fs.readFileSync(`${signedReport}`);
      const badDigestZipDig = "sha256-f5eg8fhaFybddaNOUHNU87Bdndfawf";
      const badDigestUpResp = await apiAdapter.uploadReport(
        "ecr1",
        user.ecrAid.prefix,
        signedReport,
        badDigestZipBuf,
        badDigestZipDig,
        user.roleClient,
      );
      await checkBadDigestUpload(badDigestUpResp);
    }
  }

  // Check reports with not prefixed digest
  for (const signedReport of signedReports) {
    if (fs.lstatSync(signedReport).isFile()) {
      await apiAdapter.dropReportStatusByAid(
        "ecr1",
        user.ecrAid.prefix,
        user.roleClient,
      );
      console.log(`Processing file: ${signedReport}`);
      const badDigestZipBuf = fs.readFileSync(`${signedReport}`);
      const badDigestZipDig = generateFileDigest(badDigestZipBuf).substring(7);
      const badDigestUpResp = await apiAdapter.uploadReport(
        "ecr1",
        user.ecrAid.prefix,
        signedReport,
        badDigestZipBuf,
        badDigestZipDig,
        user.roleClient,
      );
      await checkNonPrefixedDigestUpload(badDigestUpResp);
    }
  }
}

async function multi_user_test(apiUsers: Array<ApiUser>) {
  let user1: ApiUser;
  let user2: ApiUser;
  let user3: ApiUser;
  assert.equal(apiUsers.length, 3);
  if (apiUsers[0].lei == apiUsers[1].lei) {
    user1 = apiUsers[0];
    user2 = apiUsers[1];
    user3 = apiUsers[2];
  } else if (apiUsers[0].lei == apiUsers[2].lei) {
    user1 = apiUsers[0];
    user2 = apiUsers[2];
    user3 = apiUsers[1];
  } else {
    user1 = apiUsers[1];
    user2 = apiUsers[2];
    user3 = apiUsers[0];
  }

  for (const user of apiUsers) {
    const signedDirPrefixed = path.join(
      __dirname,
      "data",
      signedDir,
      user.ecrAid.prefix,
    );
    // try to ping the api
    let ppath = "/ping";
    let preq = { method: "GET", body: null };
    let presp = await fetch(env.apiBaseUrl + ppath, preq);
    console.log("ping response", presp);
    assert.equal(presp.status, 200);

    // fails to query report status because not logged in with ecr yet
    let sresp = await apiAdapter.getReportStatusByAid(
      "ecr1",
      user.ecrAid.prefix,
      user.roleClient,
    );

    // login with the ecr credential
    let heads = new Headers();
    heads.set("Content-Type", "application/json");
    let lbody = {
      vlei: user.ecrCredCesr,
      said: user.ecrCred.sad.d,
    };
    let lreq = {
      headers: heads,
      method: "POST",
      body: JSON.stringify(lbody),
    };

    let lpath = `/login`;
    let lresp = await fetch(env.apiBaseUrl + lpath, lreq);
    console.log("login response", lresp);
    assert.equal(lresp.status, 202);

    heads = new Headers();
    heads.set("Content-Type", "application/json");
    let creq = { headers: heads, method: "GET", body: null };
    let cpath = `/checklogin/${user.ecrAid.prefix}`;
    let cresp = await fetch(env.apiBaseUrl + cpath, creq);
    assert.equal(cresp.status, 200);
    let cbody = await cresp.json();
    assert.equal(cbody["aid"], `${user.ecrAid.prefix}`);
    assert.equal(cbody["msg"], "AID presented valid credential");
    assert.equal(cbody["said"], user.ecrCred.sad.d);

    // try to get status without signed headers provided
    heads = new Headers();
    let sreq = { headers: heads, method: "GET", body: null };
    let spath = `/status/${user.ecrAid.prefix}`;
    sresp = await fetch(env.apiBaseUrl + spath, sreq);
    assert.equal(sresp.status, 422); // no signed headers provided

    apiAdapter.dropReportStatusByAid(
      "ecr1",
      user.ecrAid.prefix,
      user.roleClient,
    );
    // succeeds to query report status
    sresp = await apiAdapter.getReportStatusByAid(
      "ecr1",
      user.ecrAid.prefix,
      user.roleClient,
    );
    assert.equal(sresp.status, 202);
    const sbody = await sresp.json();
    assert.equal(sbody.length, 0);

    // Get the current working directory
    const currentDirectory = process.cwd();
    // Print the current working directory
    console.log("Current Directory:", currentDirectory);

    // sanity check that the report verifies
    const keeper = user.roleClient.manager!.get(user.ecrAid);
    const signer = keeper.signers[0]; //TODO - how do we support mulitple signers? Should be a for loop to add signatures

    const signedReports = getSignedReports(signedDirPrefixed);
    // Check signed reports
    for (const signedReport of signedReports) {
      if (fs.lstatSync(signedReport).isFile()) {
        apiAdapter.dropReportStatusByAid(
          "ecr1",
          user.ecrAid.prefix,
          user.roleClient,
        );
        console.log(`Processing file: ${signedReport}`);
        const signedZipBuf = fs.readFileSync(`${signedReport}`);
        const signedZipDig = generateFileDigest(signedZipBuf);
        const signedUpResp = await apiAdapter.uploadReport(
          "ecr1",
          user.ecrAid.prefix,
          signedReport,
          signedZipBuf,
          signedZipDig,
          user.roleClient,
        );
        await checkSignedUpload(signedUpResp, signedReport, signedZipDig, user);
        user.uploadDig = signedZipDig;
        break;
      }
    }
  }
  // check upload by aid
  let sresp = await apiAdapter.getReportStatusByAid(
    "ecr1",
    user1.ecrAid.prefix,
    user1.roleClient,
  );
  assert.equal(sresp.status, 202);
  let sbody = await sresp.json();

  // check upload by aid from different lei
  sresp = await apiAdapter.getReportStatusByAid(
    "ecr1",
    user3.ecrAid.prefix,
    user1.roleClient,
  );
  assert.equal(sresp.status, 401);

  // check upload by dig from different lei
  sresp = await apiAdapter.getReportStatusByDig(
    "ecr1",
    user3.ecrAid.prefix,
    user3.uploadDig,
    user1.roleClient,
  );
  assert.equal(sresp.status, 401);

  // check upload by dig from the same lei
  sresp = await apiAdapter.getReportStatusByDig(
    "ecr1",
    user1.ecrAid.prefix,
    user2.uploadDig,
    user1.roleClient,
  );
  assert.equal(sresp.status, 200);

  // check LEI upload statuses by aid
  sresp = await apiAdapter.getLeiReportStatusesByAid(
    "ecr1",
    user1.ecrAid.prefix,
    user1.roleClient,
  );
  assert.equal(sresp.status, 202);
  sbody = await sresp.json();
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
    assert.equal(credentialList.length, 1);
    credential = credentialList[0];
  }
  return credential;
}

export async function checkSignedUpload(
  signedUpResp: Response,
  fileName: string,
  signedZipDig: string,
  user: ApiUser,
): Promise<boolean> {
  assert.equal(signedUpResp.status, 200);
  const signedUpBody = await signedUpResp.json();
  assert.equal(signedUpBody["status"], "verified");
  assert.equal(signedUpBody["submitter"], `${user.ecrAid.prefix}`);
  const expectedEnding = `files in report package have been signed by submitter \\(${user.ecrAid.prefix}\\).`;
  expect(signedUpBody["message"]).toMatch(new RegExp(`${expectedEnding}`));

  assert.equal(signedUpBody["filename"], fileName);
  assert.equal(signedUpBody["contentType"], "application/zip");
  assert.equal(signedUpBody["size"] > 1000, true);

  let sresp = await apiAdapter.getReportStatusByDig(
    "ecr1",
    user.ecrAid.prefix,
    signedZipDig,
    user.roleClient,
  );
  assert.equal(sresp.status, 200);
  const signedUploadBody = await sresp.json();
  assert.equal(signedUploadBody["status"], "verified");
  assert.equal(signedUploadBody["submitter"], `${user.ecrAid.prefix}`);

  expect(signedUpBody["message"]).toMatch(new RegExp(`${expectedEnding}`));
  assert.equal(signedUploadBody["filename"], fileName);
  assert.equal(signedUploadBody["contentType"], "application/zip");
  assert.equal(signedUploadBody["size"] > 1000, true);

  sresp = await apiAdapter.getReportStatusByAid(
    "ecr1",
    user.ecrAid.prefix,
    user.roleClient,
  );
  assert.equal(sresp.status, 202);
  const twoUploadsBody = await sresp.json();
  // assert.equal(twoUploadsBody.length, 2);
  const signedStatus = twoUploadsBody[0];

  assert.equal(signedStatus["status"], "verified");
  assert.equal(signedStatus["submitter"], `${user.ecrAid.prefix}`);
  expect(signedUpBody["message"]).toMatch(new RegExp(`${expectedEnding}`));
  assert.equal(signedStatus["filename"], fileName);
  assert.equal(signedStatus["contentType"], "application/zip");
  assert.equal(signedStatus["size"] > 1000, true);

  return true;
}

export async function checkFailUpload(
  roleClient: SignifyClient,
  failUpResp: Response,
  fileName: string,
  failZipDig: string,
  ecrAid: HabState,
): Promise<boolean> {
  let failMessage = "";
  if (fileName.includes("genMissingSignature")) {
    failMessage = "files from report package missing valid signature";
  } else if (fileName.includes("genNoSignature")) {
    failMessage = "files from report package missing valid signature";
  } else if (fileName.includes("removeMetaInfReportsJson")) {
    // failMessage = "No manifest in file, invalid signed report package";
    assert.equal(failUpResp.status >= 300, true);
    const failUpBody = await failUpResp.json();
    return true;
  } else if (fileName.includes("wrongAid")) {
    failMessage = "signature from unknown AID";
  }

  assert.equal(failUpResp.status, 200);
  const failUpBody = await failUpResp.json();
  assert.equal(failUpBody["status"], "failed");
  assert.equal(failUpBody["submitter"], ecrAid.prefix);
  expect(failUpBody["message"]).toMatch(new RegExp(`${failMessage}`));
  assert.equal(failUpBody["contentType"], "application/zip");
  assert.equal(failUpBody["size"] > 1000, true);

  const sresp = await apiAdapter.getReportStatusByDig(
    ecrAid.name,
    ecrAid.prefix,
    failZipDig,
    roleClient,
  );
  assert.equal(sresp.status, 200);
  const signedUploadBody = await sresp.json();
  assert.equal(signedUploadBody["status"], "failed");
  assert.equal(signedUploadBody["submitter"], `${ecrAid.prefix}`);
  assert.equal(failUpBody["message"].includes(`${failMessage}`), true);
  assert.equal(signedUploadBody["contentType"], "application/zip");
  assert.equal(signedUploadBody["size"] > 1000, true);
  return true;
}

export async function checkBadDigestUpload(
  badDigestUpResp: Response,
): Promise<boolean> {
  assert.equal(badDigestUpResp.status, 400);
  const badDigestUpBody = await badDigestUpResp.json();
  assert.equal(badDigestUpBody, "Report digest verification failed");

  return true;
}

export async function checkNonPrefixedDigestUpload(
  badDigestUpResp: Response,
): Promise<boolean> {
  assert.equal(badDigestUpResp.status, 400);
  const badDigestUpBody = await badDigestUpResp.json();
  assert.equal(badDigestUpBody.includes("must start with prefix"), true);

  return true;
}

interface ApiUser {
  roleClient: any;
  ecrAid: any;
  ecrCred: any;
  ecrCredCesr: any;
  lei: string;
  uploadDig: string;
}

export function getSignedReports(signedDirPrefixed: string): string[] {
  if (process.env.SIGNED_REPORTS) {
    return process.env.SIGNED_REPORTS.split(",");
  } else {
    const fileNames = fs.readdirSync(signedDirPrefixed);
    return fileNames.map((fileName) => path.join(signedDirPrefixed, fileName));
  }
}

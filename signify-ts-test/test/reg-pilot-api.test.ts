import { strict as assert } from "assert";
import fs from "fs";
import * as process from "process";
import path from "path";
import { HabState, SignifyClient } from "signify-ts";
import { ApiAdapter } from "../src/api-adapter";
import { generateFileDigest } from "./utils/generate-digest";
import { resolveEnvironment, TestEnvironment } from "./utils/resolve-env";
import { ApiUser, getApiTestData, isEbaDataSubmitter } from "./utils/test-data";
import { buildUserData } from "../src/utils/handle-json-config";
import { ECR_SCHEMA_SAID } from "../src/constants";
import { sleep } from "./utils/test-util";

const failDir = "fail_reports";
let failDirPrefixed: string;
const signedDir = "signed_reports";
const secretsJsonPath = "../src/config/";

let env: TestEnvironment;
let apiAdapter: ApiAdapter;

afterEach(async () => {});

beforeAll(async () => {
  env = resolveEnvironment();
  apiAdapter = new ApiAdapter(env.apiBaseUrl);
});

if (require.main === module) {
  test("reg-pilot-api", async function run() {
    const configJson = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, secretsJsonPath + env.configuration),
        "utf-8",
      ),
    );
    let users = await buildUserData(configJson);
    users = users.filter((user) => user.type === "ECR");
    const apiUsers = await getApiTestData(
      configJson,
      env,
      users.map((user) => user.identifiers[0].name),
    );
    await run_api_test(apiUsers);
  }, 200000);
}
// This test assumes you have run a vlei test that sets up the
// role identifiers and Credentials.
// It also assumes you have generated the different report files
// from the report test
export async function run_api_test(apiUsers: ApiUser[]) {
  if (apiUsers.length == 3) await multi_user_test(apiUsers);
  else if (apiUsers.length == 1) await single_user_test(apiUsers[0]);
  else
    console.log(
      `Invalid acr AID count. Expected 1 or 3, got ${apiUsers.length}}`,
    );
}

module.exports = { run_api_test };

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
    user.idAlias,
    user.ecrAid.prefix,
    user.roleClient,
  );

  // login with the ecr credential
  let ecrCred;
  let ecrLei;
  let ecrCredCesr;
  for (let i = 0; i < user.creds.length; i++) {
    if (user.creds[i].sad.a.i === user.ecrAid.prefix) {
      const foundEcr = isEbaDataSubmitter(user.creds[i], user.ecrAid.prefix);
      if (foundEcr) {
        ecrCred = user.creds[i];
        ecrLei = ecrCred.sad.a.LEI;
        ecrCredCesr = user.credsCesr[i];
      }

      const lresp = await login(user, user.creds[i], user.credsCesr[i]);
      if (lresp.status) {
        sleep(1000);
        await checkLogin(user, user.creds[i]);
      } else {
        fail("Failed to login");
      }
    }
  }

  // try to get status without signed headers provided
  let heads = new Headers();
  let sreq = { headers: heads, method: "GET", body: null };
  let spath = `/status/${user.ecrAid.prefix}`;
  sresp = await fetch(env.apiBaseUrl + spath, sreq);
  assert.equal(sresp.status, 422); // no signed headers provided

  const dresp = await apiAdapter.dropReportStatusByAid(
    user.idAlias,
    user.ecrAid.prefix,
    user.roleClient,
  );
  if (dresp.status < 300) {
    // succeeds to query report status
    sresp = await apiAdapter.getReportStatusByAid(
      user.idAlias,
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
  const keeper = user.roleClient.manager!.get(user.ecrAid);
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
  //   const ecrOobi = await roleClient.oobis().get(user.idAlias, "agent");
  //   console.log("Verifier must have already seen the login", ecrOobi);
  // Loop over the reports directory

  // Check signed reports
  for (const signedReport of signedReports) {
    if (fs.lstatSync(signedReport).isFile()) {
      await apiAdapter.dropReportStatusByAid(
        user.idAlias,
        user.ecrAid.prefix,
        user.roleClient,
      );
      console.log(`Processing file: ${signedReport}`);
      const signedZipBuf = fs.readFileSync(`${signedReport}`);
      const signedZipDig = generateFileDigest(signedZipBuf);
      const signedUpResp = await apiAdapter.uploadReport(
        user.idAlias,
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
        ecrCred,
      );
    }
  }

  if (fs.existsSync(failDirPrefixed)) {
    const failReports = fs.readdirSync(failDirPrefixed);

    // Check fail reports
    for (const failReport of failReports) {
      const filePath = path.join(failDirPrefixed, failReport);
      if (fs.lstatSync(filePath).isFile()) {
        await apiAdapter.dropReportStatusByAid(
          user.idAlias,
          user.ecrAid.prefix,
          user.roleClient,
        );
        console.log(`Processing file: ${filePath}`);
        const failZipBuf = fs.readFileSync(`${filePath}`);
        const failZipDig = generateFileDigest(failZipBuf);
        const failUpResp = await apiAdapter.uploadReport(
          user.idAlias,
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
        user.idAlias,
        user.ecrAid.prefix,
        user.roleClient,
      );
      console.log(`Processing file: ${signedReport}`);
      const badDigestZipBuf = fs.readFileSync(`${signedReport}`);
      const badDigestZipDig = "sha256-f5eg8fhaFybddaNOUHNU87Bdndfawf";
      const badDigestUpResp = await apiAdapter.uploadReport(
        user.idAlias,
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
        user.idAlias,
        user.ecrAid.prefix,
        user.roleClient,
      );
      console.log(`Processing file: ${signedReport}`);
      const badDigestZipBuf = fs.readFileSync(`${signedReport}`);
      const badDigestZipDig = generateFileDigest(badDigestZipBuf).substring(7);
      const badDigestUpResp = await apiAdapter.uploadReport(
        user.idAlias,
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
      user.idAlias,
      user.ecrAid.prefix,
      user.roleClient,
    );

    // login with the ecr credential
    let ecrCred;
    let ecrLei;
    let ecrCredCesr;
    for (let i = 0; i < user.creds.length; i++) {
      login(user, user.creds[i], user.credsCesr[i]);

      if (isEbaDataSubmitter(ecrCred, user.ecrAid.prefix)) {
        ecrCred = user.creds[i];
        ecrLei = ecrCred.sad.a.LEI;
        ecrCredCesr = user.credsCesr[i];
      }

      checkLogin(user, user.creds[i]);
    }

    // try to get status without signed headers provided
    const heads = new Headers();
    let sreq = { headers: heads, method: "GET", body: null };
    let spath = `/status/${user.ecrAid.prefix}`;
    sresp = await fetch(env.apiBaseUrl + spath, sreq);
    assert.equal(sresp.status, 422); // no signed headers provided

    await apiAdapter.dropReportStatusByAid(
      user.idAlias,
      user.ecrAid.prefix,
      user.roleClient,
    );
    // succeeds to query report status
    sresp = await apiAdapter.getReportStatusByAid(
      user.idAlias,
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
        await apiAdapter.dropReportStatusByAid(
          user.idAlias,
          user.ecrAid.prefix,
          user.roleClient,
        );
        console.log(`Processing file: ${signedReport}`);
        const signedZipBuf = fs.readFileSync(`${signedReport}`);
        const signedZipDig = generateFileDigest(signedZipBuf);
        const signedUpResp = await apiAdapter.uploadReport(
          user.idAlias,
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
          ecrCred,
        );
        user.uploadDig = signedZipDig;
        break;
      }
    }
  }
  // check upload by aid
  let sresp = await apiAdapter.getReportStatusByAid(
    user1.idAlias,
    user1.ecrAid.prefix,
    user1.roleClient,
  );
  assert.equal(sresp.status, 202);
  let sbody = await sresp.json();

  // check upload by aid from different lei
  sresp = await apiAdapter.getReportStatusByAid(
    user1.idAlias,
    user3.ecrAid.prefix,
    user1.roleClient,
  );
  assert.equal(sresp.status, 401);

  // check upload by dig from different lei
  sresp = await apiAdapter.getReportStatusByDig(
    user1.idAlias,
    user3.ecrAid.prefix,
    user3.uploadDig,
    user1.roleClient,
  );
  assert.equal(sresp.status, 401);

  // check upload by dig from the same lei
  sresp = await apiAdapter.getReportStatusByDig(
    user2.idAlias,
    user2.ecrAid.prefix,
    user1.uploadDig,
    user2.roleClient,
  );
  assert.equal(sresp.status, 200);

  // check LEI upload statuses by aid
  sresp = await apiAdapter.getLeiReportStatusesByAid(
    user1.idAlias,
    user1.ecrAid.prefix,
    user1.roleClient,
  );
  assert.equal(sresp.status, 202);
  sbody = await sresp.json();
}

export async function checkSignedUpload(
  signedUpResp: Response,
  fileName: string,
  signedZipDig: string,
  user: ApiUser,
  ecrCred: any,
): Promise<boolean> {
  assert.equal(signedUpResp.status, 200);
  const signedUpBody = await signedUpResp.json();
  assert.equal(signedUpBody["status"], "verified");
  assert.equal(signedUpBody["submitter"], `${user.ecrAid.prefix}`);
  const expectedEnding = `files in report package, submitted by ${user.ecrAid.prefix}, have been signed by known AIDs from the LEI ${ecrCred.sad.a.LEI}.`;
  expect(signedUpBody["message"]).toMatch(new RegExp(`${expectedEnding}`));

  assert.equal(signedUpBody["filename"], fileName);
  assert.equal(signedUpBody["contentType"], "application/zip");
  assert.equal(signedUpBody["size"] > 1000, true);

  let sresp = await apiAdapter.getReportStatusByDig(
    user.idAlias,
    user.ecrAid.prefix,
    signedZipDig,
    user.roleClient,
  );
  assert.equal(sresp.status, 200);
  const signedUploadBody = await sresp.json();
  assert.equal(signedUploadBody["status"], "verified");
  assert.equal(signedUploadBody["submitter"], `${user.ecrAid.prefix}`);

  // expect(signedUpBody["message"]).toMatch(new RegExp(`${expectedEnding}`));
  assert.equal(signedUploadBody["filename"], fileName);
  assert.equal(signedUploadBody["contentType"], "application/zip");
  assert.equal(signedUploadBody["size"] > 1000, true);

  sresp = await apiAdapter.getReportStatusByAid(
    user.idAlias,
    user.ecrAid.prefix,
    user.roleClient,
  );
  assert.equal(sresp.status, 202);
  const twoUploadsBody = await sresp.json();
  // assert.equal(twoUploadsBody.length, 2);
  const signedStatus = twoUploadsBody[0];

  assert.equal(signedStatus["status"], "verified");
  assert.equal(signedStatus["submitter"], `${user.ecrAid.prefix}`);
  // expect(signedUpBody["message"]).toMatch(new RegExp(`${expectedEnding}`));
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
    failMessage = "signature from AID that is not a known";
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

export function getSignedReports(signedDirPrefixed: string): string[] {
  if (process.env.SIGNED_REPORTS) {
    return process.env.SIGNED_REPORTS.split(",");
  } else {
    const fileNames = fs.readdirSync(signedDirPrefixed);
    return fileNames.map((fileName) => path.join(signedDirPrefixed, fileName));
  }
}

async function checkLogin(user: ApiUser, cred: any) {
  let heads = new Headers();
  heads.set("Content-Type", "application/json");
  let creq = { headers: heads, method: "GET", body: null };
  let cpath = `/checklogin/${user.ecrAid.prefix}`;
  const cresp = await fetch(env.apiBaseUrl + cpath, creq);
  let cbody = await cresp.json();
  if (isEbaDataSubmitter(cred, user.ecrAid.prefix)) {
    assert.equal(cresp.status, 200);
    assert.equal(cbody["aid"], `${user.ecrAid.prefix}`);
    assert.equal(
      cbody["msg"],
      `AID ${user.ecrAid.prefix} w/ lei ${cred.sad.a.LEI} has valid login account`,
    );
    assert.equal(cbody["said"], cred.sad.d);
  } else {
    assert.equal(cresp.status, 401);
    assert.equal(
      cbody["msg"],
      `identifier ${user.ecrAid.prefix} presented credentials ${cred.sad.d}, w/ status Credential unauthorized, info: Can't authorize cred with OOR schema`,
    );
  }
  return cresp;
}

async function login(user: ApiUser, cred: any, credCesr: any) {
  let heads = new Headers();
  heads.set("Content-Type", "application/json");
  let lbody = {
    vlei: credCesr,
    said: cred.sad.d,
  };
  let lreq = {
    headers: heads,
    method: "POST",
    body: JSON.stringify(lbody),
  };
  let lpath = `/login`;
  const lresp = await fetch(env.apiBaseUrl + lpath, lreq);
  console.log("login response", lresp);
  if (isEbaDataSubmitter(cred, user.ecrAid.prefix)) {
    assert.equal(lresp.status, 202);
    let ljson = await lresp.json();
    const credJson = JSON.parse(ljson["creds"]);
    assert.equal(credJson.length >= 1, true);
    assert.equal(credJson[0].sad.a.i, `${user.ecrAid.prefix}`);
  } else {
    let ljson = await lresp.json();
    assert.equal(lresp.status, 202);
    assert.equal(
      ljson["msg"],
      `${cred.sad.d} for ${cred.sad.a.i} as issuee is Credential cryptographically valid`,
    );
  }
  return lresp;
}

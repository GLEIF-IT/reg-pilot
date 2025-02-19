import { strict as assert } from "assert";
import fs from "fs";
import * as process from "process";
import path from "path";
import { HabState, Keeper, SignifyClient } from "signify-ts";
import { ApiAdapter } from "../src/api-adapter";
import { generateFileDigest } from "../src/utils/generate-digest";
import { TestEnvironment, TestPaths } from "../src/utils/resolve-env";
import { ApiUser, isEbaDataSubmitter } from "../src/utils/test-data";
import { sleep } from "../src/utils/test-util";
import jwt from "jsonwebtoken";

const failDir = "fail_reports";
let failDirPrefixed: string;
const signedDir = "signed_reports";
const secretsJsonPath = "../src/config/";

let env: TestEnvironment;
let apiAdapter: ApiAdapter;

afterEach(async () => {});

beforeAll(async () => {});
//   env = resolveEnvironment();
//   apiAdapter = new ApiAdapter(env.apiBaseUrl);
// });

// if (require.main === module) {
//   test("reg-pilot-api", async function run() {
//     const configFileName = env.configuration;
//     let dirPath = "../src/config/";
//     const configFilePath = path.join(__dirname, dirPath) + configFileName;
//     const configJson = await getConfig(configFilePath);
//     let users = await buildUserData(configJson);
//     users = users.filter((user) => user.type === "ECR");
//     const apiUsers = await getApiTestData(
//       configJson,
//       env,
//       users.map((user) => user.identifiers[0].name),
//     );
//     await run_api_test(apiUsers, configJson);
//   }, 200000);
// }
// This test assumes you have run a vlei test that sets up the
// role identifiers and Credentials.
// It also assumes you have generated the different report files
// from the report test
export async function run_api_test(apiUsers: ApiUser[], fast = true) {
  if (apiUsers.length == 3) await multi_user_test(apiUsers);
  else if (apiUsers.length == 1) await single_user_test(apiUsers[0], fast);
  else
    console.log(
      `Invalid ecr AID count. Expected 1 or 3, got ${apiUsers.length}`,
    );
}

export async function run_api_test_no_delegation(apiUsers: ApiUser[]) {
  await api_test_no_delegation(apiUsers);
}

export async function run_api_admin_test(
  apiUsers: ApiUser[],
  adminUser: ApiUser,
) {
  await admin_test(apiUsers, adminUser);
}

export async function run_api_revocation_test(
  requestorClient: SignifyClient,
  requestorAidAlias: string,
  requestorAidPrefix: string,
  credentials: Map<string, ApiUser>,
) {
  await revoked_cred_upload_test(
    credentials,
    requestorAidAlias,
    requestorAidPrefix,
    requestorClient,
  );
}

export async function run_eba_api_test(apiUsers: ApiUser[]) {
  await single_user_eba_test(apiUsers[0]);
}

module.exports = {
  run_api_test,
  run_api_admin_test,
  run_api_revocation_test,
  run_api_test_no_delegation,
  run_eba_api_test,
  single_user_eba_test,
};

async function single_user_test(user: ApiUser, fast = false) {
  const testPaths = TestPaths.getInstance();
  const env = TestEnvironment.getInstance();
  const apiAdapter = new ApiAdapter(env.apiBaseUrl, env.filerBaseUrl);

  failDirPrefixed = path.join(testPaths.testFailReports, user.ecrAid.prefix);
  let ppath = "/ping";
  let preq = { method: "GET", body: null };
  let presp = await fetch(env.apiBaseUrl + ppath, preq);
  console.log("ping response", presp);
  assert.equal(presp.status, 200);

  // fails to query report status because not logged in with ecr yet
  // let sresp = await apiAdapter.getReportStatusByAid(
  //   user.idAlias,
  //   user.ecrAid.prefix,
  //   user.roleClient,
  // );
  let sresp = null;

  // login with the ecr credential
  let ecrCred;
  let ecrLei;
  let ecrCredCesr;
  let ecrUser;
  for (let i = 0; i < user.creds.length; i++) {
    if (user.creds[i]["cred"].sad.a.i === user.ecrAid.prefix) {
      const foundEcr = isEbaDataSubmitter(
        user.creds[i]["cred"],
        user.ecrAid.prefix,
      );
      if (foundEcr) {
        ecrUser = user;
        ecrCred = user.creds[i]["cred"];
        ecrLei = ecrCred.sad.a.LEI;
        ecrCredCesr = user.creds[i]["credCesr"];
      }

      const lresp = await login(
        user,
        user.creds[i]["cred"],
        user.creds[i]["credCesr"],
      );
      // if (lresp.status) {
      //   sleep(1000);
      //   await checkLogin(user, user.creds[i]["cred"], false);
      // } else {
      //   fail("Failed to login");
      // }
    }
  }
  if (ecrUser) {
    const lresp = await login(ecrUser, ecrCred, ecrCredCesr);
    if (lresp.status) {
      sleep(1000);
      await checkLogin(ecrUser, ecrCred, false);
    } else {
      fail("Failed to login");
    }
  }

  // try to get status without signed headers provided
  // let heads = new Headers();
  // let sreq = { headers: heads, method: "GET", body: null };
  // let spath = `/status/${user.ecrAid.prefix}`;
  // sresp = await fetch(env.apiBaseUrl + spath, sreq);
  // assert.equal(sresp.status, 422); // no signed headers provided

  // const dresp = await apiAdapter.dropReportStatusByAid(
  //   user.idAlias,
  //   user.ecrAid.prefix,
  //   user.roleClient
  // );
  // if (dresp.status < 300) {
  //   // succeeds to query report status
  //   sresp = await apiAdapter.getReportStatusByAid(
  //     user.idAlias,
  //     user.ecrAid.prefix,
  //     user.roleClient
  //   );
  //   assert.equal(sresp.status, 202);
  //   const sbody = await sresp.json();
  //   assert.equal(sbody.length, 0);
  // } else {
  //   assert.fail("Failed to drop report status");
  // }

  const signedReports = [testPaths.testReportGeneratedSignedZip];

  for (const signedReport of signedReports) {
    if (fs.lstatSync(signedReport).isFile()) {
      await apiAdapter.dropReportStatusByAid(
        user.idAlias,
        user.ecrAid.prefix,
        user.roleClient,
      );

      const startUpload = new Date().getTime();
      console.log(`Uploading signed report file: ${signedReport}`);
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
      const endUpload = new Date().getTime();
      console.log(`Upload time: ${endUpload - startUpload} ms`);
      await checkSignedUpload(
        signedUpResp,
        path.basename(signedReport),
        signedZipDig,
        user,
      );
      if (fast) break;
    }
  }

  // if (fs.existsSync(failDirPrefixed)) {
  //   const failReports = fs.readdirSync(failDirPrefixed);

  //   // Check fail reports
  //   for (const failReport of failReports) {
  //     const filePath = path.join(failDirPrefixed, failReport);
  //     if (fs.lstatSync(filePath).isFile()) {
  //       await apiAdapter.dropReportStatusByAid(
  //         user.idAlias,
  //         user.ecrAid.prefix,
  //         user.roleClient
  //       );
  //       console.log(`Uploading fail report file: ${filePath}`);
  //       const failZipBuf = fs.readFileSync(`${filePath}`);
  //       const failZipDig = generateFileDigest(failZipBuf);
  //       const failUpResp = await apiAdapter.uploadReport(
  //         user.idAlias,
  //         user.ecrAid.prefix,
  //         failReport,
  //         failZipBuf,
  //         failZipDig,
  //         user.roleClient
  //       );
  //       await checkFailUpload(
  //         user.roleClient,
  //         failUpResp,
  //         failReport,
  //         failZipDig,
  //         user.ecrAid
  //       );
  //       if (fast) break;
  //     }
  //   }
  // }

  // // Check reports with bad digest
  // for (const signedReport of signedReports) {
  //   if (fs.lstatSync(signedReport).isFile()) {
  //     await apiAdapter.dropReportStatusByAid(
  //       user.idAlias,
  //       user.ecrAid.prefix,
  //       user.roleClient
  //     );
  //     console.log(`Uploading signed report w/ bad digest: ${signedReport}`);
  //     const badDigestZipBuf = fs.readFileSync(`${signedReport}`);
  //     const badDigestZipDig = "sha256-f5eg8fhaFybddaNOUHNU87Bdndfawf";
  //     const badDigestUpResp = await apiAdapter.uploadReport(
  //       user.idAlias,
  //       user.ecrAid.prefix,
  //       signedReport,
  //       badDigestZipBuf,
  //       badDigestZipDig,
  //       user.roleClient
  //     );
  //     await checkBadDigestUpload(badDigestUpResp);
  //     if (fast) break;
  //   }
  // }

  // // Check reports with not prefixed digest
  // for (const signedReport of signedReports) {
  //   if (fs.lstatSync(signedReport).isFile()) {
  //     await apiAdapter.dropReportStatusByAid(
  //       user.idAlias,
  //       user.ecrAid.prefix,
  //       user.roleClient
  //     );
  //     console.log(`Processing file: ${signedReport}`);
  //     const badDigestZipBuf = fs.readFileSync(`${signedReport}`);
  //     const badDigestZipDig = generateFileDigest(badDigestZipBuf).substring(7);
  //     console.log(`Testing a bad digest on the file: ${signedReport}`);
  //     const badDigestUpResp = await apiAdapter.uploadReport(
  //       user.idAlias,
  //       user.ecrAid.prefix,
  //       signedReport,
  //       badDigestZipBuf,
  //       badDigestZipDig,
  //       user.roleClient
  //     );
  //     await checkNonPrefixedDigestUpload(badDigestUpResp);
  //     if (fast) break;
  //   }
  // }
}

// Specail test for eba api
// TODO create multisig test
export async function single_user_eba_test(user: ApiUser) {
  const testPaths = TestPaths.getInstance();
  const env = TestEnvironment.getInstance();

  const apiAdapter = new ApiAdapter(env.apiBaseUrl, env.filerBaseUrl);

  // login with the ecr credential
  let ecrCred;
  let ecrLei;
  let ecrCredCesr;
  let ecrUser;
  for (let i = 0; i < user.creds.length; i++) {
    if (user.creds[i]["cred"].sad.a.i === user.ecrAid.prefix) {
      const foundEcr = isEbaDataSubmitter(
        user.creds[i]["cred"],
        user.ecrAid.prefix,
      );
      if (foundEcr) {
        ecrUser = user;
        ecrCred = user.creds[i]["cred"];
        ecrLei = ecrCred.sad.a.LEI;
        ecrCredCesr = user.creds[i]["credCesr"];
      }

      const token = await ebaLogin(
        user,
        user.creds[i]["cred"],
        user.creds[i]["credCesr"],
      );
      if (token && foundEcr) {
        const decodedToken = jwt.decode(token);
        if (decodedToken && typeof decodedToken === "object") {
          assert.equal(
            decodedToken["data"]["signifyResource"],
            user.ecrAid.prefix,
          );
          console.log("EBA login succeeded with expected AID", decodedToken);
        } else {
          console.error("Failed to decode JWT token");
        }

        console.log("EBA login succeeded", token);
        // Get the current working directory
        const currentDirectory = process.cwd();
        // Print the current working directory
        console.log("Current Directory:", currentDirectory);

        const signedReport = testPaths.testReportGeneratedSignedZip;
        const signedUpResp = await apiAdapter.ebaUploadReport(
          user.idAlias,
          path.basename(signedReport),
          await fs.promises.readFile(signedReport),
          user.roleClient,
          token,
          env,
        );
        console.log("EBA upload response", signedUpResp);
        assert.equal(signedUpResp.status, 200);
        const resBod = await signedUpResp.json();
        console.log("EBA upload response body", resBod["message"]);
      }
    }
  }
}

async function multi_user_test(apiUsers: Array<ApiUser>) {
  let user1: ApiUser;
  let user2: ApiUser;
  let user3: ApiUser;

  const env = TestEnvironment.getInstance();
  const apiAdapter = new ApiAdapter(env.apiBaseUrl, env.filerBaseUrl);

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
      process.cwd(),
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
      await login(user, user.creds[i]["cred"], user.creds[i]["credCesr"]);
      const foundEcr = isEbaDataSubmitter(
        user.creds[i]["cred"],
        user.ecrAid.prefix,
      );
      if (foundEcr) {
        ecrCred = user.creds[i]["cred"];
        ecrLei = ecrCred.sad.a.LEI;
        ecrCredCesr = user.creds[i]["credCesr"];
      }

      await checkLogin(user, user.creds[i]["cred"], false);
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
    const sbody = await sresp.json();
    console.log("Multi-user current report status", sbody);
    assert.equal(sbody.length, 0);
    assert.equal(sresp.status, 202);

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

async function admin_test(apiUsers: Array<ApiUser>, adminUser: ApiUser) {
  const env = TestEnvironment.getInstance();
  const apiAdapter = new ApiAdapter(env.apiBaseUrl, env.filerBaseUrl);

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
      await login(user, user.creds[i]["cred"], user.creds[i]["credCesr"]);
      const foundEcr = isEbaDataSubmitter(
        user.creds[i]["cred"],
        user.ecrAid.prefix,
      );
      if (foundEcr) {
        ecrCred = user.creds[i]["cred"];
        ecrLei = ecrCred.sad.a.LEI;
        ecrCredCesr = user.creds[i]["credCesr"];
      }

      await checkLogin(user, user.creds[i]["cred"], false);
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
        );
        user.uploadDig = signedZipDig;
        break;
      }
    }
  }
  await login(
    adminUser,
    adminUser.creds[0]["cred"],
    adminUser.creds[0]["credCesr"],
  );
  let sresp = await apiAdapter.getReportsStatusAdmin(
    adminUser.idAlias,
    adminUser.ecrAid.prefix,
    adminUser.roleClient,
  );
  assert.equal(sresp.status, 200);
  let sbody = await sresp.json();
}

async function api_test_no_delegation(apiUsers: Array<ApiUser>) {
  const env = TestEnvironment.getInstance();
  for (const user of apiUsers) {
    // try to ping the api
    let ppath = "/ping";
    let preq = { method: "GET", body: null };
    let presp = await fetch(env.apiBaseUrl + ppath, preq);
    console.log("ping response", presp);
    assert.equal(presp.status, 200);

    // login with the ecr credential
    for (let i = 0; i < user.creds.length; i++) {
      await login(user, user.creds[i]["cred"], user.creds[i]["credCesr"]);
      await checkLogin(user, user.creds[i]["cred"], false, true);
    }
  }
}

async function revoked_cred_upload_test(
  credentials: Map<string, ApiUser>,
  requestorAidAlias: string,
  requestorAidPrefix: string,
  requestorClient: SignifyClient,
) {
  const env = TestEnvironment.getInstance();
  const apiAdapter = new ApiAdapter(env.apiBaseUrl, env.filerBaseUrl);

  const ecr_cred_prev_state = credentials.get("ecr_cred_prev_state")!;
  const ecr_cred_revoke = credentials.get("ecr_cred_revoke")!;
  const ecr_cred_new_state = credentials.get("ecr_cred_new_state")!;

  const signedDirPrefixed = path.join(
    process.cwd(),
    "data",
    signedDir,
    ecr_cred_prev_state.ecrAid.prefix,
  );
  // try to ping the api
  let ppath = "/ping";
  let preq = { method: "GET", body: null };
  let presp = await fetch(env.apiBaseUrl + ppath, preq);
  console.log("ping response", presp);
  assert.equal(presp.status, 200);

  // 1st case. Presenting non revoked credential
  // TODO: update login with new /revoke_credential endpoint call
  await login(
    ecr_cred_prev_state,
    ecr_cred_prev_state.creds[0]["cred"],
    ecr_cred_prev_state.creds[0]["credCesr"],
  );
  await checkLogin(
    ecr_cred_prev_state,
    ecr_cred_prev_state.creds[0]["cred"],
    false,
  );

  // Get the current working directory
  const currentDirectory = process.cwd();
  // Print the current working directory
  console.log("Current Directory:", currentDirectory);

  // sanity check that the report verifies
  const keeper = ecr_cred_prev_state.roleClient.manager!.get(
    ecr_cred_prev_state.ecrAid,
  );
  const signer = keeper.signers[0];

  const signedReports = getSignedReports(signedDirPrefixed);
  // Check signed reports
  const signedReport = signedReports[0];
  if (fs.lstatSync(signedReport).isFile()) {
    await apiAdapter.dropReportStatusByAid(
      ecr_cred_prev_state.idAlias,
      ecr_cred_prev_state.ecrAid.prefix,
      ecr_cred_prev_state.roleClient,
    );
    console.log(`Processing file: ${signedReport}`);
    const signedZipBuf = fs.readFileSync(`${signedReport}`);
    const signedZipDig = generateFileDigest(signedZipBuf);
    const signedUpResp = await apiAdapter.uploadReport(
      ecr_cred_prev_state.idAlias,
      ecr_cred_prev_state.ecrAid.prefix,
      signedReport,
      signedZipBuf,
      signedZipDig,
      ecr_cred_prev_state.roleClient,
    );
    await checkSignedUpload(
      signedUpResp,
      path.basename(signedReport),
      signedZipDig,
      ecr_cred_prev_state,
    );
    ecr_cred_prev_state.uploadDig = signedZipDig;
  }

  // check upload by aid
  let sresp = await apiAdapter.getReportStatusByAid(
    ecr_cred_prev_state.idAlias,
    ecr_cred_prev_state.ecrAid.prefix,
    ecr_cred_prev_state.roleClient,
  );
  assert.equal(sresp.status, 202);
  let sbody = await sresp.json();

  // 2nd case. Presenting revoked credential

  await presentRevocation(
    requestorAidAlias,
    requestorAidPrefix,
    requestorClient,
    ecr_cred_revoke.creds[0]["cred"],
    ecr_cred_revoke.creds[0]["credCesr"],
  );
  await checkLogin(ecr_cred_revoke, ecr_cred_revoke.creds[0]["cred"], true);

  // 3rd case. Logging in using previous state(non-revoked) of the credential(which was revoked)
  await login(
    ecr_cred_prev_state,
    ecr_cred_prev_state.creds[0]["cred"],
    ecr_cred_revoke.creds[0]["credCesr"],
  );
  await checkLogin(
    ecr_cred_prev_state,
    ecr_cred_prev_state.creds[0]["cred"],
    true,
  );

  // 4th case. Presenting new ECR credentail with new SAID
  await login(
    ecr_cred_new_state,
    ecr_cred_new_state.creds[0]["cred"],
    ecr_cred_new_state.creds[0]["credCesr"],
  );
  await checkLogin(
    ecr_cred_new_state,
    ecr_cred_new_state.creds[0]["cred"],
    false,
  );
}

export async function checkSignedUpload(
  signedUpResp: Response,
  fileName: string,
  signedZipDig: string,
  user: ApiUser,
): Promise<boolean> {
  const env = TestEnvironment.getInstance();
  const apiAdapter = new ApiAdapter(env.apiBaseUrl, env.filerBaseUrl);

  assert.equal(signedUpResp.status, 200);
  const signedUpBody = await signedUpResp.json();
  assert.equal(signedUpBody["status"], "verified");
  assert.equal(signedUpBody["submitter"], `${user.ecrAid.prefix}`);
  const expectedEnding = `files in report package, submitted by ${user.ecrAid.prefix}, have been signed by known AIDs`;
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
  const env = TestEnvironment.getInstance();
  const apiAdapter = new ApiAdapter(env.apiBaseUrl, env.filerBaseUrl);

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
    failMessage = `signature from ${ecrAid.prefix} does not match the report signer`;
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

export function getSignedReports(
  signedDirPrefixed: string,
  files?: string[],
): string[] {
  const fileNames = files || fs.readdirSync(signedDirPrefixed);
  return fileNames.map((fileName) => path.join(signedDirPrefixed, fileName));
}

async function checkLogin(
  user: ApiUser,
  cred: any,
  credRevoked: boolean = false,
  noDelegation: boolean = false,
) {
  const env = TestEnvironment.getInstance();
  let heads = new Headers();
  heads.set("Content-Type", "application/json");
  const client: SignifyClient = user.roleClient;
  heads.set("Connection", "close"); // avoids debugging fetch failures
  let creq = { headers: heads, method: "GET", body: null };
  let cpath = `/checklogin/${user.ecrAid.prefix}`;
  const url = env.apiBaseUrl + cpath;
  let sreq = await client.createSignedRequest(user.idAlias, url, creq);
  console.log("checklogin request", sreq);
  const cresp = await fetch(url, sreq);
  let cbody = await cresp.json();
  console.log("checklogin response", cresp);
  if (isEbaDataSubmitter(cred, user.ecrAid.prefix)) {
    if (credRevoked) {
      assert.equal(cresp.status, 401);
      assert.equal(
        cbody["msg"],
        `identifier ${user.ecrAid.prefix} presented credentials ${cred.sad.d}, w/ status Credential revoked, info: Credential was revoked`,
      );
    } else if (noDelegation) {
      assert.equal(cresp.status, 401);
      assert.equal(
        cbody["msg"],
        `identifier ${user.ecrAid.prefix} presented credentials ${cred.sad.d}, w/ status Credential unauthorized, info: ECR chain validation failed, LE chain validation failed, The QVI AID must be delegated`,
      );
    } else {
      assert.equal(cresp.status, 200);
      assert.equal(cbody["aid"], `${user.ecrAid.prefix}`);
      assert.equal(
        cbody["msg"],
        `AID ${user.ecrAid.prefix} w/ lei ${cred.sad.a.LEI} has valid login account`,
      );
      assert.equal(cbody["said"], cred.sad.d);
    }
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
  const env = TestEnvironment.getInstance();
  let heads = new Headers();
  heads.set("Content-Type", "application/json");
  heads.set("Connection", "close"); // avoids debugging fetch failures
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
  console.log("login request", JSON.stringify(lreq).slice(0, 500));
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

async function ebaLogin(user: ApiUser, cred: any, credCesr: any) {
  const env = TestEnvironment.getInstance();
  let lheads = new Headers();
  lheads.set("Content-Type", "application/json");
  lheads.set("uiversion", "1.3.10-484-FINAL-master");
  lheads.set("Accept", "application/json, text/plain, */*");
  lheads.set("Connection", "close"); // avoids debugging fetch failures
  let lbody = {
    credential: {
      cesr: credCesr,
      raw: cred,
    },
    sessionId: "78a55420-a074-4ba3-85f9-11aa343995a0",
  };
  let base64Payload = Buffer.from(JSON.stringify(lbody)).toString("base64");
  let lreq = {
    headers: lheads,
    method: "POST",
    body: JSON.stringify({ payload: base64Payload }),
  };
  console.log(`eba login lreq ${JSON.stringify(lreq).slice(0, 500)}...`);
  let lpath = `/signifyLogin`;
  const lresp = await fetch(env.apiBaseUrl + lpath, lreq);
  console.log("login response", lresp);
  let token;
  if (isEbaDataSubmitter(cred, user.ecrAid.prefix)) {
    assert.equal(lresp.status, 200);
    let ljson = await lresp.json();
    token = ljson["jwt"];
    assert.equal(token.length >= 1, true);
  }
  return token;
}

async function presentRevocation(
  requestorAidAlias: string,
  requestorAidPrefix: string,
  requestorClient: SignifyClient,
  cred: any,
  credCesr: any,
) {
  const env = TestEnvironment.getInstance();
  let heads = new Headers();
  heads.set("Content-Type", "application/json");
  heads.set("Connection", "close"); // avoids debugging fetch failures
  let lbody = {
    vlei: credCesr,
    said: cred.sad.d,
  };
  let lreq = {
    headers: heads,
    method: "POST",
    body: JSON.stringify(lbody),
  };
  let lpath = `/present_revocation`;
  const url = env.apiBaseUrl + lpath;
  let sreq = await requestorClient.createSignedRequest(
    requestorAidAlias,
    url,
    lreq,
  );
  const lresp = await fetch(url, sreq);
  console.log("login response", lresp);
  assert.equal(lresp.status, 202);
  let ljson = await lresp.json();
  const credJson = JSON.parse(ljson["creds"]);
  assert.equal(credJson.length >= 1, true);
  assert.equal(credJson[0].sad.a.i, `${cred.sad.a.i}`);
  assert.equal(
    ljson["msg"],
    `${cred.sad.d} for ${cred.sad.a.i} as issuee is Credential cryptographically valid`,
  );
  return lresp;
}

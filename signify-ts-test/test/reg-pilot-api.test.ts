import { strict as assert } from "assert";
import fs from "fs";
import * as process from "process";

import {
  checkBadDigestUpload,
  checkFailUpload,
  checkNonPrefixedDigestUpload,
  dropReportStatusByAid,
  getGrantedCredential,
  getOrCreateClients,
  getReportStatusByAid,
  getReportStatusByDig,
  uploadReport,
} from "./utils/test-util";
import { generateFileDigest } from "./utils/generate-digest";
import { resolveEnvironment, TestEnvironment } from "./utils/resolve-env";
import { unknownPrefix } from "./report.test";
import { HabState, SignifyClient } from "signify-ts";
import path from "path";
import { sign } from "crypto";

const ECR_SCHEMA_SAID = "EEy9PkikFcANV1l7EHukCeXqrzT1hNZjGlUk7wuMO5jw";

let ecrAid: HabState;
let ecrCred: any;
let ecrCredCesr: any;
let ecrCredHolder: any;
let env: TestEnvironment;
let roleClient: SignifyClient;

const failDir = "fail_reports";
let failDirPrefixed: string;
const signedDir = "signed_reports";
let signedDirPrefixed: string;
let signedReports: string[];

afterEach(async () => {});

beforeAll(async () => {
  env = resolveEnvironment();

  const clients = await getOrCreateClients(
    env.secrets.length,
    env.secrets,
    true,
  );
  roleClient = clients.pop()!;

  ecrAid = await roleClient.identifiers().get(env.roleName);
  failDirPrefixed = path.join(__dirname, "data", failDir, ecrAid.prefix);
  signedDirPrefixed = path.join(__dirname, "data", signedDir, ecrAid.prefix);

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
  ecrCredHolder = await getGrantedCredential(roleClient, ecrCred.sad.d);
  assert(ecrCred !== undefined);
  assert.equal(ecrCredHolder.sad.d, ecrCred.sad.d);
  assert.equal(ecrCredHolder.sad.s, ECR_SCHEMA_SAID);
  assert.equal(ecrCredHolder.status.s, "0");
  assert(ecrCredHolder.atc !== undefined);
  ecrCredCesr = await roleClient.credentials().get(ecrCred.sad.d, true);

  signedReports = process.env.SIGNED_REPORTS ? process.env.SIGNED_REPORTS.split(",") : getDefaultSignedReports();
});

test("reg-pilot-api", async function run() {
  // try to ping the api
  let ppath = "/ping";
  let preq = { method: "GET", body: null };
  let presp = await fetch(env.apiBaseUrl + ppath, preq);
  console.log("ping response", presp);
  assert.equal(presp.status, 200);

  // fails to query report status because not logged in with ecr yet
  let sresp = await getReportStatusByAid(
    env.roleName,
    ecrAid.prefix,
    roleClient,
    env.apiBaseUrl,
  );

  // login with the ecr credential
  let heads = new Headers();
  heads.set("Content-Type", "application/json");
  let lbody = {
    vlei: ecrCredCesr,
    said: ecrCred.sad.d,
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
  assert.equal(credJson[0].sad.a.i, `${ecrAid.prefix}`);

  heads = new Headers();
  heads.set("Content-Type", "application/json");
  let creq = { headers: heads, method: "GET", body: null };
  let cpath = `/checklogin/${ecrAid.prefix}`;
  let cresp = await fetch(env.apiBaseUrl + cpath, creq);
  assert.equal(cresp.status, 200);
  let cbody = await cresp.json();
  assert.equal(cbody["aid"], `${ecrAid.prefix}`);
  assert.equal(cbody["msg"], "AID presented valid credential");
  assert.equal(cbody["said"], ecrCred.sad.d);

  // try to get status without signed headers provided
  heads = new Headers();
  let sreq = { headers: heads, method: "GET", body: null };
  let spath = `/status/${ecrAid.prefix}`;
  sresp = await fetch(env.apiBaseUrl + spath, sreq);
  assert.equal(sresp.status, 422); // no signed headers provided

  const dresp = await dropReportStatusByAid(
    env.roleName,
    ecrAid.prefix,
    roleClient,
    env.apiBaseUrl,
  );
  if (dresp.status < 300) {
    // succeeds to query report status
    sresp = await getReportStatusByAid(
      env.roleName,
      ecrAid.prefix,
      roleClient,
      env.apiBaseUrl,
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
  const keeper = roleClient.manager!.get(ecrAid);
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
  //   const ecrOobi = await roleClient.oobis().get(env.roleName, "agent");
  //   console.log("Verifier must have already seen the login", ecrOobi);
  // Loop over the reports directory

  // Check signed reports
  for (const signedReport of signedReports) {
    if (fs.lstatSync(signedReport).isFile()) {
      await dropReportStatusByAid(
        env.roleName,
        ecrAid.prefix,
        roleClient,
        env.apiBaseUrl,
      );
      console.log(`Processing file: ${signedReport}`);
      const signedZipBuf = fs.readFileSync(`${signedReport}`);
      const signedZipDig = generateFileDigest(signedZipBuf);
      const signedUpResp = await uploadReport(
        env.roleName,
        ecrAid.prefix,
        signedReport,
        signedZipBuf,
        signedZipDig,
        roleClient,
        env.apiBaseUrl,
      );
      await checkSignedUpload(
        signedUpResp,
        path.basename(signedReport),
        signedZipDig,
        env.apiBaseUrl,
      );
    }
  }

  const failReports = fs.readdirSync(failDirPrefixed);

  // Check fail reports
  for (const failReport of failReports) {
    const filePath = path.join(failDirPrefixed, failReport);
    if (fs.lstatSync(filePath).isFile()) {
      await dropReportStatusByAid(
        env.roleName,
        ecrAid.prefix,
        roleClient,
        env.apiBaseUrl,
      );
      console.log(`Processing file: ${filePath}`);
      const failZipBuf = fs.readFileSync(`${filePath}`);
      const failZipDig = generateFileDigest(failZipBuf);
      const failUpResp = await uploadReport(
        env.roleName,
        ecrAid.prefix,
        failReport,
        failZipBuf,
        failZipDig,
        roleClient,
        env.apiBaseUrl,
      );
      await checkFailUpload(
        roleClient,
        failUpResp,
        failReport,
        failZipDig,
        ecrAid,
        env.apiBaseUrl,
      );
    }
  }

  // Check reports with bad digest
  for (const signedReport of signedReports) {
    const filePath = path.join(signedDirPrefixed, signedReport);
    if (fs.lstatSync(filePath).isFile()) {
      await dropReportStatusByAid(
        env.roleName,
        ecrAid.prefix,
        roleClient,
        env.apiBaseUrl,
      );
      console.log(`Processing file: ${filePath}`);
      const badDigestZipBuf = fs.readFileSync(`${filePath}`);
      const badDigestZipDig = "sha256-f5eg8fhaFybddaNOUHNU87Bdndfawf";
      const badDigestUpResp = await uploadReport(
        env.roleName,
        ecrAid.prefix,
        signedReport,
        badDigestZipBuf,
        badDigestZipDig,
        roleClient,
        env.apiBaseUrl,
      );
      await checkBadDigestUpload(badDigestUpResp);
    }
  }

  // Check reports with not prefixed digest
  for (const signedReport of signedReports) {
    const filePath = path.join(signedDirPrefixed, signedReport);
    if (fs.lstatSync(filePath).isFile()) {
      await dropReportStatusByAid(
        env.roleName,
        ecrAid.prefix,
        roleClient,
        env.apiBaseUrl,
      );
      console.log(`Processing file: ${filePath}`);
      const badDigestZipBuf = fs.readFileSync(`${filePath}`);
      const badDigestZipDig = generateFileDigest(badDigestZipBuf).substring(7);
      const badDigestUpResp = await uploadReport(
        env.roleName,
        ecrAid.prefix,
        signedReport,
        badDigestZipBuf,
        badDigestZipDig,
        roleClient,
        env.apiBaseUrl,
      );
      await checkNonPrefixedDigestUpload(badDigestUpResp);
    }
  }
}, 300000);

export async function checkSignedUpload(
  signedUpResp: Response,
  fileName: string,
  signedZipDig: string,
  baseUrl: string,
): Promise<boolean> {
  assert.equal(signedUpResp.status, 200);
  const signedUpBody = await signedUpResp.json();
  assert.equal(signedUpBody["status"], "verified");
  assert.equal(signedUpBody["submitter"], `${ecrAid.prefix}`);
  const expectedEnding = `files in report package have been signed by submitter \\(${ecrAid.prefix}\\).`;
  expect(signedUpBody["message"]).toMatch(new RegExp(`${expectedEnding}`));

  assert.equal(signedUpBody["filename"], fileName);
  assert.equal(signedUpBody["contentType"], "application/zip");
  assert.equal(signedUpBody["size"] > 1000, true);

  let sresp = await getReportStatusByDig(
    env.roleName,
    ecrAid.prefix,
    signedZipDig,
    roleClient,
    baseUrl,
  );
  assert.equal(sresp.status, 200);
  const signedUploadBody = await sresp.json();
  assert.equal(signedUploadBody["status"], "verified");
  assert.equal(signedUploadBody["submitter"], `${ecrAid.prefix}`);

  expect(signedUpBody["message"]).toMatch(new RegExp(`${expectedEnding}`));
  assert.equal(signedUploadBody["filename"], fileName);
  assert.equal(signedUploadBody["contentType"], "application/zip");
  assert.equal(signedUploadBody["size"] > 1000, true);

  // // Try unknown aid signed report upload
  // const unknownFileName = `report.zip`;
  // const unknownZipBuf = fs.readFileSync(
  //   `./test/data/unknown_reports/${unknownFileName}`,
  // );
  // const unknownZipDig = generateFileDigest(unknownZipBuf);
  // const unknownResp = await uploadReport(
  //   env.roleName,
  //   ecrAid.prefix,
  //   unknownFileName,
  //   unknownZipBuf,
  //   unknownZipDig,
  //   roleClient,
  //   env.apiBaseUrl,
  // );
  // let unknownBody = await unknownResp.json();
  // assert.equal(unknownResp.status, 200);
  // assert.equal(unknownBody["submitter"], `${ecrAid.prefix}`);
  // assert.equal(
  //   unknownBody["message"],
  //   `signature from unknown AID ${unknownPrefix}`,
  // );
  // assert.equal(unknownBody["filename"], unknownFileName);
  // assert.equal(unknownBody["status"], "failed");
  // assert.equal(unknownBody["contentType"], "application/zip");
  // assert.equal(unknownBody["size"] > 1000, true);

  // sresp = await getReportStatusByDig(
  //   env.roleName,
  //   ecrAid.prefix,
  //   unknownZipDig,
  //   roleClient,
  //   env.apiBaseUrl,
  // );
  // assert.equal(sresp.status, 200);
  // const unknownUploadBody = await sresp.json();
  // assert.equal(unknownUploadBody["submitter"], `${ecrAid.prefix}`);
  // assert.equal(
  //   unknownUploadBody["message"],
  //   `signature from unknown AID ${unknownPrefix}`,
  // );
  // assert.equal(unknownUploadBody["filename"], unknownFileName);
  // assert.equal(unknownUploadBody["status"], "failed");
  // assert.equal(unknownUploadBody["contentType"], "application/zip");
  // assert.equal(unknownUploadBody["size"] > 1000, true);

  sresp = await getReportStatusByAid(
    env.roleName,
    ecrAid.prefix,
    roleClient,
    env.apiBaseUrl,
  );
  assert.equal(sresp.status, 202);
  const twoUploadsBody = await sresp.json();
  // assert.equal(twoUploadsBody.length, 2);
  const signedStatus = twoUploadsBody[0];
  assert.equal(signedStatus["status"], "verified");
  assert.equal(signedStatus["submitter"], `${ecrAid.prefix}`);
  expect(signedUpBody["message"]).toMatch(new RegExp(`${expectedEnding}`));
  assert.equal(signedStatus["filename"], fileName);
  assert.equal(signedStatus["contentType"], "application/zip");
  assert.equal(signedStatus["size"] > 1000, true);
  // const unknownStatus = twoUploadsBody[1];
  // assert.equal(unknownStatus["submitter"], `${ecrAid.prefix}`);
  // assert.equal(unknownStatus["status"], "failed");
  // assert.equal(unknownStatus["contentType"], "application/zip");
  // assert.equal(signedUpBody["size"] > 1000, true);

  return true;
}

export function getDefaultSignedReports(): string[] {
  return fs.readdirSync(signedDirPrefixed);
}
import { strict as assert } from "assert";
import { blake3 } from "@noble/hashes/blake3";
import { createHash } from "crypto";
import FormData from "form-data";
import fs from "fs";
import JSZip from "jszip";
import * as process from "process";

import { getOrCreateClients } from "./utils/test-util";
import { generateFileDigest } from "./utils/generate-digest";
import { resolveEnvironment, TestEnvironment } from "./utils/resolve-env";
import { Diger, HabState, Siger, SignifyClient } from "signify-ts";
import path from "path";

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
});

// This test assumes you have run a vlei test that sets up the
// role identifiers and Credentials.
// It also assumes you have generated the different report files
// from the report test
test("vlei-verification", async function run() {
  let hpath = "/health";
  let hreq = { method: "GET", body: null };
  let hresp = await fetch(env.verifierBaseUrl + hpath, hreq);
  assert.equal(200, hresp.status);

  let heads = new Headers();
  heads.set("Content-Type", "application/json+cesr");
  let preq = { headers: heads, method: "PUT", body: ecrCredCesr };
  let ppath = `/presentations/${ecrCred.sad.d}`;
  let presp = await fetch(env.verifierBaseUrl + ppath, preq);
  assert.equal(presp.status, 202);

  const filingIndicatorsData =
    "templateID,reported\r\nI_01.01,true\r\nI_02.03,true\r\nI_02.04,true\r\nI_03.01,true\r\nI_05.00,true\r\nI_09.01,true\r\n"; //This is like FilingIndicators.csv

  let raw = new TextEncoder().encode(filingIndicatorsData);

  const keeper = roleClient.manager!.get(ecrAid);
  const signer = keeper.signers[0];
  const sig = signer.sign(raw);

  let params = new URLSearchParams({
    data: filingIndicatorsData,
    sig: sig.qb64,
  }).toString();
  heads = new Headers();
  heads.set("method", "POST");
  let vreqInit = { headers: heads, method: "POST", body: null };
  let vurl = `${env.verifierBaseUrl}/request/verify/${ecrAid.prefix}?${params}`;
  let vreq = await roleClient.createSignedRequest(env.roleName, vurl, vreqInit);
  let vresp = await fetch(vreq);
  assert.equal(202, vresp.status);

  heads.set("Content-Type", "application/json");
  let areqInit = { headers: heads, method: "GET", body: null };
  let aurl = `${env.verifierBaseUrl}/authorizations/${ecrAid.prefix}`;
  let areq = await roleClient.createSignedRequest(env.roleName, aurl, areqInit);
  let aresp = await fetch(areq);
  assert.equal(200, aresp.status);
  let body = await aresp.json();
  assert.equal(body["aid"], `${ecrAid.prefix}`);
  assert.equal(body["said"], `${ecrCred.sad.d}`);
}, 100000);

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
  );
  if (dresp.status < 300) {
    // succeeds to query report status
    sresp = await getReportStatusByAid(env.roleName, ecrAid.prefix, roleClient);
    assert.equal(sresp.status, 202);
    const sbody = await sresp.json();
    assert.equal(sbody.length, 0);
  } else {
    fail("Failed to drop report status");
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
  const reports = fs.readdirSync(signedDirPrefixed);
  const failReports = fs.readdirSync(failDirPrefixed);

  // Check signed reports
  for (const signedReport of reports) {
    const filePath = path.join(signedDirPrefixed, signedReport);
    if (fs.lstatSync(filePath).isFile()) {
      await dropReportStatusByAid(env.roleName, ecrAid.prefix, roleClient);
      console.log(`Processing file: ${filePath}`);
      const signedZipBuf = fs.readFileSync(`${filePath}`);
      const signedZipDig = generateFileDigest(signedZipBuf);
      const signedUpResp = await uploadReport(
        env.roleName,
        ecrAid.prefix,
        signedReport,
        signedZipBuf,
        signedZipDig,
        roleClient,
      );
      await checkSignedUpload(signedUpResp, signedReport, signedZipDig);
    }
  }

  // Check fail reports
  for (const failReport of failReports) {
    const filePath = path.join(failDirPrefixed, failReport);
    if (fs.lstatSync(filePath).isFile()) {
      await dropReportStatusByAid(env.roleName, ecrAid.prefix, roleClient);
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
      );
      await checkFailUpload(failUpResp, failReport, failZipDig);
    }
  }

  // Check reports with bad digest
  for (const signedReport of reports) {
    const filePath = path.join(signedDirPrefixed, signedReport);
    if (fs.lstatSync(filePath).isFile()) {
      await dropReportStatusByAid(env.roleName, ecrAid.prefix, roleClient);
      console.log(`Processing file: ${filePath}`);
      const badDigestZipBuf = fs.readFileSync(`${filePath}`);
      const badDigestZipDig = "sha256_f5eg8fhaFybddaNOUHNU87Bdndfawf";
      const badDigestUpResp = await uploadReport(
        env.roleName,
        ecrAid.prefix,
        signedReport,
        badDigestZipBuf,
        badDigestZipDig,
        roleClient,
      );
      await checkBadDigestUpload(badDigestUpResp);
    }
  }

  // Check reports with not prefixed digest
  for (const signedReport of reports) {
    const filePath = path.join(signedDirPrefixed, signedReport);
    if (fs.lstatSync(filePath).isFile()) {
      await dropReportStatusByAid(env.roleName, ecrAid.prefix, roleClient);
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
      );
      await checkNonPrefixedDigestUpload(badDigestUpResp);
    }
  }
}, 100000);

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

async function getReportStatusByAid(
  aidName: string,
  aidPrefix: string,
  client: SignifyClient,
): Promise<Response> {
  const heads = new Headers();
  const sreq = { headers: heads, method: "GET", body: null };
  const surl = `${env.apiBaseUrl}/status/${aidPrefix}`;
  let shreq = await client.createSignedRequest(aidName, surl, sreq);
  const sresp = await fetch(surl, shreq);
  return sresp;
}

async function getReportStatusByDig(
  aidName: string,
  aidPrefix: string,
  dig: string,
  client: SignifyClient,
): Promise<Response> {
  const heads = new Headers();
  const sreq = { headers: heads, method: "GET", body: null };
  const surl = `${env.apiBaseUrl}/upload/${aidPrefix}/${dig}`;
  let shreq = await client.createSignedRequest(aidName, surl, sreq);
  const sresp = await fetch(surl, shreq);
  return sresp;
}

async function dropReportStatusByAid(
  aidName: string,
  aidPrefix: string,
  client: SignifyClient,
): Promise<Response> {
  const heads = new Headers();
  const dreq = { headers: heads, method: "POST", body: null };
  const durl = `${env.apiBaseUrl}/status/${aidPrefix}/drop`;
  let sdreq = await client.createSignedRequest(aidName, durl, dreq);
  const sresp = await fetch(durl, sdreq);
  return sresp;
}

async function uploadReport(
  aidName: string,
  aidPrefix: string,
  fileName: string,
  zipBuffer: Buffer,
  zipDigest: string,
  client: SignifyClient,
): Promise<Response> {
  let formData = new FormData();
  let ctype = "application/zip";
  formData.append("upload", zipBuffer, {
    filename: `${fileName}`,
    contentType: `${ctype}`,
  });
  let formBuffer = formData.getBuffer();
  let req: RequestInit = {
    method: "POST",
    body: formBuffer,
    headers: {
      ...formData.getHeaders(),
      "Content-Length": formBuffer.length.toString(),
    },
  };

  const url = `${env.apiBaseUrl}/upload/${aidPrefix}/${zipDigest}`;

  let sreq = await client.createSignedRequest(aidName, url, req);
  const resp = await fetch(url, sreq);
  return resp;
}

async function checkSignedUpload(
  signedUpResp: Response,
  fileName: string,
  signedZipDig: string,
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
  );
  assert.equal(sresp.status, 200);
  const signedUploadBody = await sresp.json();
  assert.equal(signedUploadBody["status"], "verified");
  assert.equal(signedUploadBody["submitter"], `${ecrAid.prefix}`);

  expect(signedUpBody["message"]).toMatch(new RegExp(`${expectedEnding}`));
  assert.equal(signedUploadBody["filename"], fileName);
  assert.equal(signedUploadBody["contentType"], "application/zip");
  assert.equal(signedUploadBody["size"] > 1000, true);

  // Try unknown aid signed report upload
  const unknownFileName = `report.zip`;
  const unknownZipBuf = fs.readFileSync(
    `./test/data/unknown_reports/${unknownFileName}`,
  );
  const unknownZipDig = generateFileDigest(unknownZipBuf);
  const unknownResp = await uploadReport(
    env.roleName,
    ecrAid.prefix,
    unknownFileName,
    unknownZipBuf,
    unknownZipDig,
    roleClient,
  );
  let unknownBody = await unknownResp.json();
  assert.equal(unknownResp.status, 200);
  assert.equal(unknownBody["submitter"], `${ecrAid.prefix}`);
  assert.equal(
    unknownBody["message"],
    `signature from unknown AID EBcIURLpxmVwahksgrsGW6_dUw0zBhyEHYFk17eWrZfk`,
  );
  assert.equal(unknownBody["filename"], unknownFileName);
  assert.equal(unknownBody["status"], "failed");
  assert.equal(unknownBody["contentType"], "application/zip");
  assert.equal(unknownBody["size"] > 1000, true);

  sresp = await getReportStatusByDig(
    env.roleName,
    ecrAid.prefix,
    unknownZipDig,
    roleClient,
  );
  assert.equal(sresp.status, 200);
  const unknownUploadBody = await sresp.json();
  assert.equal(unknownUploadBody["submitter"], `${ecrAid.prefix}`);
  assert.equal(
    unknownUploadBody["message"],
    `signature from unknown AID EBcIURLpxmVwahksgrsGW6_dUw0zBhyEHYFk17eWrZfk`,
  );
  assert.equal(unknownUploadBody["filename"], unknownFileName);
  assert.equal(unknownUploadBody["status"], "failed");
  assert.equal(unknownUploadBody["contentType"], "application/zip");
  assert.equal(unknownUploadBody["size"] > 1000, true);

  sresp = await getReportStatusByAid(env.roleName, ecrAid.prefix, roleClient);
  assert.equal(sresp.status, 202);
  const twoUploadsBody = await sresp.json();
  assert.equal(twoUploadsBody.length, 2);
  const signedStatus = twoUploadsBody[0];
  assert.equal(signedStatus["status"], "verified");
  assert.equal(signedStatus["submitter"], `${ecrAid.prefix}`);
  expect(signedUpBody["message"]).toMatch(new RegExp(`${expectedEnding}`));
  assert.equal(signedStatus["filename"], fileName);
  assert.equal(signedStatus["contentType"], "application/zip");
  assert.equal(signedStatus["size"] > 1000, true);
  const unknownStatus = twoUploadsBody[1];
  assert.equal(unknownStatus["submitter"], `${ecrAid.prefix}`);
  assert.equal(
    unknownStatus["message"],
    `signature from unknown AID EBcIURLpxmVwahksgrsGW6_dUw0zBhyEHYFk17eWrZfk`,
  );
  assert.equal(unknownStatus["filename"], unknownFileName);
  assert.equal(unknownStatus["status"], "failed");
  assert.equal(unknownStatus["contentType"], "application/zip");
  assert.equal(signedUpBody["size"] > 1000, true);

  return true;
}

async function checkFailUpload(
  failUpResp: Response,
  fileName: string,
  failZipDig: string,
): Promise<boolean> {
  let failMessage = "";
  if (fileName.includes("genMissingSignature")) {
    failMessage = "files from report package missing valid signed";
  } else if (fileName.includes("genNoSignature")) {
    failMessage = "files from report package missing valid signed";
  } else if (fileName.includes("removeMetaInfReportsJson")) {
    // failMessage = "No manifest in file, invalid signed report package";
    assert.equal(failUpResp.status, 500);
    const failUpBody = await failUpResp.json();
    return true;
  }

  assert.equal(failUpResp.status, 200);
  const failUpBody = await failUpResp.json();
  assert.equal(failUpBody["status"], "failed");
  assert.equal(failUpBody["submitter"], `${ecrAid.prefix}`);
  expect(failUpBody["message"]).toMatch(new RegExp(`${failMessage}`));
  assert.equal(failUpBody["contentType"], "application/zip");
  assert.equal(failUpBody["size"] > 1000, true);

  const sresp = await getReportStatusByDig(
    env.roleName,
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

async function checkBadDigestUpload(
  badDigestUpResp: Response,
): Promise<boolean> {
  assert.equal(badDigestUpResp.status, 400);
  const badDigestUpBody = await badDigestUpResp.json();
  assert.equal(badDigestUpBody, "Report digest verification failed");

  return true;
}

async function checkNonPrefixedDigestUpload(
  badDigestUpResp: Response,
): Promise<boolean> {
  assert.equal(badDigestUpResp.status, 400);
  const badDigestUpBody = await badDigestUpResp.json();
  assert.equal(badDigestUpBody.includes("must start with prefix"), true);

  return true;
}

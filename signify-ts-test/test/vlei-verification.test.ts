import { strict as assert } from "assert";
import { blake3 } from "@noble/hashes/blake3";
import { createHash } from "crypto";
import FormData from "form-data";
import fs from "fs";
import JSZip from "jszip";
import * as process from "process";

import { getOrCreateClients } from "./utils/test-util";
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
  //   process.env.REG_PILOT_API = "http://127.0.0.1:8000";
  //   process.env.VLEI_VERIFIER = "http://127.0.0.1:7676";
  //   process.env.SIGNIFY_SECRETS="CbII3tno87wn3uGBP12qm"
  //   process.env.SIGNIFY_SECRETS = "A7DKYPya4oi6uDnvBmjjp";
  //   process.env.ROLE_NAME = "unicredit-datasubmitter";
  //   process.env.TEST_ENVIRONMENT = "nordlei_dev";
  //   process.env.KERIA="https://errp.wallet.vlei.io";
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
      // cred.sad.a.LEI === "549300TRUWO2CD2G5692"
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
  //   assert.equal(ecrCreds.length, 1);
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

  dropReportStatusByAid(ecrAid.prefix);
  // succeeds to query report status
  sresp = await getReportStatusByAid(env.roleName, ecrAid.prefix, roleClient);
  assert.equal(sresp.status, 202);
  const sbody = await sresp.json();
  assert.equal(sbody.length, 0);

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

  for (const signedReport of reports) {
    const filePath = path.join(signedDirPrefixed, signedReport);
    if (fs.lstatSync(filePath).isFile()) {
      console.log(`Processing file: ${filePath}`);
      const signedZipBuf = fs.readFileSync(`${filePath}`);
      const signedZipDig = getFileDigest(signedZipBuf);
      const signedUpResp = await uploadReport(
        env.roleName,
        ecrAid.prefix,
        signedReport,
        signedZipBuf,
        signedZipDig,
        roleClient,
      );
      assert.equal(signedUpResp.status, 200);
      const signedUpBody = await signedUpResp.json();
      assert.equal(signedUpBody["status"], "verified");
      assert.equal(signedUpBody["submitter"], `${ecrAid.prefix}`);
      assert.equal(
        signedUpBody["message"],
        `All 9 files in report package have been signed by submitter (${ecrAid.prefix}).`,
      );
      assert.equal(signedUpBody["filename"], signedReport);
      assert.equal(signedUpBody["contentType"], "application/zip");
      assert.equal(signedUpBody["size"] > 3000, true);

      sresp = await getReportStatusByDig(
        env.roleName,
        ecrAid.prefix,
        signedZipDig,
        roleClient,
      );
      assert.equal(sresp.status, 200);
      const signedUploadBody = await sresp.json();
      assert.equal(signedUploadBody["status"], "verified");
      assert.equal(signedUploadBody["submitter"], `${ecrAid.prefix}`);
      assert.equal(
        signedUploadBody["message"],
        `All 9 files in report package have been signed by submitter (${ecrAid.prefix}).`,
      );
      assert.equal(signedUploadBody["filename"], signedReport);
      assert.equal(signedUploadBody["contentType"], "application/zip");
      assert.equal(signedUploadBody["size"] > 3000, true);

      // Try unknown aid signed report upload
      const unknownFileName = `report.zip`;
      const unknownZipBuf = fs.readFileSync(
        `./test/data/unknown_reports/${unknownFileName}`,
      );
      const unknownZipDig = getFileDigest(unknownZipBuf);
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
      assert.equal(unknownBody["size"] > 3000, true);

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
      assert.equal(unknownUploadBody["size"] > 3000, true);

      sresp = await getReportStatusByAid(
        env.roleName,
        ecrAid.prefix,
        roleClient,
      );
      assert.equal(sresp.status, 202);
      const twoUploadsBody = await sresp.json();
      assert.equal(twoUploadsBody.length, 2);
      const signedStatus = twoUploadsBody[0];
      assert.equal(signedStatus["status"], "verified");
      assert.equal(signedStatus["submitter"], `${ecrAid.prefix}`);
      assert.equal(
        signedStatus["message"],
        `All 9 files in report package have been signed by submitter (${ecrAid.prefix}).`,
      );
      assert.equal(signedStatus["filename"], signedReport);
      assert.equal(signedStatus["contentType"], "application/zip");
      assert.equal(signedStatus["size"] > 3000, true);
      const unknownStatus = twoUploadsBody[1];
      assert.equal(unknownStatus["submitter"], `${ecrAid.prefix}`);
      assert.equal(
        unknownStatus["message"],
        `signature from unknown AID EBcIURLpxmVwahksgrsGW6_dUw0zBhyEHYFk17eWrZfk`,
      );
      assert.equal(unknownStatus["filename"], unknownFileName);
      assert.equal(unknownStatus["status"], "failed");
      assert.equal(unknownStatus["contentType"], "application/zip");
      assert.equal(signedUpBody["size"] > 3000, true);

      return true;
    }
    throw new Error(
      "No signed reports found in the directory " + signedDirPrefixed,
    );
  }
  throw new Error("No signed reports for " + ecrAid.prefix);
}, 1000000);

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

async function dropReportStatusByAid(aidPrefix: string): Promise<Response> {
  const heads = new Headers();
  const sreq = { headers: heads, method: "POST", body: null };
  const surl = `${env.apiBaseUrl}/status/${aidPrefix}/drop`;
  const sresp = await fetch(surl, sreq);
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

  const url = `${env.apiBaseUrl}/upload/${aidPrefix}/${zipDigest}`; //TODO fix digest, should be zip digest? other test was using ecr digest

  let sreq = await client.createSignedRequest(aidName, url, req);
  const resp = await fetch(url, sreq);
  return resp;
}

function getFileDigest(buffer: Buffer): string {
  const digest = Buffer.from(
    blake3.create({ dkLen: 32 }).update(buffer).digest(),
  );

  const diger = new Diger({ raw: digest });
  return diger.qb64;
}

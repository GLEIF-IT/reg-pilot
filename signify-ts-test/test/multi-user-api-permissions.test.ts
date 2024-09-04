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
let users: Array<User> = [];
const signedDir = "signed_reports";
let signedDirPrefixed: string;
let user1: User;
let user2: User;
let user3: User;

afterEach(async () => {});

beforeAll(async () => {
  env = resolveEnvironment();
  const multiSecrets = env.secrets;
  for (const secrets of multiSecrets) {
    const secretsArr = secrets.split(",");
    console.log("SECRETS!!!!:");
    console.log(secretsArr);
    const clients = await getOrCreateClients(
      secretsArr.length,
      secretsArr,
      true,
    );
    roleClient = clients.pop()!;
    let user: User = {
      ecrAid: null,
      ecrCred: null,
      ecrCredCesr: {},
      roleClient: null,
      lei: "",
      uploadDig: "",
    };
    user.roleClient = roleClient;
    ecrAid = await roleClient.identifiers().get(env.roleName);
    user.ecrAid = ecrAid;
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
    user.ecrCred = ecrCred;
    ecrCredHolder = await getGrantedCredential(roleClient, ecrCred.sad.d);
    assert(ecrCred !== undefined);
    assert.equal(ecrCredHolder.sad.d, ecrCred.sad.d);
    assert.equal(ecrCredHolder.sad.s, ECR_SCHEMA_SAID);
    assert.equal(ecrCredHolder.status.s, "0");
    assert(ecrCredHolder.atc !== undefined);
    ecrCredCesr = await roleClient.credentials().get(ecrCred.sad.d, true);
    user.ecrCredCesr = ecrCredCesr;
    user.lei = ecrCred.sad.a.LEI;
    users.push(user);
  }
  assert.equal(users.length, 3);
  if (users[0].lei == users[1].lei) {
    user1 = users[0];
    user2 = users[1];
    user3 = users[2];
  } else if (users[0].lei == users[2].lei) {
    user1 = users[0];
    user2 = users[2];
    user3 = users[1];
  } else {
    user1 = users[1];
    user2 = users[2];
    user3 = users[0];
  }
});

// This test assumes you have run a vlei test that sets up the
// role identifiers and Credentials.
// It also assumes you have generated the different report files
// from the report test
test("reg-pilot-api", async function run() {
  for (const user of users) {
    signedDirPrefixed = path.join(
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
    let sresp = await getReportStatusByAid(
      env.roleName,
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

    dropReportStatusByAid(ecrAid.prefix);
    // succeeds to query report status
    sresp = await getReportStatusByAid(
      env.roleName,
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

    const reports = fs.readdirSync(signedDirPrefixed);

    // Check signed reports
    for (const signedReport of reports) {
      const filePath = path.join(signedDirPrefixed, signedReport);
      if (fs.lstatSync(filePath).isFile()) {
        dropReportStatusByAid(user.ecrAid.prefix);
        console.log(`Processing file: ${filePath}`);
        const signedZipBuf = fs.readFileSync(`${filePath}`);
        const signedZipDig = generateFileDigest(signedZipBuf);
        const signedUpResp = await uploadReport(
          env.roleName,
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
  let sresp = await getReportStatusByAid(
    env.roleName,
    user1.ecrAid.prefix,
    user1.roleClient,
  );
  assert.equal(sresp.status, 202);
  let sbody = await sresp.json();
  assert.equal(sbody.length, 1);

  // check upload by aid from different lei
  sresp = await getReportStatusByAid(
    env.roleName,
    user3.ecrAid.prefix,
    user1.roleClient,
  );
  assert.equal(sresp.status, 401);

  // check upload by dig from different lei
  sresp = await getReportStatusByDig(
    env.roleName,
    user3.ecrAid.prefix,
    user3.uploadDig,
    user1.roleClient,
  );
  assert.equal(sresp.status, 401);

  // check upload by dig from the same lei
  sresp = await getReportStatusByDig(
    env.roleName,
    user1.ecrAid.prefix,
    user2.uploadDig,
    user1.roleClient,
  );
  assert.equal(sresp.status, 200);

  // check LEI upload statuses by aid
  sresp = await getLeiReportStatusesByAid(
    env.roleName,
    user1.ecrAid.prefix,
    user1.roleClient,
  );
  assert.equal(sresp.status, 202);
  sbody = await sresp.json();
  assert.equal(sbody.length, 2);
}, 200000);

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

async function getLeiReportStatusesByAid(
  aidName: string,
  aidPrefix: string,
  client: SignifyClient,
): Promise<Response> {
  const heads = new Headers();
  const sreq = { headers: heads, method: "GET", body: null };
  const surl = `${env.apiBaseUrl}/report/status/lei/${aidPrefix}`;
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

  const url = `${env.apiBaseUrl}/upload/${aidPrefix}/${zipDigest}`;

  let sreq = await client.createSignedRequest(aidName, url, req);
  const resp = await fetch(url, sreq);
  return resp;
}

async function checkSignedUpload(
  signedUpResp: Response,
  fileName: string,
  signedZipDig: string,
  user: User,
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

  let sresp = await getReportStatusByDig(
    env.roleName,
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
  return true;
}

interface User {
  roleClient: any;
  ecrAid: any;
  ecrCred: any;
  ecrCredCesr: any;
  lei: string;
  uploadDig: string;
}

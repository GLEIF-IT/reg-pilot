import { strict as assert } from "assert";

import { getGrantedCredential, getOrCreateClients } from "./utils/test-util";
import { resolveEnvironment, TestEnvironment } from "./utils/resolve-env";
import { HabState, SignifyClient } from "signify-ts";
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
import { strict as assert } from "assert";
import { resolveEnvironment, TestEnvironment } from "./utils/resolve-env";
import { HabState, SignifyClient } from "signify-ts";
import fs from "fs";
import path from "path";
import {
  ApiUser,
  getApiTestData,
  getConfig,
  isEbaDataSubmitter,
} from "./utils/test-data";
import { buildUserData } from "../src/utils/handle-json-config";
import { ApiAdapter } from "../src/api-adapter";

const secretsJsonPath = "../src/config/";
const ECR_SCHEMA_SAID = "EEy9PkikFcANV1l7EHukCeXqrzT1hNZjGlUk7wuMO5jw";

let env: TestEnvironment;
let apiAdapter: ApiAdapter;

afterEach(async () => {});

beforeAll(async () => {
  env = resolveEnvironment();
  apiAdapter = new ApiAdapter(env.apiBaseUrl, env.filerBaseUrl);
});

// This test assumes you have run a vlei test that sets up the
// role identifiers and Credentials.
// It also assumes you have generated the different report files
// from the report test
if (require.main === module) {
  test("vlei-verification", async function run() {
    const configFilePath = env.configuration;
    const configJson = await getConfig(configFilePath, false);
    let users = await buildUserData(configJson);
    users = users.filter((user) => user.type === "ECR");
    const apiUsers = await getApiTestData(
      configJson,
      env,
      users.map((user) => user.identifiers[0].name),
    );
    await run_vlei_verification_test(apiUsers, configJson);
  }, 100000);
}
export async function run_vlei_verification_test(
  users: ApiUser[],
  configJson: any,
) {
  await apiAdapter.addRootOfTrust(configJson);
  for (const user of users) {
    await vlei_verification(user);
  }
}

module.exports = { run_vlei_verification_test };

async function vlei_verification(user: ApiUser) {
  try {
    let hpath = "/health";
    let hreq = { method: "GET", body: null };
    let hresp = await fetch(env.verifierBaseUrl + hpath, hreq);
    assert.equal(200, hresp.status);

    // login with the ecr credential
    let ecrCred;
    let ecrLei;
    let ecrCredCesr;
    for (let i = 0; i < user.creds.length; i++) {
      if (isEbaDataSubmitter(user.creds[i]["cred"], user.ecrAid.prefix)) {
        ecrCred = user.creds[i]["cred"];
        ecrLei = ecrCred.sad.a.LEI;
        ecrCredCesr = user.creds[i]["credCesr"];
      }
    }

    let heads = new Headers();
    heads.set("Content-Type", "application/json+cesr");
    let preq = { headers: heads, method: "PUT", body: ecrCredCesr };
    let ppath = `/presentations/${ecrCred.sad.d}`;
    let presp = await fetch(env.verifierBaseUrl + ppath, preq);
    assert.equal(presp.status, 202);

    const filingIndicatorsData =
      "templateID,reported\r\nI_01.01,true\r\nI_02.03,true\r\nI_02.04,true\r\nI_03.01,true\r\nI_05.00,true\r\nI_09.01,true\r\n";

    let raw = new TextEncoder().encode(filingIndicatorsData);
    const keeper = await user.roleClient.manager!.get(user.ecrAid);
    const signer = await keeper.signers[0];
    const sig = await signer.sign(raw);

    let params = new URLSearchParams({
      data: filingIndicatorsData,
      sig: sig.qb64,
    }).toString();

    heads = new Headers();
    heads.set("method", "POST");

    let vurl = `${env.verifierBaseUrl}/request/verify/${user.ecrAid.prefix}?${params}`;
    let vreq = await user.roleClient.createSignedRequest(user.idAlias, vurl, {
      headers: heads,
      method: "POST",
      body: null,
    });
    let vresp = await fetch(vreq);
    assert.equal(202, vresp.status);

    heads.set("Content-Type", "application/json");
    let aurl = `${env.verifierBaseUrl}/authorizations/${user.ecrAid.prefix}`;
    let aresp = await user.roleClient.createSignedRequest(user.idAlias, aurl, {
      headers: heads,
      method: "GET",
      body: null,
    });
    let authResp = await fetch(aresp);
    assert.equal(200, authResp.status);
    let body = await authResp.json();

    assert.equal(body["aid"], `${user.ecrAid.prefix}`);
    assert.equal(body["said"], `${ecrCred.sad.d}`);
  } catch (error) {
    console.error("Verification failed:", error);
    throw error;
  }
}

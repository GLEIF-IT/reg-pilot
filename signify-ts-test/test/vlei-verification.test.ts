import { strict as assert } from 'assert';
import { createHash } from 'crypto';
import FormData from 'form-data';
import fs from 'fs';
import JSZip from 'jszip';
import * as process from 'process';

import { getOrCreateClients } from './utils/test-util';
import { resolveEnvironment, TestEnvironment } from './utils/resolve-env';
import { Siger,SignifyClient } from 'signify-ts';

const ECR_SCHEMA_SAID = 'EEy9PkikFcANV1l7EHukCeXqrzT1hNZjGlUk7wuMO5jw';

let env: TestEnvironment;
let roleClient: SignifyClient;

beforeAll(async () => {
    env = resolveEnvironment();

    const [roleClientInstance] = await getOrCreateClients(
        env.secrets.length,
        env.secrets,
      );
      roleClient = roleClientInstance;
});

// This test assumes you have run a vlei test that sets up the 
// role identifiers and Credentials.
// It also assumes you have generated the different report files
// from the report test
test('vlei-verification', async function run() {

    let hpath = '/health';
    let hreq = { method: 'GET', body: null };
    let hresp = await fetch(env.verifierBaseUrl + hpath, hreq);
    assert.equal(200, hresp.status);

    let ecrCreds = await roleClient.credentials().list();
    let ecrCred = ecrCreds.find(
        (cred: any) => cred.sad.s === ECR_SCHEMA_SAID
    );
    let ecrCredHolder = await getGrantedCredential(
        roleClient,
        ecrCred.sad.d
    );
    assert(ecrCred !== undefined);
    assert.equal(ecrCredHolder.sad.d, ecrCred.sad.d);
    assert.equal(ecrCredHolder.sad.s, ECR_SCHEMA_SAID);
    assert.equal(ecrCredHolder.status.s, '0');
    assert(ecrCredHolder.atc !== undefined);
    let ecrCredCesr = await roleClient
        .credentials()
        .get(ecrCred.sad.d, true);

    let heads = new Headers();
    heads.set('Content-Type', 'application/json+cesr');
    let preq = { headers: heads, method: 'PUT', body: ecrCredCesr };
    let ppath = `/presentations/${ecrCred.sad.d}`;
    let presp = await fetch(env.verifierBaseUrl + ppath, preq);
    assert.equal(presp.status, 202);

    const filingIndicatorsData = "templateID,reported\r\nI_01.01,true\r\nI_02.03,true\r\nI_02.04,true\r\nI_03.01,true\r\nI_05.00,true\r\nI_09.01,true\r\n" //This is like FilingIndicators.csv
    
    let raw = new TextEncoder().encode(filingIndicatorsData);
    let ecrAid = await roleClient.identifiers().get(env.roleName);

    const keeper = roleClient.manager!.get(ecrAid);
    const signer = keeper.signers[0];
    const sig = signer.sign(raw);

    let params = new URLSearchParams({
        data: filingIndicatorsData,
        sig: sig.qb64,
    }).toString();
    heads = new Headers();
    heads.set('method', 'POST');
    let vreqInit = { headers: heads, method: 'POST', body: null };
    let vurl = `${env.verifierBaseUrl}/request/verify/${ecrAid.prefix}?${params}`;
    let vreq = await roleClient.createSignedRequest(
        env.roleName,
        vurl,
        vreqInit
    );
    let vresp = await fetch(vreq);
    assert.equal(202, vresp.status);

    heads.set('Content-Type', 'application/json');
    let areqInit = { headers: heads, method: 'GET', body: null };
    let aurl = `${env.verifierBaseUrl}/authorizations/${ecrAid.prefix}`;
    let areq = await roleClient.createSignedRequest(
        env.roleName,
        aurl,
        areqInit
    );
    let aresp = await fetch(areq);
    assert.equal(200, aresp.status);
    let body = await aresp.json();
    assert.equal(body['aid'], `${ecrAid.prefix}`);
    assert.equal(body['said'], `${ecrCred.sad.d}`);

}, 100000);

test('reg-pilot-api', async function run() {
    // try to ping the api
    let ppath = '/ping';
    let preq = { method: 'GET', body: null };
    let presp = await fetch(env.apiBaseUrl + ppath, preq);
    console.log('ping response', presp);
    assert.equal(presp.status, 200);

    // retrieve the credentials from the KERIA test data
    let ecrCreds = await roleClient.credentials().list();
    let ecrCred = ecrCreds.find(
        (cred: any) => cred.sad.s === ECR_SCHEMA_SAID
    );
    let ecrCredHolder = await getGrantedCredential(
        roleClient,
        ecrCred.sad.d
    );
    assert(ecrCred !== undefined);
    assert.equal(ecrCredHolder.sad.d, ecrCred.sad.d);
    assert.equal(ecrCredHolder.sad.s, ECR_SCHEMA_SAID);
    assert.equal(ecrCredHolder.status.s, '0');
    assert(ecrCredHolder.atc !== undefined);
    let ecrCredCesr = await roleClient
        .credentials()
        .get(ecrCred.sad.d, true);

    let ecrAid = await roleClient.identifiers().get(env.roleName);

    // fails to query report status because not logged in with ecr yet
    let sresp = await getReportStatus(env.roleName, ecrAid.prefix, roleClient)

    // login with the ecr credential
    let heads = new Headers();
    heads.set('Content-Type', 'application/json');
    let lbody = {
        vlei: ecrCredCesr,
        said: ecrCred.sad.d,
    };
    let lreq = {
        headers: heads,
        method: 'POST',
        body: JSON.stringify(lbody),
    };
    
    let lpath = `/login`;
    let lresp = await fetch(env.apiBaseUrl + lpath, lreq);
    console.log('login response', lresp);
    assert.equal(lresp.status, 202);

    heads = new Headers();
    heads.set('Content-Type', 'application/json');
    let creq = { headers: heads, method: 'GET', body: null };
    let cpath = `/checklogin/${ecrAid.prefix}`;
    let cresp = await fetch(env.apiBaseUrl + cpath, creq);
    assert.equal(cresp.status, 200);
    let cbody = await cresp.json();
    assert.equal(cbody['aid'], `${ecrAid.prefix}`);
    assert.equal(cbody['msg'],'AID presented valid credential');
    assert.equal(cbody['said'],ecrCred.sad.d);

    // try to get status without signed headers provided
    heads = new Headers();
    let sreq = { headers: heads, method: 'GET', body: null };
    let spath = `/status/${ecrAid.prefix}`;
    sresp = await fetch(env.apiBaseUrl + spath, sreq);
    assert.equal(sresp.status, 422); // no signed headers provided

    // succeeds to query report status
    sresp = await getReportStatus(env.roleName, ecrAid.prefix, roleClient)
    assert.equal(sresp.status, 202);
    let sbody = await sresp.json();
    if (sbody.length == 0) {
        console.log("No reports uploaded yet");
    } else {
        console.warn("Likely you have failed uploads, skipping test case");
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
    const ecrOobi = await roleClient.oobis().get(env.roleName, 'agent');
    console.log("Verifier must have already seen the login", ecrOobi);
    const signedFileName = `signed__FR_IF010200_IFCLASS3_2023-12-31_20230222134210000.zip`;
    const signedZipBuf = fs.readFileSync(`./test/data/signed_reports/${signedFileName}`);
    const signedUpResp =  await uploadReport(env.roleName, ecrAid.prefix, signedFileName, signedZipBuf, ecrCred.sad.d, roleClient) //TODO fix digest, should be zip digest? other test was using ecr digest
    assert.equal(signedUpResp.status, 200);
    const signedUpBody = await signedUpResp.json();
    assert.equal(signedUpBody['status'], 'verified');
    assert.equal(signedUpBody['submitter'], `${ecrAid.prefix}`);
    assert.equal(signedUpBody['message'], "All 9 files in report package have been signed by submitter (EOrwKACnr9y8E84xWmzfD7hka5joeKBu19IOW_xyJ50h).");
    assert.equal(signedUpBody['filename'], signedFileName);
    assert.equal(signedUpBody['contentType'], "application/zip");
    assert.equal(signedUpBody['size'], 5688);

    // Try unknown aid signed report upload
    const unknownFileName = `report.zip`;
    const unknownZipBuf = fs.readFileSync(`./test/data/unknown_reports/${unknownFileName}`);
    const unknownResp = await uploadReport(env.roleName, ecrAid.prefix, unknownFileName, unknownZipBuf, ecrCred.sad.d, roleClient) //TODO fix digest, should be zip digest? other test was using ecr digest
    let unknownBody = await unknownResp.json();
    assert.equal(unknownResp.status, 200);
    assert.equal(unknownBody['submitter'], `${ecrAid.prefix}`);
    assert.equal(unknownBody['message'], `signature from unknown AID EBcIURLpxmVwahksgrsGW6_dUw0zBhyEHYFk17eWrZfk`);
    assert.equal(unknownBody['filename'], unknownFileName);
    assert.equal(unknownBody['status'], "failed");
    assert.equal(unknownBody['contentType'], "application/zip");
    assert.equal(unknownBody['size'], 3535);

}, 1000000);

export async function getGrantedCredential(
    client: SignifyClient,
    credId: string
): Promise<any> {
    const credentialList = await client.credentials().list({
        filter: { '-d': credId },
    });
    let credential: any;
    if (credentialList.length > 0) {
        assert.equal(credentialList.length, 1);
        credential = credentialList[0];
    }
    return credential;
}

async function getReportStatus(
    aidName: string,
    aidPrefix: string,
    client: SignifyClient
): Promise<Response> {
    const heads = new Headers();
    const sreq = { headers: heads, method: 'GET', body: null };
    const surl = `${env.apiBaseUrl}/status/${aidPrefix}`;
    let shreq = await client.createSignedRequest(aidName, surl, sreq);
    const sresp = await fetch(surl, shreq);
    return sresp;
}

async function uploadReport(
    aidName: string,
    aidPrefix: string,
    fileName: string,
    zipBuffer: Buffer,
    zipDig: string,
    client: SignifyClient
): Promise<Response> {
    let formData = new FormData();
    let ctype = "application/zip";
    formData.append('upload', zipBuffer, { filename: `${fileName}`, contentType: `${ctype}` });
    let formBuffer = formData.getBuffer();
    let req: RequestInit = {
        method: 'POST',
        body: formBuffer,
        headers: {
            ...formData.getHeaders(),
            'Content-Length': formBuffer.length.toString()
        }
    };

    const url = `${env.apiBaseUrl}/upload/${aidPrefix}/${zipDig}`; //TODO fix digest, should be zip digest? other test was using ecr digest

    let sreq = await client.createSignedRequest(aidName, url, req);
    const resp = await fetch(url, sreq);
    return resp;
}
import { strict as assert } from 'assert';
import { createHash } from 'crypto';
import FormData from 'form-data';
import fs from 'fs';
import JSZip from 'jszip';
import * as process from 'process';

import { getOrCreateClients } from './utils/test-util';
import { SignifyClient } from 'signify-ts';

const ECR_SCHEMA_SAID = 'EEy9PkikFcANV1l7EHukCeXqrzT1hNZjGlUk7wuMO5jw';

let roleClient: SignifyClient;
const roleName = "role"

let urlAPI = "not set"

beforeEach(async () => {
    const defaultSecrets = "CbII3tno87wn3uGBP12qm";
    if (!process.env.SIGNIFY_SECRETS) {
        process.env.SIGNIFY_SECRETS = defaultSecrets;
    }
    console.log('secrets', process.env.SIGNIFY_SECRETS);
    
    const defaultEnv = "docker";
    if (!process.env.TEST_ENVIRONMENT) {
        process.env.TEST_ENVIRONMENT = defaultEnv;
    }
    console.log('env', process.env.TEST_ENVIRONMENT);

    const [roleClientInstance] =
        await getOrCreateClients(1, process.env.SIGNIFY_SECRETS.split(','));
    roleClient = roleClientInstance;

    const defaultApi = "http://127.0.0.1:8000";
    if (!process.env.REG_PILOT_API) {
        process.env.REG_PILOT_API = defaultApi;
    }
    urlAPI = process.env.REG_PILOT_API
    console.log('api', urlAPI);
});

// This test assumes you have run a vlei test that sets up the 
// role identifiers and Credentials.
// It also assumes you have generated the different report files
// from the report test
test('vlei-verification', async function run() {

    let hurl = 'http://127.0.0.1:7676';
    let hpath = '/health';
    let hreq = { method: 'GET', body: null };
    let hresp = await fetch(hurl + hpath, hreq);
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
    let purl = 'http://localhost:7676';
    let ppath = `/presentations/${ecrCred.sad.d}`;
    let presp = await fetch(purl + ppath, preq);
    assert.equal(202, presp.status);

    let data = 'this is the raw data';
    let raw = new TextEncoder().encode(data);
    let ecrAid = await roleClient.identifiers().get(roleName);

    const keeper = roleClient.manager!.get(ecrAid);
    const signer = keeper.signers[0];
    const sig = signer.sign(raw);

    let params = new URLSearchParams({
        data: data,
        sig: sig.qb64,
    }).toString();
    heads = new Headers();
    heads.set('method', 'POST');
    let vreqInit = { headers: heads, method: 'POST', body: null };
    let vurl = `http://localhost:7676/request/verify/${ecrAid.prefix}?${params}`;
    let vreq = await roleClient.createSignedRequest(
        roleName,
        vurl,
        vreqInit
    );
    let vresp = await fetch(vreq);
    assert.equal(202, vresp.status);

    heads.set('Content-Type', 'application/json');
    let areqInit = { headers: heads, method: 'GET', body: null };
    let aurl = `http://localhost:7676/authorizations/${ecrAid.prefix}`;
    let areq = await roleClient.createSignedRequest(
        roleName,
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
    let presp = await fetch(urlAPI + ppath, preq);
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

    let ecrAid = await roleClient.identifiers().get(roleName);

    // fails to query report status because not logged in with ecr yet
    let sresp = await getReportStatus(roleName, ecrAid.prefix, roleClient)

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
    let lresp = await fetch(urlAPI + lpath, lreq);
    console.log('login response', lresp);
    assert.equal(lresp.status, 202);

    heads = new Headers();
    heads.set('Content-Type', 'application/json');
    let creq = { headers: heads, method: 'GET', body: null };
    let cpath = `/checklogin/${ecrAid.prefix}`;
    let cresp = await fetch(urlAPI + cpath, creq);
    assert.equal(cresp.status, 200);
    let cbody = await cresp.json();
    assert.equal(cbody['aid'], `${ecrAid.prefix}`);
    assert.equal(cbody['msg'],'AID presented valid credential');
    assert.equal(cbody['said'],ecrCred.sad.d);

    // try to get status without signed headers provided
    heads = new Headers();
    let sreq = { headers: heads, method: 'GET', body: null };
    let spath = `/status/${ecrAid.prefix}`;
    sresp = await fetch(urlAPI + spath, sreq);
    assert.equal(sresp.status, 422); // no signed headers provided

    // succeeds to query report status
    sresp = await getReportStatus(roleName, ecrAid.prefix, roleClient)
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

    // Try unknown aid signed report upload
    const unknownFileName = `report.zip`;
    const unknownZipBuf = fs.readFileSync(`./test/data/unknown_reports/${unknownFileName}`);
    const unknownResp = await uploadReport(roleName, ecrAid.prefix, unknownFileName, unknownZipBuf, ecrCred.sad.d, roleClient) //TODO fix digest, should be zip digest? other test was using ecr digest
    let unknownBody = await unknownResp.json();
    assert.equal(unknownResp.status, 200);
    assert.equal(unknownBody['submitter'], `${ecrAid.prefix}`);
    assert.equal(unknownBody['message'], `signature from unknown AID EBcIURLpxmVwahksgrsGW6_dUw0zBhyEHYFk17eWrZfk`);
    assert.equal(unknownBody['filename'], unknownFileName);
    assert.equal(unknownBody['status'], "failed");
    assert.equal(unknownBody['contentType'], "application/zip");
    assert.equal(unknownBody['size'], 3535);

    //Try known aid signed report upload
    const ecrOobi = await roleClient.oobis().get(roleName, 'agent');
    console.log("Verifier must have resolved ecr role oobi", ecrOobi);
    const signedFileName = `signed__FR_IF010200_IFCLASS3_2023-12-31_20230222134210000.zip`;
    const signedZipBuf = fs.readFileSync(`./test/data/signed_reports/${signedFileName}`);
    const signedUpResp = await uploadReport(roleName, ecrAid.prefix, signedFileName, signedZipBuf, ecrCred.sad.d, roleClient) //TODO fix digest, should be zip digest? other test was using ecr digest
    const signedUpBody = await signedUpResp.json();
    assert.equal(signedUpBody.status, 200);
    assert.equal(signedUpBody['submitter'], `${ecrAid.prefix}`);
    assert.equal(signedUpBody['message'], `Valid Signature`);
    assert.equal(signedUpBody['filename'], signedFileName);
    assert.equal(signedUpBody['status'], "success");
    assert.equal(signedUpBody['contentType'], "application/zip");
    assert.equal(signedUpBody['size'], 3535);

}, 100000);

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
    const surl = `${urlAPI}/status/${aidPrefix}`;
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

    const url = `${urlAPI}/upload/${aidPrefix}/${zipDig}`; //TODO fix digest, should be zip digest? other test was using ecr digest

    let sreq = await client.createSignedRequest(aidName, url, req);
    const resp = await fetch(url, sreq);
    return resp;
}
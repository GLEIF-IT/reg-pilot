import { strict as assert } from 'assert';
import { createHash } from 'crypto';
import FormData from 'form-data';
import fs from 'fs';
import JSZip from 'jszip';

import { getOrCreateClients } from './utils/test-setup';
import { SignifyClient } from 'signify-ts';

const ECR_SCHEMA_SAID = 'EEy9PkikFcANV1l7EHukCeXqrzT1hNZjGlUk7wuMO5jw';

// This test assumes you have run a vlei test that sets up the glief, qvi, le, and
// role identifiers and Credentials.
test('vlei-verification', async function run() {
    // these come from a previous test (ex. singlesig-vlei-issuance.test.ts)
    const bran = 'B4Zpu2GvAw8IaKnAYlkGR'; //taken from SIGNIFY_SECRETS
    const aidName = 'role';
    const [roleClient] = await getOrCreateClients(1, [bran]);

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
    let ecrAid = await roleClient.identifiers().get(aidName);

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
        aidName,
        vurl,
        vreqInit
    );
    let vresp = await fetch(vreq);
    assert.equal(202, vresp.status);

    heads.set('Content-Type', 'application/json');
    let areqInit = { headers: heads, method: 'GET', body: null };
    let aurl = `http://localhost:7676/authorizations/${ecrAid.prefix}`;
    let areq = await roleClient.createSignedRequest(
        aidName,
        aurl,
        areqInit
    );
    let aresp = await fetch(areq);
    assert.equal(200, aresp.status);
    let body = await aresp.json();
    assert.equal(body['aid'], `${ecrAid.prefix}`);
    assert.equal(body['said'], `${ecrCred.sad.d}`);

    //     heads.set("Content-Type", "application/json");
    //     reqInit = {headers: heads, method: 'POST', body: null};
    //     let data = 'this is the raw data'
    //     let raw = new TextEncoder().encode(data)
    //     let cig = hab.sign(ser=raw, indexed=False)[0]
    // assert cig.qb64 == '0BChOKVR4b5t6-cXKa3u3hpl60X1HKlSw4z1Rjjh1Q56K1WxYX9SMPqjn-rhC4VYhUcIebs3yqFv_uu0Ou2JslQL'
    //     resp = await roleClient.signedFetch(aidName, 'http://localhost:7676', `/request/verify${ecrAid.prefix}?data=data, 'sig': sig`, reqInit);
    //     assert.equal(202,resp.status)

}, 100000);

test('reg-pilot-api', async function run() {
    // these come from a previous test (ex. singlesig-vlei-issuance.test.ts)
    const bran = 'B4Zpu2GvAw8IaKnAYlkGR'; //taken from SIGNIFY_SECRETS
    const aidName = 'role';
    const [roleClient] = await getOrCreateClients(1, [bran]);

    let purl = 'http://127.0.0.1:8000';
    let ppath = '/ping';
    let preq = { method: 'GET', body: null };
    let presp = await fetch(purl + ppath, preq);
    console.log('login response', presp);
    assert.equal(presp.status, 200);

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

    let ecrAid = await roleClient.identifiers().get(aidName);

    // fails to query report status because not logged in with ecr yet
    let sresp = await getReportStatus(aidName, ecrAid.prefix, roleClient)
    // if (sresp.status == 200) {
    //     console.warn('You are already logged in with ecr, skipping non-login test case');
    // } else {
    //     assert.equal(sresp.status, 404); // if you get a 200 then you probably have already logged in
    //     let sbody = await sresp.json();
    //     assert.equal(sbody['msg'], `unknown ${ecrAid.prefix} used to sign header`);
    // }

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
    let lurl = 'http://localhost:8000';
    let lpath = `/login`;
    let lresp = await fetch(lurl + lpath, lreq);
    console.log('login response', lresp);
    assert.equal(lresp.status, 202);

    heads = new Headers();
    heads.set('Content-Type', 'application/json');
    let creq = { headers: heads, method: 'GET', body: null };
    let curl = 'http://localhost:8000';
    let cpath = `/checklogin/${ecrAid.prefix}`;
    let cresp = await fetch(curl + cpath, creq);
    assert.equal(cresp.status, 200);
    let cbody = await cresp.json();
    assert.equal(cbody['aid'], `${ecrAid.prefix}`);
    assert.equal(cbody['msg'],'AID presented valid credential');
    assert.equal(cbody['said'],ecrCred.sad.d);

    // no signed headers provided
    heads = new Headers();
    let sreq = { headers: heads, method: 'GET', body: null };
    let surl = 'http://localhost:8000';
    let spath = `/status/${ecrAid.prefix}`;
    sresp = await fetch(surl + spath, sreq);
    assert.equal(sresp.status, 422); // no signed headers provided

    // succeeds to query report status
    sresp = await getReportStatus(aidName, ecrAid.prefix, roleClient)
    assert.equal(sresp.status, 202);
    let sbody = await sresp.json();
    if (sbody.length == 0) {
        console.log("No reports uploaded yet");
    // if ('submitter' in sbody[0]) {
    //     assert.equal(sbody[0]['submitter'], `${ecrAid.prefix}`);
    //     assert.equal(sbody[0]['message'], 'No Reports Uploaded');
    //     assert.equal(sbody[0]['filename'], '');
    //     assert.equal(sbody[0]['status'], '');
    //     assert.equal(sbody[0]['contentType'], '');
    //     assert.equal(sbody[0]['size'], 0);
    } else {
        console.warn("Likely you have failed uploads, skipping test case");
    }

    // upload report
    let zip = await createEmptyZipAndCalculateDigest()
    // const exampleFile = fs.createReadStream(path.join(__dirname, "../lib/dummy.pdf"));
    let uresp = await uploadReport(aidName, ecrAid.prefix, zip.digest, zip.buffer, roleClient)
    let ubody = await uresp.json();
    assert.equal(uresp.status, 200);
    assert.equal(ubody[0]['submitter'], `${ecrAid.prefix}`);
    assert.equal(ubody[0]['message'], 'No Reports Uploaded');
    assert.equal(ubody[0]['message'], 'No Reports Uploaded');
    assert.equal(ubody[0]['filename'], '');
    assert.equal(ubody[0]['status'], '');
    assert.equal(ubody[0]['contentType'], '');
    assert.equal(ubody[0]['size'], 0);

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
    const surl = `http://localhost:8000/status/${aidPrefix}`;
    let shreq = await client.createSignedRequest(aidName, surl, sreq);
    const sresp = await fetch(surl, shreq);
    return sresp;
}

async function uploadReport(
    aidName: string,
    aidPrefix: string,
    fileDigest: string,
    fileBuffer: Buffer,
    client: SignifyClient
): Promise<Response> {
    // Create form data
    let filename = `report.zip`;
    let ctype = "application/zip"
    let unknown_report_zip = fs.readFileSync(`./data/${filename}`);
    let formData = new FormData();
    formData.append('upload', unknown_report_zip, { filename: `${filename}`, contentType: `${ctype}` });
    let formBuffer = formData.getBuffer();
    let req: RequestInit = {
        method: 'POST',
        body: formBuffer,
        headers: {
            ...formData.getHeaders(),
            'Content-Length': formBuffer.length.toString()
        }
    };

    const url = `http://localhost:8000/upload/${aidPrefix}/dig`;

    let sreq = await client.createSignedRequest(aidName, url, req);
    const resp = await fetch(url, sreq);
    return resp;
}

// Function to create an empty zip file and calculate its digest
async function createEmptyZipAndCalculateDigest() {
    // Create a new instance of JSZip
    const zip = new JSZip();

    // Generate the zip file as a buffer
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    // Calculate the digest (SHA-256) of the zip file
    const hash = createHash('sha256');
    hash.update(buffer.valueOf());
    const digest = hash.digest('hex');

    // Return the zip buffer and its digest
    return { buffer, digest };
}
import { SignifyClient } from "signify-ts";
import FormData from "form-data";
import { getOrCreateClients } from "../test/utils/test-util";
import path from 'path';

export class ApiAdapter {
  apiBaseUrl: string;
  constructor(apiBaseUrl: string) {
    this.apiBaseUrl = apiBaseUrl;
    this.apiBaseUrl = apiBaseUrl.replace("127.0.0.1", "host.docker.internal");
  }

  public async dropReportStatusByAid(
    aidName: string,
    aidPrefix: string,
    client: SignifyClient,
  ): Promise<Response> {
    const heads = new Headers();
    const dreq = { headers: heads, method: "POST", body: null };
    const durl = `${this.apiBaseUrl}/status/${aidPrefix}/drop`;
    let sdreq = await client.createSignedRequest(aidName, durl, dreq);
    const sresp = await fetch(durl, sdreq);
    return sresp;
  }

  public async getReportStatusByAid(
    aidName: string,
    aidPrefix: string,
    client: SignifyClient,
  ): Promise<Response> {
    const heads = new Headers();
    const sreq = { headers: heads, method: "GET", body: null };
    const surl = `${this.apiBaseUrl}/status/${aidPrefix}`;
    let shreq = await client.createSignedRequest(aidName, surl, sreq);
    const sresp = await fetch(surl, shreq);
    return sresp;
  }

  public async getReportStatusByDig(
    aidName: string,
    aidPrefix: string,
    dig: string,
    client: SignifyClient,
  ): Promise<Response> {
    const heads = new Headers();
    const sreq = { headers: heads, method: "GET", body: null };
    const surl = `${this.apiBaseUrl}/upload/${aidPrefix}/${dig}`;
    let shreq = await client.createSignedRequest(aidName, surl, sreq);
    const sresp = await fetch(surl, shreq);
    return sresp;
  }

  public async getLeiReportStatusesByAid(
    aidName: string,
    aidPrefix: string,
    client: SignifyClient,
  ): Promise<Response> {
    const heads = new Headers();
    const sreq = { headers: heads, method: "GET", body: null };
    const surl = `${this.apiBaseUrl}/report/status/lei/${aidPrefix}`;
    let shreq = await client.createSignedRequest(aidName, surl, sreq);
    const sresp = await fetch(surl, shreq);
    return sresp;
  }

  public async uploadReport(
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
    const url = `${this.apiBaseUrl}/upload/${aidPrefix}/${zipDigest}`;

    let sreq = await client.createSignedRequest(aidName, url, req);
    const resp = await fetch(url, sreq);
    return resp;
  }

  public async ebaUploadReport(
    aidName: string,
    aidPrefix: string,
    fileName: string,
    zipBuffer: Buffer,
    zipDigest: string,
    client: SignifyClient,
    token: string,
  ): Promise<Response> {
    let formData = new FormData();
    let ctype = "application/zip";
    formData.append("file", zipBuffer, {
      filename: `${fileName}`,
      contentType: `${ctype}`,
    });
    let formBuffer = formData.getBuffer();
    let req: RequestInit = {
      method: "POST",
      body: formBuffer,
      // headers: {
      //   ...formData.getHeaders(),
      //   "Content-Length": formBuffer.length.toString(),
      //   "errp-load-test": "74b63b0fd729",
      //   "uiversion": "1.3.10-467-FINAL-PILLAR3-trunk",
      //   "Referer": "https://errp.test.eba.europa.eu/portal/pillar3/uploadFile",
      //   "Referrer-Policy": "no-referrer-when-downgrade",
      //   // "authorization": "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImRpc3BsYXlOYW1lIjoiRGF0YSBTdWJtaXR0ZXIiLCJzQU1BY2NvdW50TmFtZSI6IkRhdGEgU3VibWl0dGVyIiwidXNlclByaW5jaXBhbE5hbWUiOiJEYXRhIFN1Ym1pdHRlciIsImRlcGFydG1lbnQiOiI1NDkzMDBUUlVXTzJDRDJHNTY5MiIsImNvIjoiTi9BIiwiYyI6Ik4vQSIsInNpZ25pZnlSZXNvdXJjZSI6IkVGRTgtS20zMmxKek9hNTFLM0lXTWNjdEpDWDhJZnU1ZjRCYVVXZGZnU2J3IiwidXNlclJvbGVzIjpbIlJPTEVfRVVDTElEX1BJTF9SUlBQT1JUQUxfQVBQQ05UWFQiXSwic2VsZWN0ZWRSb2xlIjoiUk9MRV9FVUNMSURfUElMX1JSUFBPUlRBTF9BUFBDTlRYVCJ9LCJpYXQiOjE3MzQzNjkyNzAsImV4cCI6MTczNDQxMjQ3MCwiYXVkIjoiZXVjbGlkLWF1dGhvcml6YXRpb24tc2VydmljZSIsImlzcyI6ImV1Y2xpZC1jYXBvcnRhbC1hdXRoZW50aWNhdGlvbi1zZXJ2aWNlOjEuMy4xMC00NjctRklOQUwtUElMTEFSMy10cnVuayIsInN1YiI6IkRhdGEgU3VibWl0dGVyIn0.NLnggQDduH1GA18AkCtpQ96KIyoO1IsAihfpXIEWt_ZrqlqeUOgyCIAPOlMnzsTD6Nr2kIbZ3dZQlkJt8wgi9ZTU8D1ZPyVQzStbpyvwJsF6Zo2NWspaJSCroIuXkYZ0QyISk9PbQEdQRYr9WigyymcVrlG2c7DSy6eQvoxYjxKDMmq5uDqtdkMcXp6R3m4p7eu73GOPdJJdI0XZRkQInYzPgelgUd_51DSd59m3GYnEE9xjtQaEsD_kcwiQKu5Inr_2O5qQlfwoYkt6YVPUV-KWSMKnbnFK_hLCc-ReJLl84KjStlv8_-iqXPi0_RgZKSyU8Q8w3B7WH3GHVnlPIhMfUncE6uxpcSrZ197sJFO_zc6MUTdA0cf65ZXSSKz70G9qexEJdglTLFxv6tKkHHOx7efpEGghfubqx9XqHqGeXubEtYm2fdI4Tf5P0utTeX0D75Qz4HtPppGXetqH8XC3l1FQuVYaL9YQEFjQZA2MEgqKPum4XvOmqNJglknjanrpv0uQOMgx83PV3U2IdJ17MCZHWOVMpupQ13la6Jy4m-mixLKDnp8pYapdLC9-nzsVCjr-mIOS2SJJdVvbCyQOXVrzgKmX_C0uCs-RN20ErkKhprZsD_p3TQgHahHbRPEjgMfKcDdwHtGu8G5Y7Xudmb3OYOcdct0GLiC4mwA", 
      //   "authorization": `Bearer ${token}`
      // },
      // headers: {
      //   ...formData.getHeaders(),
      //   "Content-Length": formBuffer.length.toString(),
      //   "accept": "application/json, text/plain, */*",
      //   "authorization": `Bearer ${token}`,
      //   "cache-control": "no-cache",
      //   "Accept-Encoding": "gzip, deflate, br, zstdm",
      //   // "content-type": "multipart/form-data; boundary=----WebKitFormBoundaryhOTcX4FPJxzZ8I2v",
      //   // "directory": "549300TRUWO2CD2G5692.CON",
      //   "expires": "Sat, 01 Jan 2000 00:00:00 GMT",
      //   "name": `${path.basename(fileName)}`,
      //   "pragma": "no-cache",
      //   // "sec-ch-ua": "\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"",
      //   // "sec-ch-ua-mobile": "?0",
      //   // "sec-ch-ua-platform": "\"Windows\"",
      //   // "signature": "indexed=\"?0\";signify=\"0BBn_7pl0JbFySd6QEil_X-TF7ALfHBWgDUYGcfwCkZzfMuk5PzTIO7m4rxoiMv2PLoePDOH7uDq8BVv555s83kJ\"",
      //   // "signature-input": "signify=(\"@method\" \"@path\" \"signify-resource\" \"signify-timestamp\");created=1734369276;keyid=\"BHerQd_5W7xwEf7_3hN7xFhh3xtjEmPdOlI5zunAt2cb\";alg=\"ed25519\"",
      //   // "signify-resource": "EFE8-Km32lJzOa51K3IWMcctJCX8Ifu5f4BaUWdfgSbw",
      //   // "signify-timestamp": "2024-12-16T17:14:36.052000+00:00",
      //   // "size": "1023107",
      //   "uiversion": "1.3.10-467-FINAL-PILLAR3-trunk",
      //   // "x-file-id": `${fileName}`,
      //   // "x-start-byte": "0",
      //   "Referer": "https://errp.test.eba.europa.eu/portal/pillar3/uploadFile",
      //   "Referrer-Policy": "no-referrer-when-downgrade"
      // },
      headers: {
          ...formData.getHeaders(),
        'Authorization': `Bearer ${token}`,
        'name': '237932ALYUME7DQDC2D7.CON_GR_PILLAR3010000_P3REMDISDOCS_2023-12-31_202401113083647123_signed.zip',
        'size': '155601',
        'uiversion': '1.3.10-467-FINAL-PILLAR3-trunk',
        'x-start-byte': '0'
      }
    };
    const url = `https://errp.test.eba.europa.eu/api/upload`;
    let sreq = await client.createSignedRequest(aidName, url, req);
    const sreqBod = await sreq.text();
    const resp = await fetch(url, sreq);
    const resBod = await resp.text();
    console.log(`eba upload resp: ${resBod}`);
    return resp;
  }

  public async addRootOfTrust(configJson: any): Promise<Response> {
    const rootOfTrustIdentifierName = configJson.users.filter(
      (usr: any) => usr.type == "GLEIF",
    )[0].identifiers[0];
    const rootOfTrustIdentifierAgent =
      configJson.agents[
        configJson.identifiers[rootOfTrustIdentifierName].agent
      ];
    const rootOfTrustIdentifierSecret =
      configJson.secrets[rootOfTrustIdentifierAgent.secret];
    const clients = await getOrCreateClients(
      1,
      [rootOfTrustIdentifierSecret],
      true,
    );
    const client = clients[clients.length - 1];
    const rootOfTrustAid = await client
      .identifiers()
      .get(rootOfTrustIdentifierName);

    const oobi = await client.oobis().get(rootOfTrustIdentifierName);
    let oobiUrl = oobi.oobis[0];
    const url = new URL(oobiUrl);
    // if (url.hostname === "keria")
    // oobiUrl = oobiUrl.replace("keria", "localhost");
    // console.log(`OobiUrl: ${oobiUrl}`);
    if (url.hostname === "keria")
      oobiUrl = oobiUrl.replace("keria", "host.docker.internal");
    if (process.env.KERIA_AGENT_PORT) {
      oobiUrl = oobiUrl.replace("3902", process.env.KERIA_AGENT_PORT);
    }
    // console.log(`OobiUrl: ${oobiUrl}`);
    const oobiResp = await fetch(oobiUrl);
    const oobiRespBody = await oobiResp.text();
    const heads = new Headers();
    heads.set("Content-Type", "application/json");
    let lbody = {
      vlei: oobiRespBody,
      aid: rootOfTrustAid.prefix,
    };
    let lreq = {
      headers: heads,
      method: "POST",
      body: JSON.stringify(lbody),
    };
    const lurl = `${this.apiBaseUrl}/add_root_of_trust`;
    const lresp = await fetch(lurl, lreq);
    return lresp;
  }
}
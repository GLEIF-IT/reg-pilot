import { SignifyClient } from "signify-ts";
import FormData from "form-data";
import { getOrCreateClients } from "../test/utils/test-util";
import path from "path";
import { string } from "mathjs";

export class ApiAdapter {
  apiBaseUrl: string;
  filerBaseUrl: string = "";
  constructor(apiBaseUrl: string, filerBaseUrl: string) {
    this.apiBaseUrl = apiBaseUrl;
    this.apiBaseUrl = apiBaseUrl.replace("127.0.0.1", "host.docker.internal");
    if (!filerBaseUrl || filerBaseUrl === "") {
      console.log("Filer base URL not provided. Using API base URL.");
      this.filerBaseUrl = apiBaseUrl;
    } else {
      console.log(`Filer base URL provided ${filerBaseUrl}`);
      this.filerBaseUrl = filerBaseUrl;
    }
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
    fileName: string,
    zipBuffer: Buffer,
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

      headers: {
        ...formData.getHeaders(),
        "errp-load-test": "74b63b0fd729",
        Authorization: `Bearer ${token}`,
        uiversion: "1.3.10-474-FINAL-PILLAR3-trunk",
        "sec-ch-ua-platform": "macOS",
        "sec-ch-ua":
          '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "x-file-id": `${fileName}-1734640154691`,
        "x-start-byte": "0",
        size: `${zipBuffer.length}`,
        "sec-ch-ua-mobile": "?0",
        Expires: "Sat, 01 Jan 2000 00:00:00 GMT",
        Accept: "application/json, text/plain, */*",
        // "Content-Type":"multipart/form-data; boundary=----WebKitFormBoundaryVzABPbBM8BjT0uAU",
        // signature-input:signify=("@method" "@path" "signify-resource" "signify-timestamp");created=1734638631;keyid="BFrHXYqOUZbwTZ1REvFllhJYzczzyKEZpVX0w6C5c28T";alg="ed25519"
        // 'Directory':'237932ALYUME7DQDC2D7.CON',
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        name: `${path.basename(fileName)}`,
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
        // 'host':'errp.test.eba.europa.eu'
      },
    };
    // const url = `https://errp.test.eba.europa.eu/api/upload`;
    const url = `${this.filerBaseUrl}/upload`;
    console.log(`EBA upload URL: ${url}`);
    let sreq = await client.createSignedRequest(aidName, url, req);
    // const sreqBod = await sreq.text();
    const resp = await fetch(url, sreq);
    return resp;
  }

  public hasGLEIFWithMultisig(data: any): boolean {
    return data.users.some(
      (user: any) =>
        (user.type === "GLEIF" || user.type === "GLEIF_EXTERNAL") &&
        user.identifiers.some((id: any) => data.identifiers[id]?.identifiers),
    );
  }

  public async addRootOfTrust(configJson: any): Promise<Response> {
    if (this.hasGLEIFWithMultisig(configJson)) {
      return await this.addRootOfTrustMultisig(configJson);
    } else {
      return await this.addRootOfTrustSinglesig(configJson);
    }
  }

  public async addRootOfTrustMultisig(configJson: any): Promise<Response> {
    const rootOfTrustMultisigIdentifierName = configJson.users
      .filter(
        (usr: any) => usr.type == "GLEIF" || usr.type == "GLEIF_EXTERNAL",
      )[0]
      .identifiers.filter((identifier: string) =>
        identifier.includes("multisig"),
      )![0];

    const rootOfTrustIdentifierName = configJson.users
      .filter(
        (usr: any) => usr.type == "GLEIF" || usr.type == "GLEIF_EXTERNAL",
      )[0]
      .identifiers.filter(
        (identifier: string) => !identifier.includes("multisig"),
      )![0];

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
      .get(rootOfTrustMultisigIdentifierName);

    const oobi = await client
      .oobis()
      .get(rootOfTrustMultisigIdentifierName, "agent");
    let oobiUrl = oobi.oobis[0];
    const url = new URL(oobiUrl);
    if (url.hostname === "keria")
      oobiUrl = oobiUrl.replace("keria", "localhost");
    console.log(`Root of trust OOBI: ${oobiUrl}`);
    const oobiResp = await fetch(oobiUrl);
    const oobiRespBody = await oobiResp.text();
    const heads = new Headers();
    heads.set("Content-Type", "application/json");
    let lbody = {
      vlei: oobiRespBody,
      aid: rootOfTrustAid.prefix,
      oobi: oobiUrl,
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

  public async addRootOfTrustSinglesig(configJson: any): Promise<Response> {
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
    console.log(`Root of trust OOBI: ${oobiUrl}`);
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
      oobi: oobiUrl,
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

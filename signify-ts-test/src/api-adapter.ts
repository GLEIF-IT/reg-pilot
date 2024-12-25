import { SignifyClient } from "signify-ts";
import FormData from "form-data";
import { getOrCreateClients } from "../test/utils/test-util";
import { string } from "mathjs";

export class ApiAdapter {
  apiBaseUrl: string;
  constructor(apiBaseUrl: string) {
    this.apiBaseUrl = apiBaseUrl;
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

  public hasGLEIFWithMultisig(data: any): boolean {
    return data.users.some(
      (user: any) =>
        user.type === "GLEIF" &&
        user.identifiers.some((id: any) => data.identifiers[id]?.identifiers)
    );
  }

  public async addRootOfTrust(configJson: any): Promise<Response> {    
    if(this.hasGLEIFWithMultisig(configJson)){
      return await this.addRootOfTrustMultisig(configJson);
    }
    else{
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
    console.log(`Root of trust OOBIs: ${oobiUrl}`);
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
    const url = new URL(oobiUrl);
    if (url.hostname === "keria")
      oobiUrl = oobiUrl.replace("keria", "localhost");
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

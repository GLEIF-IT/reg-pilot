import { boolean, identity } from "mathjs";
import { SignifyClient } from "signify-ts";

export async function buildUserData(jsonConfig: any): Promise<Array<User>> {
  let users: Array<User> = new Array<User>();
  const identifiers = structuredClone(jsonConfig.identifiers);
  for (const key of Object.keys(identifiers)) {
    if (identifiers[key]["agent"]) {
      identifiers[key].agent = {
        name: identifiers[key]["agent"],
        secret:
          jsonConfig.secrets[
            jsonConfig.agents[identifiers[key]["agent"]]["secret"]
          ],
      };
    }
  }
  for (const user of jsonConfig.users) {
    let curUser: User = {
      LE: user.LE,
      identifiers: user.identifiers.map((key: any) => ({
        ...identifiers[key],
      })),
      alias: user.alias,
      type: user.type,
    };
    users.push(curUser);
  }
  return users;
}

export async function buildCredentials(
  jsonConfig: any,
): Promise<Map<string, CredentialInfo>> {
  let credentials: Map<string, CredentialInfo> = new Map<
    string,
    CredentialInfo
  >();
  for (const key in jsonConfig.credentials) {
    const cred = jsonConfig.credentials[key];
    let curCred: CredentialInfo = {
      type: cred.type,
      schema: cred.schema,
      rules: cred.rules,
      privacy: cred.privacy,
      attributes: cred.attributes,
      credSource: cred.credSource,
    };
    credentials.set(key, curCred);
  }
  return credentials;
}

export async function buildAidData(jsonConfig: any): Promise<any> {
  let users: Array<User> = new Array<User>();
  const identifiers = structuredClone(jsonConfig.identifiers);
  for (const key of Object.keys(identifiers)) {
    if (identifiers[key]["agent"]) {
      identifiers[key].agent = {
        name: identifiers[key]["agent"],
        secret:
          jsonConfig.secrets[
            jsonConfig.agents[identifiers[key]["agent"]]["secret"]
          ],
      };
    }
  }
  return identifiers;
}

export interface User {
  type: string;
  LE: string;
  alias: string;
  identifiers: any;
}

export interface CredentialInfo {
  type: string;
  schema: string;
  rules?: string;
  privacy: boolean;
  attributes: any;
  credSource?: any;
}

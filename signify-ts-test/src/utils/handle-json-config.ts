import { boolean } from "mathjs";
import { SignifyClient } from "signify-ts";

export async function buildUserData(secretsJson: any): Promise<Array<User>> {
  let users: Array<User> = new Array<User>();
  for (const user of secretsJson.users) {
    let curUser: User = {
      LE: user.LE,
      secrets: new Map<string, string>(),
      aids: new Map<string, Array<any>>(),
      oobis: new Map<string, Array<any>>(),
      clients: new Map<string, Array<SignifyClient>>(),
      contextRole: user.contextRole,
      alias: user.alias,
    };
    for (const key in user.secrets) {
      if (user.secrets.hasOwnProperty(key)) {
        curUser.secrets.set(key, secretsJson.secrets[user.secrets[key]]);
      }
    }
    users.push(curUser);
  }
  return users;
}

export async function buildCredentials(
  secretsJson: any,
): Promise<Map<string, CredentialInfo>> {
  let credentials: Map<string, CredentialInfo> = new Map<
    string,
    CredentialInfo
  >();
  for (const key in secretsJson.credentials) {
    const cred = secretsJson.credentials[key];
    let curCred: CredentialInfo = {
      type: cred.type,
      issuer: cred.issuer,
      issuee: cred.issuee,
      recipient: cred.recipient,
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

export interface User {
  secrets: Map<string, string>;
  LE: string;
  clients: Map<string, Array<SignifyClient>>;
  aids: Map<string, Array<any>>;
  oobis: Map<string, Array<any>>;
  contextRole: string;
  alias: string;
}

export interface CredentialInfo {
  type: string;
  issuer: string;
  issuee: string;
  recipient?: string;
  schema: string;
  rules?: string;
  privacy: boolean;
  attributes: any;
  credSource?: any;
}

interface SecretUser {
  secrets: Map<string, string>;
  LE: string;
  contextRole: string;
}

interface SecretsJson {
  secrets: Map<string, string>;
  users: Array<SecretUser>;
  credentials: Map<string, Credential>;
  credentialParams: Map<string, string>;
}

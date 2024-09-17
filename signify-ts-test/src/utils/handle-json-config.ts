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

export interface User {
  secrets: Map<string, string>;
  LE: string;
  clients: Map<string, Array<SignifyClient>>;
  aids: Map<string, Array<any>>;
  oobis: Map<string, Array<any>>;
}

interface SecretUser {
  secrets: Map<string, string>;
  LE: string;
}

interface SecretsJson {
  secrets: Map<string, string>;
  users: Array<SecretUser>;
}

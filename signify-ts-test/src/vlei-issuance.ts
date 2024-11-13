import { strict as assert } from "assert";
import signify, {
  Saider,
  CredentialSubject,
  CredentialData,
  CreateIdentiferArgs,
  randomNonce,
  Salter,
  HabState,
  SignifyClient,
  Dict,
} from "signify-ts";
import {
  resolveOobi,
  waitOperation,
  getOrCreateAID,
  getOrCreateClients,
  getOrCreateContact,
  createTimestamp,
  getIssuedCredential,
  getReceivedCredential,
  sendGrantMessage,
  sendAdmitMessage,
  getOrIssueCredential,
  getOrCreateRegistry,
  waitForCredential,
  admitSinglesig,
  waitAndMarkNotification,
  assertOperations,
  warnNotifications,
  Aid,
  sleep,
  revokeCredential,
} from "../test/utils/test-util";
import {
  addEndRoleMultisig,
  admitMultisig,
  createAIDMultisig,
  createRegistryMultisig,
  delegateMultisig,
  grantMultisig,
  issueCredentialMultisig,
  multisigRevoke,
} from "../test/utils/multisig-utils";
import { boolean, sec } from "mathjs";
import { retry } from "../test/utils/retry";
import {
  QVI_SCHEMA_URL,
  LE_SCHEMA_URL,
  ECR_AUTH_SCHEMA_URL,
  ECR_SCHEMA_URL,
  OOR_AUTH_SCHEMA_URL,
  OOR_SCHEMA_URL,
  CRED_RETRY_DEFAULTS,
  witnessIds,
  SCHEMAS,
  RULES,
} from "./constants";

import {
  User,
  CredentialInfo,
  buildUserData,
  buildCredentials,
} from "./utils/handle-json-config";
import fs from "fs";
import path from "path";
import { buildTestData, EcrTestData } from "./utils/generate-test-data";
import { ApiUser } from "../test/utils/test-data";

export class VleiIssuance {
  configPath: string = "config/";
  configFile: string;
  configJson: any;
  users: Array<User> = new Array<User>();
  clients: Map<string, Array<SignifyClient>> = new Map<
    string,
    Array<SignifyClient>
  >();
  aids: Map<string, Array<any>> = new Map<string, Array<any>>();
  oobis: Map<string, Array<any>> = new Map<string, Array<any>>();

  credentialsInfo: Map<string, CredentialInfo> = new Map<
    string,
    CredentialInfo
  >();
  registries: Map<string, { regk: string }> = new Map<
    string,
    { regk: string }
  >();
  credentials: Map<string, any> = new Map<string, any>();
  schemas: any = SCHEMAS;
  rules: any = RULES;
  credentialData: Map<string, any> = new Map<string, any>();
  aidsInfo: Map<string, any> = new Map<string, any>();

  kargsAID =
    witnessIds.length > 0 ? { toad: witnessIds.length, wits: witnessIds } : {};

  constructor(secretsJsonFile: string) {
    this.configFile = secretsJsonFile;
    this.configJson = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, this.configPath) + secretsJsonFile,
        "utf-8",
      ),
    );
  }

  public async prepareClients() {
    this.users = await buildUserData(this.configJson);
    this.credentialsInfo = await buildCredentials(this.configJson);

    await this.createClients();
    await this.createAids();
    await this.fetchOobis();
    await this.createContacts();
    await this.resolveOobis([
      QVI_SCHEMA_URL,
      LE_SCHEMA_URL,
      ECR_AUTH_SCHEMA_URL,
      ECR_SCHEMA_URL,
      OOR_AUTH_SCHEMA_URL,
      OOR_SCHEMA_URL,
    ]);
    await this.createMultisigAids();
  }

  // Create clients dynamically for each user
  protected async createClients() {
    console.log("Creating Clients");
    for (const user of this.users) {
      for (const identifier of user.identifiers) {
        if (!identifier.agent) continue;
        const client = await getOrCreateClients(
          1,
          [identifier.agent.secret],
          false,
        );
        if (this.clients.has(identifier.agent)) {
          this.clients.get(identifier.agent)?.push(client[0]);
        } else {
          this.clients.set(identifier.agent.name, [client[0]]);
        }
      }
    }
  }

  // Create AIDs for each client
  protected async createAids() {
    console.log("Creating AIDs");
    for (const user of this.users) {
      for (const identifier of user.identifiers) {
        let aid: any;
        if (!identifier.identifiers) {
          this.aidsInfo.set(identifier.name, identifier);
          const client = this.clients.get(identifier.agent.name)![0];
          aid = await getOrCreateAID(client, identifier.name, this.kargsAID);
          if (this.aids.has(identifier.name)) {
            this.aids.get(identifier.name)?.push(aid);
          } else {
            this.aids.set(identifier.name, [aid]);
          }
        }
      }
    }
  }

  protected async createMultisigAids() {
    console.log("Creating Multisig AIDs");
    for (const user of this.users) {
      for (const identifier of user.identifiers) {
        let aid: any;
        if (identifier.identifiers) {
          this.aidsInfo.set(identifier.name, identifier);
          aid = await this.createAidMultisig(identifier);
          if (this.aids.has(identifier.name)) {
            this.aids.get(identifier.name)?.push(aid);
          } else {
            this.aids.set(identifier.name, [aid]);
          }
        }
      }
    }
  }

  // Fetch OOBIs for each client
  protected async fetchOobis() {
    console.log("Fetching OOBIs");
    for (const user of this.users) {
      for (const identifier of user.identifiers) {
        if (!identifier.agent) continue;
        const client = this.clients.get(identifier.agent.name)![0];
        const oobi = await client.oobis().get(identifier.name, "agent");
        if (this.oobis.has(identifier.name)) {
          this.oobis.get(identifier.name)?.push(oobi);
        } else {
          this.oobis.set(identifier.name, [oobi]);
        }
      }
    }
  }

  // Create contacts between clients
  protected async createContacts() {
    console.log("Creating Contacts");
    const contactPromises: Promise<any>[] = [];
    for (const userA of this.users) {
      for (const identifierA of userA.identifiers) {
        for (const userB of this.users) {
          for (const identifierB of userB.identifiers) {
            if (!identifierA.agent || !identifierB.agent) continue;
            if (identifierA.name !== identifierB.name) {
              contactPromises.push(
                getOrCreateContact(
                  this.clients.get(identifierA.agent.name)![0],
                  identifierB.name,
                  this.oobis.get(identifierB.name)?.[0].oobis[0],
                ),
              );
            }
          }
        }
      }
    }
    await Promise.all(contactPromises);
  }

  // Resolve OOBIs for each client and schema
  protected async resolveOobis(schemaUrls: string[]) {
    console.log("Resolving OOBIs");
    const resolveOobiPromises: Promise<void>[] = [];
    for (const [role, clientList] of this.clients) {
      for (const client of clientList) {
        schemaUrls.forEach(async (schemaUrl) => {
          await resolveOobi(client, schemaUrl);
        });
      }
    }
  }

  public async createRegistries() {
    console.log("Creating Registries");
    for (const user of this.users) {
      for (const identifier of user.identifiers) {
        let registry;
        if (identifier.identifiers) {
          registry = await this.createRegistryMultisig(
            this.aids.get(identifier.name)![0],
            identifier,
          );
        } else {
          const client = this.clients.get(identifier.agent.name)![0];
          registry = await this.getOrCreateRegistry(
            client,
            this.aids.get(identifier.name)![0],
            `${user.alias}Registry`,
          );
        }

        this.registries.set(identifier.name, registry);
      }
    }
  }

  private async getOrCreateRegistry(
    client: SignifyClient,
    aid: Aid,
    registryName: string,
  ) {
    return await getOrCreateRegistry(client, aid, registryName);
  }

  public async createAidMultisig(aidInfo: any) {
    let multisigAids: HabState[] = [];
    const aidIdentifierNames: Array<string> = aidInfo.identifiers;

    let issuerAids =
      aidIdentifierNames.map(
        (aidIdentifierName) => this.aids.get(aidIdentifierName)![0],
      ) || [];

    try {
      for (const aidIdentifierName of aidIdentifierNames) {
        const client = this.clients.get(
          this.aidsInfo.get(aidIdentifierName).agent.name,
        )![0];
        multisigAids.push(await client.identifiers().get(aidInfo.name));
      }
      const multisigAid = multisigAids[0];
      console.log(`${aidInfo.name} AID: ${multisigAid.prefix}`);
      return multisigAid;
    } catch {
      multisigAids = [];
    }
    if (multisigAids.length == 0) {
      const rstates = issuerAids.map((aid) => aid.state);
      const states = rstates;

      let kargsMultisigAID: CreateIdentiferArgs = {
        algo: signify.Algos.group,
        isith: aidInfo.isith,
        nsith: aidInfo.nsith,
        toad: this.kargsAID.toad,
        wits: this.kargsAID.wits,
        states: states,
        rstates: rstates,
      };
      // if (aidInfo.delpre != null){
      //   kargsMultisigAID.delpre = this.aids.get(aidInfo.delpre)![0].prefix;
      // }
      let multisigOps: any[] = [];
      for (let index = 0; index < issuerAids.length; index++) {
        const aid = issuerAids[index];
        const kargsMultisigAIDClone = { ...kargsMultisigAID, mhab: aid };
        const otherAids = issuerAids.filter((aidTmp) => aid !== aidTmp);
        const client = this.clients.get(
          this.aidsInfo.get(aid.name).agent.name,
        )![0];

        const op = await createAIDMultisig(
          client,
          aid,
          otherAids,
          aidInfo.name,
          kargsMultisigAIDClone,
          index === 0, // Set true for the first operation
        );

        multisigOps.push(op);
      }
      // Wait for all multisig operations to complete
      for (let index = 0; index < multisigOps.length; index++) {
        const client = this.clients.get(
          this.aidsInfo.get(issuerAids[index].name).agent.name,
        )![0];
        await waitOperation(client, multisigOps[index]);
      }

      // Wait for multisig inception notifications for all clients
      await waitAndMarkNotification(
        this.clients.get(this.aidsInfo.get(issuerAids[0].name).agent.name)![0],
        "/multisig/icp",
      );
      // Retrieve the newly created AIDs for all clients
      multisigAids = await Promise.all(
        issuerAids.map(async (aid) => {
          const client = this.clients.get(
            this.aidsInfo.get(aid.name).agent.name,
          )![0];
          return await client.identifiers().get(aidInfo.name);
        }),
      );

      assert(
        multisigAids.every((aid) => aid.prefix === multisigAids[0].prefix),
      );
      assert(multisigAids.every((aid) => aid.name === multisigAids[0].name));
      const multisigAid = multisigAids[0];

      // Skip if they have already been authorized.
      let oobis: Array<any> = await Promise.all(
        issuerAids.map(async (aid) => {
          const client = this.clients.get(
            this.aidsInfo.get(aid.name).agent.name,
          )![0];
          return await client.oobis().get(multisigAid.name, "agent");
        }),
      );

      if (oobis.some((oobi) => oobi.oobis.length == 0)) {
        const timestamp = createTimestamp();

        // Add endpoint role for all clients
        const roleOps = await Promise.all(
          issuerAids.map(async (aid, index) => {
            const otherAids = issuerAids.filter((_, i) => i !== index);
            const client = this.clients.get(
              this.aidsInfo.get(aid.name).agent.name,
            )![0];
            return await addEndRoleMultisig(
              client,
              multisigAid.name,
              aid,
              otherAids,
              multisigAid,
              timestamp,
              index === 0,
            );
          }),
        );

        // Wait for all role operations to complete for each client
        for (let i = 0; i < roleOps.length; i++) {
          for (let j = 0; j < roleOps[i].length; j++) {
            const client = this.clients.get(
              this.aidsInfo.get(issuerAids[i].name).agent.name,
            )![0];
            await waitOperation(client, roleOps[i][j]);
          }
        }

        // Wait for role resolution notifications for all clients
        // await waitAndMarkNotification(this.clients.get(this.aidsInfo.get(issuerAids[0].name).agent.name)![0], "/multisig/rpy");
        await Promise.all(
          issuerAids.map((aid) => {
            const client = this.clients.get(
              this.aidsInfo.get(aid.name).agent.name,
            )![0];
            return waitAndMarkNotification(client, "/multisig/rpy");
          }),
        );

        // Retrieve the OOBI again after the operation for all clients
        oobis = await Promise.all(
          issuerAids.map(async (aid) => {
            const client = this.clients.get(
              this.aidsInfo.get(aid.name).agent.name,
            )![0];
            return await client.oobis().get(multisigAid.name, "agent");
          }),
        );
      }

      // Ensure that all OOBIs are consistent across all clients
      assert(oobis.every((oobi) => oobi.role === oobis[0].role));
      assert(oobis.every((oobi) => oobi.oobis[0] === oobis[0].oobis[0]));

      const oobi = oobis[0].oobis[0].split("/agent/")[0];
      const clients = Array.from(this.clients.values()).flat();

      await Promise.all(
        clients.map(
          async (client) =>
            await getOrCreateContact(client, multisigAid.name, oobi),
        ),
      );
      console.log(`${aidInfo.name} AID: ${multisigAid.prefix}`);
      return multisigAid;
    }
  }

  public async createRegistryMultisig(multisigAid: HabState, aidInfo: any) {
    const registryIdentifierName = `${aidInfo.name}Registry`;
    const aidIdentifierNames: Array<string> = aidInfo.identifiers;
    let registries: Array<any> = new Array<any>();
    let issuerAids =
      aidIdentifierNames.map(
        (aidIdentifierName) => this.aids.get(aidIdentifierName)![0],
      ) || [];
    // Check if the registries already exist
    for (const aidIdentifierName of aidIdentifierNames) {
      const client = this.clients.get(
        this.aidsInfo.get(aidIdentifierName).agent.name,
      )![0];
      let tmpRegistry = await client.registries().list(multisigAid.name);
      tmpRegistry = tmpRegistry.filter(
        (reg: { name: string }) => reg.name == `${aidInfo.name}Registry`,
      );
      registries.push(tmpRegistry);
    }

    // Check if registries exist
    const allEmpty = registries.every((registry) => registry.length === 0);

    if (allEmpty) {
      const nonce = randomNonce();
      const registryOps = issuerAids!.map((aid, index) => {
        const otherAids = issuerAids!.filter((_, i) => i !== index);
        const client = this.clients.get(
          this.aidsInfo.get(aid.name).agent.name,
        )![0];
        return createRegistryMultisig(
          client,
          aid,
          otherAids,
          multisigAid,
          registryIdentifierName,
          nonce,
          index === 0, // Use true for the first operation, false for others
        );
      });

      // Await all registry creation operations
      const createdOps = await Promise.all(registryOps);

      // Wait for all operations to complete across multiple clients
      await Promise.all(
        createdOps.map(async (op, index) => {
          const client = this.clients.get(
            this.aidsInfo.get(issuerAids![index].name).agent.name,
          )![0];
          return await waitOperation(client, op);
        }),
      );

      // Wait for multisig inception notification for each client
      await waitAndMarkNotification(
        this.clients.get(this.aidsInfo.get(issuerAids[0].name).agent.name)![0],
        "/multisig/vcp",
      );

      // Recheck the registries for each client
      const updatedRegistries = await Promise.all(
        issuerAids.map((aid) => {
          const client = this.clients.get(
            this.aidsInfo.get(aid.name).agent.name,
          )![0];
          return client.registries().list(multisigAid.name);
        }),
      );

      // Update the `registries` array with the new values
      registries.splice(0, registries.length, ...updatedRegistries);

      // Ensure that all registries match the first one
      const firstRegistry = registries[0][0];
      registries.forEach((registry) => {
        assert.equal(registry[0].regk, firstRegistry.regk);
        assert.equal(registry[0].name, firstRegistry.name);
      });

      // Save the first registry and return it
      this.registries.set(multisigAid.name, firstRegistry);
      console.log(`${multisigAid.name} Registry created`);
      return firstRegistry;
    } else {
      return registries[0][0];
    }
  }

  public buildCredSource(credType: string, cred: any, o?: string) {
    const credDict: { [key: string]: any } = {
      n: cred.sad.d,
      s: cred.sad.s,
    };
    if (o != null) {
      credDict["o"] = o;
    }
    const credSource = Saider.saidify({
      d: "",
      [credType]: credDict,
    })[1];
    return credSource;
  }

  public async getOrIssueCredential(
    credId: string,
    credName: string,
    attributes: any,
    issuerAidKey: string,
    issueeAidKey: string,
    credSourceId?: string,
    generateTestData: boolean = false,
    testName: string = "default_test",
  ): Promise<any> {
    const issuerAidInfo = this.aidsInfo.get(issuerAidKey)!;
    if (issuerAidInfo.identifiers) {
      return await this.getOrIssueCredentialMultiSig(
        credId,
        credName,
        attributes,
        issuerAidKey,
        issueeAidKey,
        credSourceId,
        generateTestData,
        testName,
      );
    } else {
      return await this.getOrIssueCredentialSingleSig(
        credId,
        credName,
        attributes,
        issuerAidKey,
        issueeAidKey,
        credSourceId,
        generateTestData,
        testName,
      );
    }
  }

  public async revokeCredential(
    credId: string,
    issuerAidKey: string,
    issueeAidKey: string,
    generateTestData: boolean = false,
    testName: string = "default_test",
  ) {
    const issuerAidInfo = this.aidsInfo.get(issuerAidKey)!;
    if (issuerAidInfo.identifiers) {
      return await this.revokeCredentialMultiSig(
        credId,
        issuerAidKey,
        issueeAidKey,
        generateTestData,
        testName,
      );
    } else {
      return await this.revokeCredentialSingleSig(
        credId,
        issuerAidKey,
        issueeAidKey,
        generateTestData,
        testName,
      );
    }
  }

  public async getOrIssueCredentialSingleSig(
    credId: string,
    credName: string,
    attributes: any,
    issuerAidKey: string,
    issueeAidKey: string,
    credSourceId?: string,
    generateTestData: boolean = false,
    testName: string = "default_test",
  ): Promise<any> {
    const credInfo: CredentialInfo = this.credentialsInfo.get(credName)!;
    const issuerAID = this.aids.get(issuerAidKey)![0];
    const recipientAID = this.aids.get(issueeAidKey)![0];
    const issuerAIDInfo = this.aidsInfo.get(issuerAidKey)!;
    const recipientAIDInfo = this.aidsInfo.get(issueeAidKey)!;
    const issuerClient = this.clients.get(issuerAIDInfo.agent.name)![0];
    const recipientClient = this.clients.get(recipientAIDInfo.agent.name)![0];

    const issuerRegistry = this.registries.get(issuerAIDInfo.name)!;
    const schema = this.schemas[credInfo.schema];
    const rules = this.rules[credInfo.rules!];
    const privacy = credInfo.privacy;
    let credSource = null;
    if (credSourceId != null) {
      const credType = credInfo.credSource["type"];
      const issuerCred = this.credentials.get(credSourceId);
      const credO = credInfo.credSource["o"] || null;
      credSource = this.buildCredSource(credType, issuerCred, credO);
    }
    if (attributes["AID"] != null) {
      attributes.AID = this.aids.get(attributes["AID"])![0].prefix;
    }
    const credData = { ...credInfo.attributes, ...attributes };
    const cred = await getOrIssueCredential(
      issuerClient,
      issuerAID,
      recipientAID,
      issuerRegistry,
      credData,
      schema,
      rules || undefined,
      credSource || undefined,
      boolean(privacy || false),
    );

    let credHolder = await getReceivedCredential(recipientClient, cred.sad.d);

    if (!credHolder) {
      await sendGrantMessage(issuerClient, issuerAID, recipientAID, cred);
      await sendAdmitMessage(recipientClient, recipientAID, issuerAID);
      credHolder = await retry(async () => {
        const cCred = await getReceivedCredential(recipientClient, cred.sad.d);
        assert(cCred !== undefined);
        return cCred;
      }, CRED_RETRY_DEFAULTS);
    }

    assert.equal(credHolder.sad.d, cred.sad.d);
    assert.equal(credHolder.sad.s, schema);
    assert.equal(credHolder.sad.i, issuerAID.prefix);
    assert.equal(credHolder.sad.a.i, recipientAID.prefix);
    assert.equal(credHolder.status.s, "0");
    assert(credHolder.atc !== undefined);
    this.credentials.set(credId, cred);
    const credCesr = await recipientClient.credentials().get(cred.sad.d, true);
    if (generateTestData) {
      let tmpCred = cred;
      let testData: EcrTestData = {
        aid: recipientAID.prefix,
        lei: credData.LEI,
        credential: { raw: tmpCred, cesr: credCesr },
        engagementContextRole:
          credData.engagementContextRole || credData.officialRole,
      };
      await buildTestData(testData, testName, issueeAidKey);
    }
    const response: ApiUser = {
      roleClient: recipientClient,
      ecrAid: recipientAID,
      creds: [{ cred: cred, credCesr: credCesr }],
      lei: credData.LEI,
      uploadDig: "",
      idAlias: issueeAidKey,
    };
    return [response, credData.engagementContextRole];
  }

  public async getOrIssueCredentialMultiSig(
    credId: string,
    credName: string,
    attributes: any,
    issuerAidKey: string,
    issueeAidKey: string,
    credSourceId?: string,
    generateTestData: boolean = false,
    testName: string = "default_test",
  ) {
    const credInfo: CredentialInfo = this.credentialsInfo.get(credName)!;
    const issuerAidInfo = this.aidsInfo.get(issuerAidKey)!;
    const recipientAidInfo = this.aidsInfo.get(issueeAidKey)!;
    const issuerAidIdentifierName = issuerAidInfo.name;
    const recipientAidIdentifierName = recipientAidInfo.name;
    const issuerAIDMultisig = this.aids.get(issuerAidKey)![0];
    const recipientAID = this.aids.get(issueeAidKey)![0];
    const credData = credInfo.attributes;
    const schema = this.schemas[credInfo.schema];
    let rules = this.rules[credInfo.rules!];
    const privacy = credInfo.privacy;
    const registryName = issuerAidInfo.name;
    let issuerRegistry = this.registries.get(registryName)!;
    const issuerAids =
      issuerAidInfo.identifiers.map(
        (identifier: any) => this.aids.get(identifier)![0],
      ) || [];
    let recepientAids = [];

    if (recipientAidInfo.identifiers) {
      recepientAids =
        recipientAidInfo.identifiers.map(
          (identifier: any) => this.aids.get(identifier)![0],
        ) || [];
    } else {
      recepientAids = [this.aids.get(recipientAidInfo.name)![0]];
    }

    let credSource = null;
    if (credSourceId != null) {
      const credType = credInfo.credSource["type"];
      const issuerCred = this.credentials.get(credSourceId);
      const credO = credInfo.credSource["o"] || null;
      credSource = this.buildCredSource(credType, issuerCred, credO);
      credSource = credSource ? { e: credSource } : undefined;
    }
    rules = rules ? { r: rules } : undefined;
    // Issuing a credential
    let creds = await Promise.all(
      issuerAids.map((aid: any, index: any) =>
        getIssuedCredential(
          this.clients.get(this.aidsInfo.get(aid.name).agent.name)![0],
          issuerAIDMultisig,
          recipientAID,
          schema,
        ),
      ),
    );

    if (creds.every((cred) => !cred)) {
      if (attributes["AID"] != null) {
        attributes.AID = this.aids.get(attributes["AID"])![0].prefix;
      }
      const credData = { ...credInfo.attributes, ...attributes };

      const kargsSub = {
        i: recipientAID.prefix,
        dt: createTimestamp(),
        ...credData,
      };
      if (!recipientAidInfo.identifiers) {
        kargsSub.u = new Salter({}).qb64;
      }

      const kargsIss = {
        i: issuerAIDMultisig.prefix,
        ri: issuerRegistry.regk,
        s: schema,
        a: kargsSub,
        ...credSource!,
        ...rules!,
      };
      if (!recipientAidInfo.identifiers) {
        kargsIss.u = new Salter({}).qb64;
      }

      const IssOps = await Promise.all(
        issuerAids.map((aid: any, index: any) =>
          issueCredentialMultisig(
            this.clients.get(this.aidsInfo.get(aid.name).agent.name)![0],
            aid,
            issuerAids.filter((_: any, i: any) => i !== index),
            issuerAIDMultisig.name,
            kargsIss,
            index === 0,
          ),
        ),
      );

      await Promise.all(
        issuerAids.map((aid: any, index: any) => {
          const client = this.clients.get(
            this.aidsInfo.get(aid.name).agent.name,
          )![0];
          return waitOperation(client, IssOps[index]);
        }),
      );

      await waitAndMarkNotification(
        this.clients.get(this.aidsInfo.get(issuerAids[0].name).agent.name)![0],
        "/multisig/iss",
      );

      creds = await Promise.all(
        issuerAids.map((aid: any, index: any) => {
          const client = this.clients.get(
            this.aidsInfo.get(aid.name).agent.name,
          )![0];
          return getIssuedCredential(
            client,
            issuerAIDMultisig,
            recipientAID,
            schema,
          );
        }),
      );

      const grantTime = createTimestamp();
      await Promise.all(
        creds.map((cred, index) => {
          const client = this.clients.get(
            this.aidsInfo.get(issuerAids[index].name).agent.name,
          )![0];
          return grantMultisig(
            client,
            issuerAids[index],
            issuerAids.filter((_: any, i: any) => i !== index),
            issuerAIDMultisig,
            recipientAID,
            cred,
            grantTime,
            index === 0,
          );
        }),
      );

      await waitAndMarkNotification(
        this.clients.get(this.aidsInfo.get(issuerAids[0].name).agent.name)![0],
        "/multisig/exn",
      );
    }
    const cred = creds[0];

    // Exchange grant and admit messages.
    // Check if the recipient is a singlesig AID
    if (recipientAidInfo.identifiers) {
      let credsReceived = await Promise.all(
        recepientAids.map((aid: any) => {
          const client = this.clients.get(
            this.aidsInfo.get(aid.name).agent.name,
          )![0];
          return getReceivedCredential(client, cred.sad.d);
        }),
      );

      if (credsReceived.every((cred) => cred === undefined)) {
        const admitTime = createTimestamp();

        await Promise.all(
          recepientAids.map((aid: any, index: any) => {
            const client = this.clients.get(
              this.aidsInfo.get(aid.name).agent.name,
            )![0];
            return admitMultisig(
              client,
              aid,
              recepientAids.filter((_: any, i: any) => i !== index),
              recipientAID,
              issuerAIDMultisig,
              admitTime,
            );
          }),
        );

        for (const aid of issuerAids) {
          await waitAndMarkNotification(
            this.clients.get(this.aidsInfo.get(aid.name).agent.name)![0],
            "/exn/ipex/admit",
          );
        }
        for (const aid of recepientAids) {
          await waitAndMarkNotification(
            this.clients.get(this.aidsInfo.get(aid.name).agent.name)![0],
            "/multisig/exn",
          );
        }
        for (const aid of recepientAids) {
          await waitAndMarkNotification(
            this.clients.get(this.aidsInfo.get(aid.name).agent.name)![0],
            "/exn/ipex/admit",
          );
        }

        credsReceived = await Promise.all(
          recepientAids.map((aid: any) => {
            const client = this.clients.get(
              this.aidsInfo.get(aid.name).agent.name,
            )![0];
            return waitForCredential(client, cred.sad.d);
          }),
        );

        // Assert received credential details
        for (const credReceived of credsReceived) {
          assert.equal(cred.sad.d, credReceived.sad.d);
        }
      }
    } else {
      let credReceived = await getReceivedCredential(
        this.clients.get(
          this.aidsInfo.get(recepientAids[0]!.name).agent.name,
        )![0],
        cred.sad.d,
      );
      if (!credReceived) {
        await admitSinglesig(
          this.clients.get(
            this.aidsInfo.get(recepientAids[0]!.name).agent.name,
          )![0],
          this.aids.get(recepientAids[0]!.name)![0].name,
          issuerAIDMultisig,
        );
        for (const aid of issuerAids) {
          await waitAndMarkNotification(
            this.clients.get(this.aidsInfo.get(aid.name).agent.name)![0],
            "/exn/ipex/admit",
          );
        }

        credReceived = await waitForCredential(
          this.clients.get(
            this.aidsInfo.get(recepientAids[0]!.name).agent.name,
          )![0],
          cred.sad.d,
        );
      }
      assert.equal(cred.sad.d, credReceived.sad.d);
    }
    console.log(
      `${issuerAIDMultisig.name} has issued a ${recipientAID.name} vLEI credential with SAID:`,
      cred.sad.d,
    );
    this.credentials.set(credId, cred);
    return [cred, null];
  }

  public async revokeCredentialSingleSig(
    credId: string,
    issuerAidKey: string,
    issueeAidKey: string,
    generateTestData: boolean = false,
    testName: string = "default_test",
  ) {
    const cred: any = this.credentials.get(credId)!;
    const issuerAID = this.aids.get(issuerAidKey)![0];
    const recipientAID = this.aids.get(issueeAidKey)![0];
    const issuerAIDInfo = this.aidsInfo.get(issuerAidKey)!;
    const recipientAIDInfo = this.aidsInfo.get(issueeAidKey)!;
    const recipientClient = this.clients.get(recipientAIDInfo.agent.name)![0];
    const issuerClient = this.clients.get(issuerAIDInfo.agent.name)![0];

    const revCred = await revokeCredential(issuerClient, issuerAID, cred.sad.d);
    this.credentials.set(credId, revCred);
    const credCesr = await issuerClient.credentials().get(revCred.sad.d, true);
    if (generateTestData) {
      let tmpCred = revCred;
      let testData: EcrTestData = {
        aid: recipientAID.prefix,
        lei: revCred.sad.a.LEI,
        credential: { raw: tmpCred, cesr: credCesr },
        engagementContextRole:
          revCred.sad.a.engagementContextRole || revCred.sad.a.officialRole,
      };
      await buildTestData(testData, testName, issueeAidKey, "revoked_");
    }

    const response: ApiUser = {
      roleClient: recipientClient,
      ecrAid: recipientAID,
      creds: [{ cred: revCred, credCesr: credCesr }],
      lei: revCred.sad.a.LEI,
      uploadDig: "",
      idAlias: issueeAidKey,
    };
    return [response, revCred.sad.a.engagementContextRole];
  }

  public async revokeCredentialMultiSig(
    credId: string,
    issuerAidKey: string,
    issueeAidKey: string,
    generateTestData: boolean = false,
    testName: string = "default_test",
  ) {
    const recipientAID = this.aids.get(issueeAidKey)![0];
    const cred: any = this.credentials.get(credId)!;
    const issuerAidInfo = this.aidsInfo.get(issuerAidKey)!;
    const issuerAIDMultisig = this.aids.get(issuerAidKey)![0];
    const issuerAids =
      issuerAidInfo.identifiers.map(
        (identifier: any) => this.aids.get(identifier)![0],
      ) || [];
    let revCred: any;
    let issuerClient: any;
    let revOps = [];
    let i = 0;
    const REVTIME = new Date().toISOString().replace("Z", "000+00:00");
    for (const issuerAid of issuerAids) {
      const aidInfo = this.aidsInfo.get(issuerAid.name)!;
      issuerClient = this.clients.get(aidInfo.agent.name)![0];
      if (i != 0) {
        const msgSaid = await waitAndMarkNotification(
          issuerClient,
          "/multisig/rev",
        );
        console.log(
          `Multisig AID ${issuerAid.name} received exchange message to join the credential revocation event`,
        );
        const res = await issuerClient.groups().getRequest(msgSaid);
      }
      const revResult = await issuerClient
        .credentials()
        .revoke(issuerAIDMultisig.name, cred.sad.d, REVTIME);
      revOps.push([issuerClient, revResult.op]);
      await multisigRevoke(
        issuerClient,
        issuerAid.name,
        issuerAIDMultisig.name,
        revResult.rev,
        revResult.anc,
      );
      i += 1;
    }

    for (const [client, op] of revOps) {
      await waitOperation(client, op);
    }
    revCred = await issuerClient.credentials().get(cred.sad.d);
    this.credentials.set(credId, revCred);
    if (generateTestData) {
      let tmpCred = revCred;
      const credCesr = await issuerClient
        .credentials()
        .get(revCred.sad.d, true);
      let testData: EcrTestData = {
        aid: recipientAID.prefix,
        lei: revCred.sad.a.LEI,
        credential: { raw: tmpCred, cesr: credCesr },
        engagementContextRole:
          revCred.sad.a.engagementContextRole || revCred.sad.a.officialRole,
      };
      await buildTestData(testData, testName, issueeAidKey, "revoked_");
    }
    return [revCred, null];
  }    
}

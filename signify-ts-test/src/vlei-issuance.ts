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
  getOrIssueAuthCredential,
  assertOperations,
  warnNotifications,
} from "../test/utils/test-util";
import {
  addEndRoleMultisig,
  admitMultisig,
  createAIDMultisig,
  createRegistryMultisig,
  delegateMultisig,
  grantMultisig,
  issueCredentialMultisig,
} from "../test/utils/multisig-utils";
import fs from "fs";
import { sec } from "mathjs";
import { retry } from "../test/utils/retry";
import {
  QVI_SCHEMA_SAID,
  LE_SCHEMA_SAID,
  ECR_AUTH_SCHEMA_SAID,
  ECR_SCHEMA_SAID,
  OOR_AUTH_SCHEMA_SAID,
  OOR_SCHEMA_SAID,
  vLEIServerHostUrl,
  QVI_SCHEMA_URL,
  LE_SCHEMA_URL,
  ECR_AUTH_SCHEMA_URL,
  ECR_SCHEMA_URL,
  OOR_AUTH_SCHEMA_URL,
  OOR_SCHEMA_URL,
  LE_RULES,
  ECR_RULES,
  ECR_AUTH_RULES,
  OOR_RULES,
  OOR_AUTH_RULES,
  CRED_RETRY_DEFAULTS,
  QVI_INTERNAL_NAME,
  LE_INTERNAL_NAME,
  vleiServerUrl,
  witnessIds,
} from "./constants";

import { User, buildUserData } from "./utils/handle-json-config";

export class VleiIssuance {
  secretsJsonPath: string = "./src/config/";
  secretsJson: any;
  users: Array<User> = new Array<User>();

  constructor(secretsJsonFile: string) {
    this.secretsJson = JSON.parse(
      fs.readFileSync(this.secretsJsonPath + secretsJsonFile, "utf-8"),
    );
  }

  public async prepareClients() {
    this.users = await buildUserData(this.secretsJson);
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
  }

  // Create clients dynamically for each user
  public async createClients() {
    for (const user of this.users) {
      for (const [key, values] of user.secrets) {
        for (const value of values.split(",")) {
          const client = await getOrCreateClients(1, [value], false);
          if (user.clients.has(key)) {
            user.clients.get(key)?.push(client[0]);
          } else {
            user.clients.set(key, [client[0]]);
          }
        }
      }
    }
  }

  // Create AIDs for each client
  public async createAids() {
    const kargsAID = {
      toad: witnessIds.length,
      wits: witnessIds,
    };
    for (const user of this.users) {
      for (const [role, clientList] of user.clients) {
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          const aid = await getOrCreateAID(client, `${role}${i + 1}`, kargsAID);
          if (user.aids.has(role)) {
            user.aids.get(role)?.push(aid);
          } else {
            user.aids.set(role, [aid]);
          }
        }
      }
    }
  }

  // Fetch OOBIs for each client
  public async fetchOobis() {
    for (const user of this.users) {
      for (const [role, clientList] of user.clients) {
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          const oobi = await client.oobis().get(`${role}${i + 1}`, "agent");
          if (user.oobis.has(role)) {
            user.oobis.get(role)?.push(oobi);
          } else {
            user.oobis.set(role, [oobi]);
          }
        }
      }
    }
  }

  // Create contacts between clients
  public async createContacts() {
    const contactPromises: Promise<string>[] = [];
    for (const user of this.users) {
      for (const [roleA, clientListA] of user.clients) {
        for (let i = 0; i < clientListA.length; i++) {
          for (const [roleB, clientListB] of user.clients) {
            for (let j = 0; j < clientListB.length; j++) {
              if (roleA !== roleB || i !== j) {
                // Skip self-referencing
                contactPromises.push(
                  getOrCreateContact(
                    clientListA[i],
                    `${roleB}${j + 1}`,
                    user.oobis.get(roleB)?.[j].oobis[0],
                  ),
                );
              }
            }
          }
        }
      }
    }
    await Promise.all(contactPromises);
  }

  // Resolve OOBIs for each client and schema
  public async resolveOobis(schemaUrls: string[]) {
    const resolveOobiPromises: Promise<void>[] = [];
    for (const user of this.users) {
      for (const [role, clientList] of user.clients) {
        for (const client of clientList) {
          schemaUrls.forEach((schemaUrl) => {
            resolveOobiPromises.push(resolveOobi(client, schemaUrl));
          });
        }
      }
    }
    await Promise.all(resolveOobiPromises);
  }

  // Issue credentials for all users
  public async issueCredentials() {
    for (const user of this.users) {
      if (
        user.clients.get("gleif")!.length > 1 ||
        user.clients.get("qvi")!.length > 1 ||
        user.clients.get("le")!.length > 1
      ) {
        await this.mutiSigVleiIssuance(user);
      } else {
        await this.singleSigVleiIssuance(user);
      }
    }
  }

  // Issue multisig credentials
  private async mutiSigVleiIssuance(user: User) {
    /**
     * The abbreviations used in this script follows GLEIF vLEI
     * ecosystem governance framework (EGF).
     *      GEDA: GLEIF External Delegated AID
     *      QVI:  Qualified vLEI Issuer
     *      LE:   Legal Entity
     *      GAR:  GLEIF Authorized Representative
     *      QAR:  Qualified vLEI Issuer Authorized Representative
     *      LAR:  Legal Entity Authorized Representative
     *      ECR:  Engagement Context Role Person
     */
    const qviData = {
      LEI: "254900OPPU84GM83MG36",
    };

    const leData = {
      LEI: user.LE,
    };
    const ecrData = {
      LEI: leData.LEI,
      personLegalName: "John Doe",
      engagementContextRole: "EBA Data Submitter",
    };
    const kargsAID = {
      toad: witnessIds.length,
      wits: witnessIds,
    };
    // Create a multisig AID for the GEDA.
    // Skip if a GEDA AID has already been incepted.
    let aidGEDAbyGAR1, aidGEDAbyGAR2: HabState;
    try {
      aidGEDAbyGAR1 = await user.clients
        .get("gleif")![0]
        .identifiers()
        .get("GEDA");
      aidGEDAbyGAR2 = await user.clients
        .get("gleif")![1]
        .identifiers()
        .get("GEDA");
    } catch {
      const rstates = [
        user.aids.get("gleif")![0].state,
        user.aids.get("gleif")![1].state,
      ];
      const states = rstates;

      const kargsMultisigAID: CreateIdentiferArgs = {
        algo: signify.Algos.group,
        isith: ["1/2", "1/2"],
        nsith: ["1/2", "1/2"],
        toad: kargsAID.toad,
        wits: kargsAID.wits,
        states: states,
        rstates: rstates,
      };

      kargsMultisigAID.mhab = user.aids.get("gleif")![0];
      const multisigAIDOp1 = await createAIDMultisig(
        user.clients.get("gleif")![0],
        user.aids.get("gleif")![0],
        [user.aids.get("gleif")![1]],
        "GEDA",
        kargsMultisigAID,
        true,
      );
      kargsMultisigAID.mhab = user.aids.get("gleif")![1];
      const multisigAIDOp2 = await createAIDMultisig(
        user.clients.get("gleif")![1],
        user.aids.get("gleif")![1],
        [user.aids.get("gleif")![0]],
        "GEDA",
        kargsMultisigAID,
      );

      await Promise.all([
        waitOperation(user.clients.get("gleif")![0], multisigAIDOp1),
        waitOperation(user.clients.get("gleif")![1], multisigAIDOp2),
      ]);

      await waitAndMarkNotification(
        user.clients.get("gleif")![0],
        "/multisig/icp",
      );

      aidGEDAbyGAR1 = await user.clients
        .get("gleif")![0]
        .identifiers()
        .get("GEDA");
      aidGEDAbyGAR2 = await user.clients
        .get("gleif")![1]
        .identifiers()
        .get("GEDA");
    }
    assert.equal(aidGEDAbyGAR1.prefix, aidGEDAbyGAR2.prefix);
    assert.equal(aidGEDAbyGAR1.name, aidGEDAbyGAR2.name);
    const aidGEDA = aidGEDAbyGAR1;

    // Add endpoint role authorization for all GARs' agents.
    // Skip if they have already been authorized.
    let [oobiGEDAbyGAR1, oobiGEDAbyGAR2] = await Promise.all([
      user.clients.get("gleif")![0].oobis().get(aidGEDA.name, "agent"),
      user.clients.get("gleif")![1].oobis().get(aidGEDA.name, "agent"),
    ]);
    if (oobiGEDAbyGAR1.oobis.length == 0 || oobiGEDAbyGAR2.oobis.length == 0) {
      const timestamp = createTimestamp();
      const opList1 = await addEndRoleMultisig(
        user.clients.get("gleif")![0],
        aidGEDA.name,
        user.aids.get("gleif")![0],
        [user.aids.get("gleif")![1]],
        aidGEDA,
        timestamp,
        true,
      );
      const opList2 = await addEndRoleMultisig(
        user.clients.get("gleif")![1],
        aidGEDA.name,
        user.aids.get("gleif")![1],
        [user.aids.get("gleif")![0]],
        aidGEDA,
        timestamp,
      );

      await Promise.all(
        opList1.map((op: any) =>
          waitOperation(user.clients.get("gleif")![0], op),
        ),
      );
      await Promise.all(
        opList2.map((op: any) =>
          waitOperation(user.clients.get("gleif")![1], op),
        ),
      );

      await waitAndMarkNotification(
        user.clients.get("gleif")![0],
        "/multisig/rpy",
      );

      [oobiGEDAbyGAR1, oobiGEDAbyGAR2] = await Promise.all([
        user.clients.get("gleif")![0].oobis().get(aidGEDA.name, "agent"),
        user.clients.get("gleif")![1].oobis().get(aidGEDA.name, "agent"),
      ]);
    }
    assert.equal(oobiGEDAbyGAR1.role, oobiGEDAbyGAR2.role);
    assert.equal(oobiGEDAbyGAR1.oobis[0], oobiGEDAbyGAR2.oobis[0]);

    // QARs, LARs, ECR resolve GEDA's OOBI
    const oobiGEDA = oobiGEDAbyGAR1.oobis[0].split("/agent/")[0];
    await Promise.all([
      getOrCreateContact(user.clients.get("qvi")![0], aidGEDA.name, oobiGEDA),
      getOrCreateContact(user.clients.get("qvi")![1], aidGEDA.name, oobiGEDA),
      getOrCreateContact(user.clients.get("qvi")![2], aidGEDA.name, oobiGEDA),
      getOrCreateContact(user.clients.get("le")![0], aidGEDA.name, oobiGEDA),
      getOrCreateContact(user.clients.get("le")![1], aidGEDA.name, oobiGEDA),
      getOrCreateContact(user.clients.get("le")![2], aidGEDA.name, oobiGEDA),
      getOrCreateContact(user.clients.get("ecr")![0], aidGEDA.name, oobiGEDA),
    ]);

    // Create a multisig AID for the QVI.
    // Skip if a QVI AID has already been incepted.
    let aidQVIbyQAR1, aidQVIbyQAR2, aidQVIbyQAR3: HabState;
    try {
      aidQVIbyQAR1 = await user.clients
        .get("qvi")![0]
        .identifiers()
        .get(QVI_INTERNAL_NAME);
      aidQVIbyQAR2 = await user.clients
        .get("qvi")![1]
        .identifiers()
        .get(QVI_INTERNAL_NAME);
      aidQVIbyQAR3 = await user.clients
        .get("qvi")![2]
        .identifiers()
        .get(QVI_INTERNAL_NAME);
    } catch {
      const rstates = [
        user.aids.get("qvi")![0].state,
        user.aids.get("qvi")![1].state,
        user.aids.get("qvi")![2].state,
      ];
      const states = rstates;

      const kargsMultisigAID: CreateIdentiferArgs = {
        algo: signify.Algos.group,
        isith: ["2/3", "1/2", "1/2"],
        nsith: ["2/3", "1/2", "1/2"],
        toad: kargsAID.toad,
        wits: kargsAID.wits,
        states: states,
        rstates: rstates,
        delpre: aidGEDA.prefix,
      };

      kargsMultisigAID.mhab = user.aids.get("qvi")![0];
      const multisigAIDOp1 = await createAIDMultisig(
        user.clients.get("qvi")![0],
        user.aids.get("qvi")![0],
        [user.aids.get("qvi")![1], user.aids.get("qvi")![2]],
        QVI_INTERNAL_NAME,
        kargsMultisigAID,
        true,
      );
      kargsMultisigAID.mhab = user.aids.get("qvi")![1];
      const multisigAIDOp2 = await createAIDMultisig(
        user.clients.get("qvi")![1],
        user.aids.get("qvi")![1],
        [user.aids.get("qvi")![0], user.aids.get("qvi")![2]],
        QVI_INTERNAL_NAME,
        kargsMultisigAID,
      );
      kargsMultisigAID.mhab = user.aids.get("qvi")![2];
      const multisigAIDOp3 = await createAIDMultisig(
        user.clients.get("qvi")![2],
        user.aids.get("qvi")![2],
        [user.aids.get("qvi")![0], user.aids.get("qvi")![1]],
        QVI_INTERNAL_NAME,
        kargsMultisigAID,
      );

      const aidQVIPrefix = multisigAIDOp1.name.split(".")[1];
      assert.equal(multisigAIDOp2.name.split(".")[1], aidQVIPrefix);
      assert.equal(multisigAIDOp3.name.split(".")[1], aidQVIPrefix);

      // GEDA anchors delegation with an interaction event.
      const anchor = {
        i: aidQVIPrefix,
        s: "0",
        d: aidQVIPrefix,
      };
      const ixnOp1 = await delegateMultisig(
        user.clients.get("gleif")![0],
        user.aids.get("gleif")![0],
        [user.aids.get("gleif")![1]],
        aidGEDA,
        anchor,
        true,
      );
      const ixnOp2 = await delegateMultisig(
        user.clients.get("gleif")![1],
        user.aids.get("gleif")![1],
        [user.aids.get("gleif")![0]],
        aidGEDA,
        anchor,
      );
      await Promise.all([
        waitOperation(user.clients.get("gleif")![0], ixnOp1),
        waitOperation(user.clients.get("gleif")![1], ixnOp2),
      ]);

      await waitAndMarkNotification(
        user.clients.get("gleif")![0],
        "/multisig/ixn",
      );

      // QARs query the GEDA's key state
      const queryOp1 = await user.clients
        .get("qvi")![0]
        .keyStates()
        .query(aidGEDA.prefix, "1");
      const queryOp2 = await user.clients
        .get("qvi")![1]
        .keyStates()
        .query(aidGEDA.prefix, "1");
      const queryOp3 = await user.clients
        .get("qvi")![2]
        .keyStates()
        .query(aidGEDA.prefix, "1");

      await Promise.all([
        waitOperation(user.clients.get("qvi")![0], multisigAIDOp1),
        waitOperation(user.clients.get("qvi")![1], multisigAIDOp2),
        waitOperation(user.clients.get("qvi")![2], multisigAIDOp3),
        waitOperation(user.clients.get("qvi")![0], queryOp1),
        waitOperation(user.clients.get("qvi")![1], queryOp2),
        waitOperation(user.clients.get("qvi")![2], queryOp3),
      ]);

      await waitAndMarkNotification(
        user.clients.get("qvi")![0],
        "/multisig/icp",
      );

      aidQVIbyQAR1 = await user.clients
        .get("qvi")![0]
        .identifiers()
        .get(QVI_INTERNAL_NAME);
      aidQVIbyQAR2 = await user.clients
        .get("qvi")![1]
        .identifiers()
        .get(QVI_INTERNAL_NAME);
      aidQVIbyQAR3 = await user.clients
        .get("qvi")![2]
        .identifiers()
        .get(QVI_INTERNAL_NAME);
    }
    assert.equal(aidQVIbyQAR1.prefix, aidQVIbyQAR2.prefix);
    assert.equal(aidQVIbyQAR1.prefix, aidQVIbyQAR3.prefix);
    assert.equal(aidQVIbyQAR1.name, aidQVIbyQAR2.name);
    assert.equal(aidQVIbyQAR1.name, aidQVIbyQAR3.name);
    let aidQVI = aidQVIbyQAR1;

    // Add endpoint role authorization for all QARs' agents.
    // Skip if they have already been authorized.
    let [oobiQVIbyQAR1, oobiQVIbyQAR2, oobiQVIbyQAR3] = await Promise.all([
      user.clients.get("qvi")![0].oobis().get(aidQVI.name, "agent"),
      user.clients.get("qvi")![1].oobis().get(aidQVI.name, "agent"),
      user.clients.get("qvi")![2].oobis().get(aidQVI.name, "agent"),
    ]);
    if (
      oobiQVIbyQAR1.oobis.length == 0 ||
      oobiQVIbyQAR2.oobis.length == 0 ||
      oobiQVIbyQAR3.oobis.length == 0
    ) {
      const timestamp = createTimestamp();
      const opList1 = await addEndRoleMultisig(
        user.clients.get("qvi")![0],
        aidQVI.name,
        user.aids.get("qvi")![0],
        [user.aids.get("qvi")![1], user.aids.get("qvi")![2]],
        aidQVI,
        timestamp,
        true,
      );
      const opList2 = await addEndRoleMultisig(
        user.clients.get("qvi")![1],
        aidQVI.name,
        user.aids.get("qvi")![1],
        [user.aids.get("qvi")![0], user.aids.get("qvi")![2]],
        aidQVI,
        timestamp,
      );
      const opList3 = await addEndRoleMultisig(
        user.clients.get("qvi")![2],
        aidQVI.name,
        user.aids.get("qvi")![2],
        [user.aids.get("qvi")![0], user.aids.get("qvi")![1]],
        aidQVI,
        timestamp,
      );

      await Promise.all(
        opList1.map((op: any) =>
          waitOperation(user.clients.get("qvi")![0], op),
        ),
      );
      await Promise.all(
        opList2.map((op: any) =>
          waitOperation(user.clients.get("qvi")![1], op),
        ),
      );
      await Promise.all(
        opList3.map((op: any) =>
          waitOperation(user.clients.get("qvi")![2], op),
        ),
      );

      await waitAndMarkNotification(
        user.clients.get("qvi")![0],
        "/multisig/rpy",
      );
      await waitAndMarkNotification(
        user.clients.get("qvi")![1],
        "/multisig/rpy",
      );

      [oobiQVIbyQAR1, oobiQVIbyQAR2, oobiQVIbyQAR3] = await Promise.all([
        user.clients.get("qvi")![0].oobis().get(aidQVI.name, "agent"),
        user.clients.get("qvi")![1].oobis().get(aidQVI.name, "agent"),
        user.clients.get("qvi")![2].oobis().get(aidQVI.name, "agent"),
      ]);
    }
    assert.equal(oobiQVIbyQAR1.role, oobiQVIbyQAR2.role);
    assert.equal(oobiQVIbyQAR1.role, oobiQVIbyQAR3.role);
    assert.equal(oobiQVIbyQAR1.oobis[0], oobiQVIbyQAR2.oobis[0]);
    assert.equal(oobiQVIbyQAR1.oobis[0], oobiQVIbyQAR3.oobis[0]);

    // GARs, LARs, ECR resolve QVI AID's OOBI
    const oobiQVI = oobiQVIbyQAR1.oobis[0].split("/agent/")[0];
    await Promise.all([
      getOrCreateContact(user.clients.get("gleif")![0], aidQVI.name, oobiQVI),
      getOrCreateContact(user.clients.get("gleif")![1], aidQVI.name, oobiQVI),
      getOrCreateContact(user.clients.get("le")![0], aidQVI.name, oobiQVI),
      getOrCreateContact(user.clients.get("le")![1], aidQVI.name, oobiQVI),
      getOrCreateContact(user.clients.get("le")![2], aidQVI.name, oobiQVI),
      getOrCreateContact(user.clients.get("ecr")![0], aidQVI.name, oobiQVI),
    ]);

    // GARs creates a registry for GEDA.
    // Skip if the registry has already been created.
    let [gedaRegistrybyGAR1, gedaRegistrybyGAR2] = await Promise.all([
      user.clients.get("gleif")![0].registries().list(aidGEDA.name),
      user.clients.get("gleif")![1].registries().list(aidGEDA.name),
    ]);
    if (gedaRegistrybyGAR1.length == 0 && gedaRegistrybyGAR2.length == 0) {
      const nonce = randomNonce();
      const registryOp1 = await createRegistryMultisig(
        user.clients.get("gleif")![0],
        user.aids.get("gleif")![0],
        [user.aids.get("gleif")![1]],
        aidGEDA,
        "gedaRegistry",
        nonce,
        true,
      );
      const registryOp2 = await createRegistryMultisig(
        user.clients.get("gleif")![1],
        user.aids.get("gleif")![1],
        [user.aids.get("gleif")![0]],
        aidGEDA,
        "gedaRegistry",
        nonce,
      );

      await Promise.all([
        waitOperation(user.clients.get("gleif")![0], registryOp1),
        waitOperation(user.clients.get("gleif")![1], registryOp2),
      ]);

      await waitAndMarkNotification(
        user.clients.get("gleif")![0],
        "/multisig/vcp",
      );

      [gedaRegistrybyGAR1, gedaRegistrybyGAR2] = await Promise.all([
        user.clients.get("gleif")![0].registries().list(aidGEDA.name),
        user.clients.get("gleif")![1].registries().list(aidGEDA.name),
      ]);
    }
    assert.equal(gedaRegistrybyGAR1[0].regk, gedaRegistrybyGAR2[0].regk);
    assert.equal(gedaRegistrybyGAR1[0].name, gedaRegistrybyGAR2[0].name);
    const gedaRegistry = gedaRegistrybyGAR1[0];

    // GEDA issues a QVI vLEI credential to the QVI AID.
    // Skip if the credential has already been issued.
    let qviCredbyGAR1 = await getIssuedCredential(
      user.clients.get("gleif")![0],
      aidGEDA,
      aidQVI,
      QVI_SCHEMA_SAID,
    );
    let qviCredbyGAR2 = await getIssuedCredential(
      user.clients.get("gleif")![1],
      aidGEDA,
      aidQVI,
      QVI_SCHEMA_SAID,
    );
    if (!(qviCredbyGAR1 && qviCredbyGAR2)) {
      const kargsSub: CredentialSubject = {
        i: aidQVI.prefix,
        dt: createTimestamp(),
        ...qviData,
      };
      const kargsIss: CredentialData = {
        i: aidGEDA.prefix,
        ri: gedaRegistry.regk,
        s: QVI_SCHEMA_SAID,
        a: kargsSub,
      };
      const IssOp1 = await issueCredentialMultisig(
        user.clients.get("gleif")![0],
        user.aids.get("gleif")![0],
        [user.aids.get("gleif")![1]],
        aidGEDA.name,
        kargsIss,
        true,
      );
      const IssOp2 = await issueCredentialMultisig(
        user.clients.get("gleif")![1],
        user.aids.get("gleif")![1],
        [user.aids.get("gleif")![0]],
        aidGEDA.name,
        kargsIss,
      );

      await Promise.all([
        waitOperation(user.clients.get("gleif")![0], IssOp1),
        waitOperation(user.clients.get("gleif")![1], IssOp2),
      ]);

      await waitAndMarkNotification(
        user.clients.get("gleif")![0],
        "/multisig/iss",
      );

      qviCredbyGAR1 = await getIssuedCredential(
        user.clients.get("gleif")![0],
        aidGEDA,
        aidQVI,
        QVI_SCHEMA_SAID,
      );
      qviCredbyGAR2 = await getIssuedCredential(
        user.clients.get("gleif")![1],
        aidGEDA,
        aidQVI,
        QVI_SCHEMA_SAID,
      );

      const grantTime = createTimestamp();
      await grantMultisig(
        user.clients.get("gleif")![0],
        user.aids.get("gleif")![0],
        [user.aids.get("gleif")![1]],
        aidGEDA,
        aidQVI,
        qviCredbyGAR1,
        grantTime,
        true,
      );
      await grantMultisig(
        user.clients.get("gleif")![1],
        user.aids.get("gleif")![1],
        [user.aids.get("gleif")![0]],
        aidGEDA,
        aidQVI,
        qviCredbyGAR2,
        grantTime,
      );

      await waitAndMarkNotification(
        user.clients.get("gleif")![0],
        "/multisig/exn",
      );
    }
    assert.equal(qviCredbyGAR1.sad.d, qviCredbyGAR2.sad.d);
    assert.equal(qviCredbyGAR1.sad.s, QVI_SCHEMA_SAID);
    assert.equal(qviCredbyGAR1.sad.i, aidGEDA.prefix);
    assert.equal(qviCredbyGAR1.sad.a.i, aidQVI.prefix);
    assert.equal(qviCredbyGAR1.status.s, "0");
    assert(qviCredbyGAR1.atc !== undefined);
    const qviCred = qviCredbyGAR1;
    console.log(
      "GEDA has issued a QVI vLEI credential with SAID:",
      qviCred.sad.d,
    );

    // GEDA and QVI exchange grant and admit messages.
    // Skip if QVI has already received the credential.
    let qviCredbyQAR1 = await getReceivedCredential(
      user.clients.get("qvi")![0],
      qviCred.sad.d,
    );
    let qviCredbyQAR2 = await getReceivedCredential(
      user.clients.get("qvi")![1],
      qviCred.sad.d,
    );
    let qviCredbyQAR3 = await getReceivedCredential(
      user.clients.get("qvi")![2],
      qviCred.sad.d,
    );
    if (!(qviCredbyQAR1 && qviCredbyQAR2 && qviCredbyQAR3)) {
      const admitTime = createTimestamp();
      await admitMultisig(
        user.clients.get("qvi")![0],
        user.aids.get("qvi")![0],
        [user.aids.get("qvi")![1], user.aids.get("qvi")![2]],
        aidQVI,
        aidGEDA,
        admitTime,
      );
      await admitMultisig(
        user.clients.get("qvi")![1],
        user.aids.get("qvi")![1],
        [user.aids.get("qvi")![0], user.aids.get("qvi")![2]],
        aidQVI,
        aidGEDA,
        admitTime,
      );
      await admitMultisig(
        user.clients.get("qvi")![2],
        user.aids.get("qvi")![2],
        [user.aids.get("qvi")![0], user.aids.get("qvi")![1]],
        aidQVI,
        aidGEDA,
        admitTime,
      );
      await waitAndMarkNotification(
        user.clients.get("gleif")![0],
        "/exn/ipex/admit",
      );
      await waitAndMarkNotification(
        user.clients.get("gleif")![1],
        "/exn/ipex/admit",
      );
      await waitAndMarkNotification(
        user.clients.get("qvi")![0],
        "/multisig/exn",
      );
      await waitAndMarkNotification(
        user.clients.get("qvi")![1],
        "/multisig/exn",
      );
      await waitAndMarkNotification(
        user.clients.get("qvi")![2],
        "/multisig/exn",
      );
      await waitAndMarkNotification(
        user.clients.get("qvi")![0],
        "/exn/ipex/admit",
      );
      await waitAndMarkNotification(
        user.clients.get("qvi")![1],
        "/exn/ipex/admit",
      );
      await waitAndMarkNotification(
        user.clients.get("qvi")![2],
        "/exn/ipex/admit",
      );

      qviCredbyQAR1 = await waitForCredential(
        user.clients.get("qvi")![0],
        qviCred.sad.d,
      );
      qviCredbyQAR2 = await waitForCredential(
        user.clients.get("qvi")![1],
        qviCred.sad.d,
      );
      qviCredbyQAR3 = await waitForCredential(
        user.clients.get("qvi")![2],
        qviCred.sad.d,
      );
    }
    assert.equal(qviCred.sad.d, qviCredbyQAR1.sad.d);
    assert.equal(qviCred.sad.d, qviCredbyQAR2.sad.d);
    assert.equal(qviCred.sad.d, qviCredbyQAR3.sad.d);

    // Create a multisig AID for the LE.
    // Skip if a LE AID has already been incepted.
    let aidLEbyLAR1, aidLEbyLAR2, aidLEbyLAR3: HabState;
    try {
      aidLEbyLAR1 = await user.clients
        .get("le")![0]
        .identifiers()
        .get(LE_INTERNAL_NAME);
      aidLEbyLAR2 = await user.clients
        .get("le")![1]
        .identifiers()
        .get(LE_INTERNAL_NAME);
      aidLEbyLAR3 = await user.clients
        .get("le")![2]
        .identifiers()
        .get(LE_INTERNAL_NAME);
    } catch {
      const rstates = [
        user.aids.get("le")![0].state,
        user.aids.get("le")![1].state,
        user.aids.get("le")![2].state,
      ];
      const states = rstates;

      const kargsMultisigAID: CreateIdentiferArgs = {
        algo: signify.Algos.group,
        isith: ["2/3", "1/2", "1/2"],
        nsith: ["2/3", "1/2", "1/2"],
        toad: kargsAID.toad,
        wits: kargsAID.wits,
        states: states,
        rstates: rstates,
      };

      kargsMultisigAID.mhab = user.aids.get("le")![0];
      const multisigAIDOp1 = await createAIDMultisig(
        user.clients.get("le")![0],
        user.aids.get("le")![0],
        [user.aids.get("le")![1], user.aids.get("le")![2]],
        LE_INTERNAL_NAME,
        kargsMultisigAID,
        true,
      );
      kargsMultisigAID.mhab = user.aids.get("le")![1];
      const multisigAIDOp2 = await createAIDMultisig(
        user.clients.get("le")![1],
        user.aids.get("le")![1],
        [user.aids.get("le")![0], user.aids.get("le")![2]],
        LE_INTERNAL_NAME,
        kargsMultisigAID,
      );
      kargsMultisigAID.mhab = user.aids.get("le")![2];
      const multisigAIDOp3 = await createAIDMultisig(
        user.clients.get("le")![2],
        user.aids.get("le")![2],
        [user.aids.get("le")![0], user.aids.get("le")![1]],
        LE_INTERNAL_NAME,
        kargsMultisigAID,
      );

      await Promise.all([
        waitOperation(user.clients.get("le")![0], multisigAIDOp1),
        waitOperation(user.clients.get("le")![1], multisigAIDOp2),
        waitOperation(user.clients.get("le")![2], multisigAIDOp3),
      ]);

      await waitAndMarkNotification(
        user.clients.get("le")![0],
        "/multisig/icp",
      );

      aidLEbyLAR1 = await user.clients
        .get("le")![0]
        .identifiers()
        .get(LE_INTERNAL_NAME);
      aidLEbyLAR2 = await user.clients
        .get("le")![1]
        .identifiers()
        .get(LE_INTERNAL_NAME);
      aidLEbyLAR3 = await user.clients
        .get("le")![2]
        .identifiers()
        .get(LE_INTERNAL_NAME);
    }
    assert.equal(aidLEbyLAR1.prefix, aidLEbyLAR2.prefix);
    assert.equal(aidLEbyLAR1.prefix, aidLEbyLAR3.prefix);
    assert.equal(aidLEbyLAR1.name, aidLEbyLAR2.name);
    assert.equal(aidLEbyLAR1.name, aidLEbyLAR3.name);
    const aidLE = aidLEbyLAR1;

    // Add endpoint role authorization for all LARs' agents.
    // Skip if they have already been authorized.
    let [oobiLEbyLAR1, oobiLEbyLAR2, oobiLEbyLAR3] = await Promise.all([
      user.clients.get("le")![0].oobis().get(aidLE.name, "agent"),
      user.clients.get("le")![1].oobis().get(aidLE.name, "agent"),
      user.clients.get("le")![2].oobis().get(aidLE.name, "agent"),
    ]);
    if (
      oobiLEbyLAR1.oobis.length == 0 ||
      oobiLEbyLAR2.oobis.length == 0 ||
      oobiLEbyLAR3.oobis.length == 0
    ) {
      const timestamp = createTimestamp();
      const opList1 = await addEndRoleMultisig(
        user.clients.get("le")![0],
        aidLE.name,
        user.aids.get("le")![0],
        [user.aids.get("le")![1], user.aids.get("le")![2]],
        aidLE,
        timestamp,
        true,
      );
      const opList2 = await addEndRoleMultisig(
        user.clients.get("le")![1],
        aidLE.name,
        user.aids.get("le")![1],
        [user.aids.get("le")![0], user.aids.get("le")![2]],
        aidLE,
        timestamp,
      );
      const opList3 = await addEndRoleMultisig(
        user.clients.get("le")![2],
        aidLE.name,
        user.aids.get("le")![2],
        [user.aids.get("le")![0], user.aids.get("le")![1]],
        aidLE,
        timestamp,
      );

      await Promise.all(
        opList1.map((op: any) => waitOperation(user.clients.get("le")![0], op)),
      );
      await Promise.all(
        opList2.map((op: any) => waitOperation(user.clients.get("le")![1], op)),
      );
      await Promise.all(
        opList3.map((op: any) => waitOperation(user.clients.get("le")![2], op)),
      );

      await waitAndMarkNotification(
        user.clients.get("le")![0],
        "/multisig/rpy",
      );
      await waitAndMarkNotification(
        user.clients.get("le")![1],
        "/multisig/rpy",
      );

      [oobiLEbyLAR1, oobiLEbyLAR2, oobiLEbyLAR3] = await Promise.all([
        user.clients.get("le")![0].oobis().get(aidLE.name, "agent"),
        user.clients.get("le")![1].oobis().get(aidLE.name, "agent"),
        user.clients.get("le")![2].oobis().get(aidLE.name, "agent"),
      ]);
    }
    assert.equal(oobiLEbyLAR1.role, oobiLEbyLAR2.role);
    assert.equal(oobiLEbyLAR1.role, oobiLEbyLAR3.role);
    assert.equal(oobiLEbyLAR1.oobis[0], oobiLEbyLAR2.oobis[0]);
    assert.equal(oobiLEbyLAR1.oobis[0], oobiLEbyLAR3.oobis[0]);

    // QARs, ECR resolve LE AID's OOBI
    const oobiLE = oobiLEbyLAR1.oobis[0].split("/agent/")[0];
    await Promise.all([
      getOrCreateContact(user.clients.get("qvi")![0], aidLE.name, oobiLE),
      getOrCreateContact(user.clients.get("qvi")![1], aidLE.name, oobiLE),
      getOrCreateContact(user.clients.get("qvi")![2], aidLE.name, oobiLE),
      getOrCreateContact(user.clients.get("ecr")![0], aidLE.name, oobiLE),
    ]);

    // QARs creates a registry for QVI AID.
    // Skip if the registry has already been created.
    let [qviRegistrybyQAR1, qviRegistrybyQAR2, qviRegistrybyQAR3] =
      await Promise.all([
        user.clients.get("qvi")![0].registries().list(aidQVI.name),
        user.clients.get("qvi")![1].registries().list(aidQVI.name),
        user.clients.get("qvi")![2].registries().list(aidQVI.name),
      ]);
    qviRegistrybyQAR1 = qviRegistrybyQAR1.filter(
      (reg: { name: string }) => reg.name == `qviRegistry${aidLE.prefix}`,
    );
    qviRegistrybyQAR2 = qviRegistrybyQAR2.filter(
      (reg: { name: string }) => reg.name == `qviRegistry${aidLE.prefix}`,
    );
    qviRegistrybyQAR3 = qviRegistrybyQAR3.filter(
      (reg: { name: string }) => reg.name == `qviRegistry${aidLE.prefix}`,
    );
    if (
      qviRegistrybyQAR1.length == 0 &&
      qviRegistrybyQAR2.length == 0 &&
      qviRegistrybyQAR3.length == 0
    ) {
      const nonce = randomNonce();
      const registryOp1 = await createRegistryMultisig(
        user.clients.get("qvi")![0],
        user.aids.get("qvi")![0],
        [user.aids.get("qvi")![1], user.aids.get("qvi")![2]],
        aidQVI,
        `qviRegistry${aidLE.prefix}`,
        nonce,
        true,
      );
      const registryOp2 = await createRegistryMultisig(
        user.clients.get("qvi")![1],
        user.aids.get("qvi")![1],
        [user.aids.get("qvi")![0], user.aids.get("qvi")![2]],
        aidQVI,
        `qviRegistry${aidLE.prefix}`,
        nonce,
      );
      const registryOp3 = await createRegistryMultisig(
        user.clients.get("qvi")![2],
        user.aids.get("qvi")![2],
        [user.aids.get("qvi")![0], user.aids.get("qvi")![1]],
        aidQVI,
        `qviRegistry${aidLE.prefix}`,
        nonce,
      );

      await Promise.all([
        waitOperation(user.clients.get("qvi")![0], registryOp1),
        waitOperation(user.clients.get("qvi")![1], registryOp2),
        waitOperation(user.clients.get("qvi")![2], registryOp3),
      ]);

      await waitAndMarkNotification(
        user.clients.get("qvi")![0],
        "/multisig/vcp",
      );

      [qviRegistrybyQAR1, qviRegistrybyQAR2, qviRegistrybyQAR3] =
        await Promise.all([
          user.clients.get("qvi")![0].registries().list(aidQVI.name),
          user.clients.get("qvi")![1].registries().list(aidQVI.name),
          user.clients.get("qvi")![2].registries().list(aidQVI.name),
        ]);
    }
    assert.equal(qviRegistrybyQAR1[0].regk, qviRegistrybyQAR2[0].regk);
    assert.equal(qviRegistrybyQAR1[0].regk, qviRegistrybyQAR3[0].regk);
    assert.equal(qviRegistrybyQAR1[0].name, qviRegistrybyQAR2[0].name);
    assert.equal(qviRegistrybyQAR1[0].name, qviRegistrybyQAR3[0].name);
    const qviRegistry = qviRegistrybyQAR1[0];

    // QVI issues a LE vLEI credential to the LE.
    // Skip if the credential has already been issued.
    let leCredbyQAR1 = await getIssuedCredential(
      user.clients.get("qvi")![0],
      aidQVI,
      aidLE,
      LE_SCHEMA_SAID,
    );
    let leCredbyQAR2 = await getIssuedCredential(
      user.clients.get("qvi")![1],
      aidQVI,
      aidLE,
      LE_SCHEMA_SAID,
    );
    let leCredbyQAR3 = await getIssuedCredential(
      user.clients.get("qvi")![2],
      aidQVI,
      aidLE,
      LE_SCHEMA_SAID,
    );
    if (!(leCredbyQAR1 && leCredbyQAR2 && leCredbyQAR3)) {
      const leCredSource = Saider.saidify({
        d: "",
        qvi: {
          n: qviCred.sad.d,
          s: qviCred.sad.s,
        },
      })[1];

      const kargsSub: CredentialSubject = {
        i: aidLE.prefix,
        dt: createTimestamp(),
        ...leData,
      };
      const kargsIss: CredentialData = {
        i: aidQVI.prefix,
        ri: qviRegistry.regk,
        s: LE_SCHEMA_SAID,
        a: kargsSub,
        e: leCredSource,
        r: LE_RULES,
      };
      const IssOp1 = await issueCredentialMultisig(
        user.clients.get("qvi")![0],
        user.aids.get("qvi")![0],
        [user.aids.get("qvi")![1], user.aids.get("qvi")![2]],
        aidQVI.name,
        kargsIss,
        true,
      );
      const IssOp2 = await issueCredentialMultisig(
        user.clients.get("qvi")![1],
        user.aids.get("qvi")![1],
        [user.aids.get("qvi")![0], user.aids.get("qvi")![2]],
        aidQVI.name,
        kargsIss,
      );
      const IssOp3 = await issueCredentialMultisig(
        user.clients.get("qvi")![2],
        user.aids.get("qvi")![2],
        [user.aids.get("qvi")![0], user.aids.get("qvi")![1]],
        aidQVI.name,
        kargsIss,
      );

      await Promise.all([
        waitOperation(user.clients.get("qvi")![0], IssOp1),
        waitOperation(user.clients.get("qvi")![1], IssOp2),
        waitOperation(user.clients.get("qvi")![2], IssOp3),
      ]);

      await waitAndMarkNotification(
        user.clients.get("qvi")![0],
        "/multisig/iss",
      );

      leCredbyQAR1 = await getIssuedCredential(
        user.clients.get("qvi")![0],
        aidQVI,
        aidLE,
        LE_SCHEMA_SAID,
      );
      leCredbyQAR2 = await getIssuedCredential(
        user.clients.get("qvi")![1],
        aidQVI,
        aidLE,
        LE_SCHEMA_SAID,
      );
      leCredbyQAR3 = await getIssuedCredential(
        user.clients.get("qvi")![2],
        aidQVI,
        aidLE,
        LE_SCHEMA_SAID,
      );

      const grantTime = createTimestamp();
      await grantMultisig(
        user.clients.get("qvi")![0],
        user.aids.get("qvi")![0],
        [user.aids.get("qvi")![1], user.aids.get("qvi")![2]],
        aidQVI,
        aidLE,
        leCredbyQAR1,
        grantTime,
        true,
      );
      await grantMultisig(
        user.clients.get("qvi")![1],
        user.aids.get("qvi")![1],
        [user.aids.get("qvi")![0], user.aids.get("qvi")![2]],
        aidQVI,
        aidLE,
        leCredbyQAR2,
        grantTime,
      );
      await grantMultisig(
        user.clients.get("qvi")![2],
        user.aids.get("qvi")![2],
        [user.aids.get("qvi")![0], user.aids.get("qvi")![1]],
        aidQVI,
        aidLE,
        leCredbyQAR3,
        grantTime,
      );

      await waitAndMarkNotification(
        user.clients.get("qvi")![0],
        "/multisig/exn",
      );
    }
    assert.equal(leCredbyQAR1.sad.d, leCredbyQAR2.sad.d);
    assert.equal(leCredbyQAR1.sad.d, leCredbyQAR3.sad.d);
    assert.equal(leCredbyQAR1.sad.s, LE_SCHEMA_SAID);
    assert.equal(leCredbyQAR1.sad.i, aidQVI.prefix);
    assert.equal(leCredbyQAR1.sad.a.i, aidLE.prefix);
    assert.equal(leCredbyQAR1.status.s, "0");
    assert(leCredbyQAR1.atc !== undefined);
    const leCred = leCredbyQAR1;
    console.log("QVI has issued a LE vLEI credential with SAID:", leCred.sad.d);

    // QVI and LE exchange grant and admit messages.
    // Skip if LE has already received the credential.
    let leCredbyLAR1 = await getReceivedCredential(
      user.clients.get("le")![0],
      leCred.sad.d,
    );
    let leCredbyLAR2 = await getReceivedCredential(
      user.clients.get("le")![1],
      leCred.sad.d,
    );
    let leCredbyLAR3 = await getReceivedCredential(
      user.clients.get("le")![2],
      leCred.sad.d,
    );
    if (!(leCredbyLAR1 && leCredbyLAR2 && leCredbyLAR3)) {
      const admitTime = createTimestamp();
      await admitMultisig(
        user.clients.get("le")![0],
        user.aids.get("le")![0],
        [user.aids.get("le")![1], user.aids.get("le")![2]],
        aidLE,
        aidQVI,
        admitTime,
      );
      await admitMultisig(
        user.clients.get("le")![1],
        user.aids.get("le")![1],
        [user.aids.get("le")![0], user.aids.get("le")![2]],
        aidLE,
        aidQVI,
        admitTime,
      );
      await admitMultisig(
        user.clients.get("le")![2],
        user.aids.get("le")![2],
        [user.aids.get("le")![0], user.aids.get("le")![1]],
        aidLE,
        aidQVI,
        admitTime,
      );
      await waitAndMarkNotification(
        user.clients.get("qvi")![0],
        "/exn/ipex/admit",
      );
      await waitAndMarkNotification(
        user.clients.get("qvi")![1],
        "/exn/ipex/admit",
      );
      await waitAndMarkNotification(
        user.clients.get("qvi")![2],
        "/exn/ipex/admit",
      );
      await waitAndMarkNotification(
        user.clients.get("le")![0],
        "/multisig/exn",
      );
      await waitAndMarkNotification(
        user.clients.get("le")![1],
        "/multisig/exn",
      );
      await waitAndMarkNotification(
        user.clients.get("le")![2],
        "/multisig/exn",
      );
      await waitAndMarkNotification(
        user.clients.get("le")![0],
        "/exn/ipex/admit",
      );
      await waitAndMarkNotification(
        user.clients.get("le")![1],
        "/exn/ipex/admit",
      );
      await waitAndMarkNotification(
        user.clients.get("le")![2],
        "/exn/ipex/admit",
      );

      leCredbyLAR1 = await waitForCredential(
        user.clients.get("le")![0],
        leCred.sad.d,
      );
      leCredbyLAR2 = await waitForCredential(
        user.clients.get("le")![1],
        leCred.sad.d,
      );
      leCredbyLAR3 = await waitForCredential(
        user.clients.get("le")![2],
        leCred.sad.d,
      );
    }
    assert.equal(leCred.sad.d, leCredbyLAR1.sad.d);
    assert.equal(leCred.sad.d, leCredbyLAR2.sad.d);
    assert.equal(leCred.sad.d, leCredbyLAR3.sad.d);

    // LARs creates a registry for LE AID.
    // Skip if the registry has already been created.
    let [leRegistrybyLAR1, leRegistrybyLAR2, leRegistrybyLAR3] =
      await Promise.all([
        user.clients.get("le")![0].registries().list(aidLE.name),
        user.clients.get("le")![1].registries().list(aidLE.name),
        user.clients.get("le")![2].registries().list(aidLE.name),
      ]);
    leRegistrybyLAR1 = leRegistrybyLAR1.filter(
      (reg: { name: string }) =>
        reg.name == `leRegistry${user.aids.get("ecr")![0].prefix}`,
    );
    leRegistrybyLAR2 = leRegistrybyLAR2.filter(
      (reg: { name: string }) =>
        reg.name == `leRegistry${user.aids.get("ecr")![0].prefix}`,
    );
    leRegistrybyLAR3 = leRegistrybyLAR3.filter(
      (reg: { name: string }) =>
        reg.name == `leRegistry${user.aids.get("ecr")![0].prefix}`,
    );
    if (
      leRegistrybyLAR1.length == 0 &&
      leRegistrybyLAR2.length == 0 &&
      leRegistrybyLAR3.length == 0
    ) {
      const nonce = randomNonce();
      const registryOp1 = await createRegistryMultisig(
        user.clients.get("le")![0],
        user.aids.get("le")![0],
        [user.aids.get("le")![1], user.aids.get("le")![2]],
        aidLE,
        `leRegistry${user.aids.get("ecr")![0].prefix}`,
        nonce,
        true,
      );
      const registryOp2 = await createRegistryMultisig(
        user.clients.get("le")![1],
        user.aids.get("le")![1],
        [user.aids.get("le")![0], user.aids.get("le")![2]],
        aidLE,
        `leRegistry${user.aids.get("ecr")![0].prefix}`,
        nonce,
      );
      const registryOp3 = await createRegistryMultisig(
        user.clients.get("le")![2],
        user.aids.get("le")![2],
        [user.aids.get("le")![0], user.aids.get("le")![1]],
        aidLE,
        `leRegistry${user.aids.get("ecr")![0].prefix}`,
        nonce,
      );

      await Promise.all([
        waitOperation(user.clients.get("le")![0], registryOp1),
        waitOperation(user.clients.get("le")![1], registryOp2),
        waitOperation(user.clients.get("le")![2], registryOp3),
      ]);

      await waitAndMarkNotification(
        user.clients.get("le")![0],
        "/multisig/vcp",
      );

      [leRegistrybyLAR1, leRegistrybyLAR2, leRegistrybyLAR3] =
        await Promise.all([
          user.clients.get("le")![0].registries().list(aidLE.name),
          user.clients.get("le")![1].registries().list(aidLE.name),
          user.clients.get("le")![2].registries().list(aidLE.name),
        ]);
    }
    assert.equal(leRegistrybyLAR1[0].regk, leRegistrybyLAR2[0].regk);
    assert.equal(leRegistrybyLAR1[0].regk, leRegistrybyLAR3[0].regk);
    assert.equal(leRegistrybyLAR1[0].name, leRegistrybyLAR2[0].name);
    assert.equal(leRegistrybyLAR1[0].name, leRegistrybyLAR3[0].name);
    const leRegistry = leRegistrybyLAR1[0];

    // LE issues a ECR vLEI credential to the ECR Person.
    // Skip if the credential has already been issued.
    let ecrCredbyLAR1 = await getIssuedCredential(
      user.clients.get("le")![0],
      aidLE,
      user.aids.get("ecr")![0],
      ECR_SCHEMA_SAID,
    );
    let ecrCredbyLAR2 = await getIssuedCredential(
      user.clients.get("le")![1],
      aidLE,
      user.aids.get("ecr")![0],
      ECR_SCHEMA_SAID,
    );
    let ecrCredbyLAR3 = await getIssuedCredential(
      user.clients.get("le")![2],
      aidLE,
      user.aids.get("ecr")![0],
      ECR_SCHEMA_SAID,
    );
    if (!(ecrCredbyLAR1 && ecrCredbyLAR2 && ecrCredbyLAR3)) {
      console.log("Issuing ECR vLEI Credential from LE");
      const ecrCredSource = Saider.saidify({
        d: "",
        le: {
          n: leCred.sad.d,
          s: leCred.sad.s,
        },
      })[1];

      const kargsSub: CredentialSubject = {
        i: user.aids.get("ecr")![0].prefix,
        dt: createTimestamp(),
        u: new Salter({}).qb64,
        ...ecrData,
      };
      const kargsIss: CredentialData = {
        u: new Salter({}).qb64,
        i: aidLE.prefix,
        ri: leRegistry.regk,
        s: ECR_SCHEMA_SAID,
        a: kargsSub,
        e: ecrCredSource,
        r: ECR_RULES,
      };

      const IssOp1 = await issueCredentialMultisig(
        user.clients.get("le")![0],
        user.aids.get("le")![0],
        [user.aids.get("le")![1], user.aids.get("le")![2]],
        aidLE.name,
        kargsIss,
        true,
      );
      const IssOp2 = await issueCredentialMultisig(
        user.clients.get("le")![1],
        user.aids.get("le")![1],
        [user.aids.get("le")![0], user.aids.get("le")![2]],
        aidLE.name,
        kargsIss,
      );
      const IssOp3 = await issueCredentialMultisig(
        user.clients.get("le")![2],
        user.aids.get("le")![2],
        [user.aids.get("le")![0], user.aids.get("le")![1]],
        aidLE.name,
        kargsIss,
      );

      await Promise.all([
        waitOperation(user.clients.get("le")![0], IssOp1),
        waitOperation(user.clients.get("le")![1], IssOp2),
        waitOperation(user.clients.get("le")![2], IssOp3),
      ]);

      await waitAndMarkNotification(
        user.clients.get("le")![0],
        "/multisig/iss",
      );

      ecrCredbyLAR1 = await getIssuedCredential(
        user.clients.get("le")![0],
        aidLE,
        user.aids.get("ecr")![0],
        ECR_SCHEMA_SAID,
      );
      ecrCredbyLAR2 = await getIssuedCredential(
        user.clients.get("le")![1],
        aidLE,
        user.aids.get("ecr")![0],
        ECR_SCHEMA_SAID,
      );
      ecrCredbyLAR3 = await getIssuedCredential(
        user.clients.get("le")![2],
        aidLE,
        user.aids.get("ecr")![0],
        ECR_SCHEMA_SAID,
      );

      const grantTime = createTimestamp();
      await grantMultisig(
        user.clients.get("le")![0],
        user.aids.get("le")![0],
        [user.aids.get("le")![1], user.aids.get("le")![2]],
        aidLE,
        user.aids.get("ecr")![0],
        ecrCredbyLAR1,
        grantTime,
        true,
      );
      await grantMultisig(
        user.clients.get("le")![1],
        user.aids.get("le")![1],
        [user.aids.get("le")![0], user.aids.get("le")![2]],
        aidLE,
        user.aids.get("ecr")![0],
        ecrCredbyLAR2,
        grantTime,
      );
      await grantMultisig(
        user.clients.get("le")![2],
        user.aids.get("le")![2],
        [user.aids.get("le")![0], user.aids.get("le")![1]],
        aidLE,
        user.aids.get("ecr")![0],
        ecrCredbyLAR3,
        grantTime,
      );

      await waitAndMarkNotification(
        user.clients.get("le")![0],
        "/multisig/exn",
      );
    }
    assert.equal(ecrCredbyLAR1.sad.d, ecrCredbyLAR2.sad.d);
    assert.equal(ecrCredbyLAR1.sad.d, ecrCredbyLAR3.sad.d);
    assert.equal(ecrCredbyLAR1.sad.s, ECR_SCHEMA_SAID);
    assert.equal(ecrCredbyLAR1.sad.i, aidLE.prefix);
    assert.equal(ecrCredbyLAR1.sad.a.i, user.aids.get("ecr")![0].prefix);
    assert.equal(ecrCredbyLAR1.status.s, "0");
    assert(ecrCredbyLAR1.atc !== undefined);
    const ecrCred = ecrCredbyLAR1;
    console.log(
      "LE has issued an ECR vLEI credential with SAID:",
      ecrCred.sad.d,
    );

    // LE and ECR Person exchange grant and admit messages.
    // Skip if ECR Person has already received the credential.
    let ecrCredbyECR = await getReceivedCredential(
      user.clients.get("ecr")![0],
      ecrCred.sad.d,
    );
    if (!ecrCredbyECR) {
      await admitSinglesig(
        user.clients.get("ecr")![0],
        user.aids.get("ecr")![0].name,
        aidLE,
      );
      await waitAndMarkNotification(
        user.clients.get("le")![0],
        "/exn/ipex/admit",
      );
      await waitAndMarkNotification(
        user.clients.get("le")![1],
        "/exn/ipex/admit",
      );
      await waitAndMarkNotification(
        user.clients.get("le")![2],
        "/exn/ipex/admit",
      );

      ecrCredbyECR = await waitForCredential(
        user.clients.get("ecr")![0],
        ecrCred.sad.d,
      );
    }
    assert.equal(ecrCred.sad.d, ecrCredbyECR.sad.d);
  }

  // Issue singlesig credentials
  private async singleSigVleiIssuance(user: User) {
    const qviData = {
      LEI: "254900OPPU84GM83MG36",
    };

    const leData = {
      LEI: user.LE,
    };
    const ecrData = {
      LEI: leData.LEI,
      personLegalName: "John Doe",
      engagementContextRole: "EBA Data Submitter",
    };
    const ecrAuthData = {
      AID: "",
      LEI: ecrData.LEI,
      personLegalName: ecrData.personLegalName,
      engagementContextRole: ecrData.engagementContextRole,
    };

    const oorData = {
      LEI: leData.LEI,
      personLegalName: "John Doe",
      officialRole: "HR Manager",
    };

    const oorAuthData = {
      AID: "",
      LEI: oorData.LEI,
      personLegalName: oorData.personLegalName,
      officialRole: oorData.officialRole,
    };
    const kargsAID = {
      toad: witnessIds.length,
      wits: witnessIds,
    };

    const [gleifRegistry, qviRegistry, leRegistry] = await Promise.all([
      getOrCreateRegistry(
        user.clients.get("gleif")![0],
        user.aids.get("gleif")![0],
        "gleifRegistry",
      ),
      getOrCreateRegistry(
        user.clients.get("qvi")![0],
        user.aids.get("qvi")![0],
        "qviRegistry",
      ),
      getOrCreateRegistry(
        user.clients.get("le")![0],
        user.aids.get("le")![0],
        `leRegistry${user.aids.get("ecr")![0].prefix}`,
      ),
    ]);

    console.log("Issuing QVI vLEI Credential");
    const qviCred = await getOrIssueCredential(
      user.clients.get("gleif")![0],
      user.aids.get("gleif")![0],
      user.aids.get("qvi")![0],
      gleifRegistry,
      qviData,
      QVI_SCHEMA_SAID,
    );

    let qviCredHolder = await getReceivedCredential(
      user.clients.get("qvi")![0],
      qviCred.sad.d,
    );

    if (!qviCredHolder) {
      await sendGrantMessage(
        user.clients.get("gleif")![0],
        user.aids.get("gleif")![0],
        user.aids.get("qvi")![0],
        qviCred,
      );
      await sendAdmitMessage(
        user.clients.get("qvi")![0],
        user.aids.get("qvi")![0],
        user.aids.get("gleif")![0],
      );

      qviCredHolder = await retry(async () => {
        const cred = await getReceivedCredential(
          user.clients.get("qvi")![0],
          qviCred.sad.d,
        );
        assert(cred !== undefined);
        return cred;
      }, CRED_RETRY_DEFAULTS);
    }

    assert.equal(qviCredHolder.sad.d, qviCred.sad.d);
    assert.equal(qviCredHolder.sad.s, QVI_SCHEMA_SAID);
    assert.equal(qviCredHolder.sad.i, user.aids.get("gleif")![0].prefix);
    assert.equal(qviCredHolder.sad.a.i, user.aids.get("qvi")![0].prefix);
    assert.equal(qviCredHolder.status.s, "0");
    assert(qviCredHolder.atc !== undefined);

    console.log("Issuing LE vLEI Credential");
    const leCredSource = Saider.saidify({
      d: "",
      qvi: {
        n: qviCred.sad.d,
        s: qviCred.sad.s,
      },
    })[1];

    const leCred = await getOrIssueCredential(
      user.clients.get("qvi")![0],
      user.aids.get("qvi")![0],
      user.aids.get("le")![0],
      qviRegistry,
      leData,
      LE_SCHEMA_SAID,
      LE_RULES,
      leCredSource,
    );

    let leCredHolder = await getReceivedCredential(
      user.clients.get("le")![0],
      leCred.sad.d,
    );

    if (!leCredHolder) {
      await sendGrantMessage(
        user.clients.get("qvi")![0],
        user.aids.get("qvi")![0],
        user.aids.get("le")![0],
        leCred,
      );
      await sendAdmitMessage(
        user.clients.get("le")![0],
        user.aids.get("le")![0],
        user.aids.get("qvi")![0],
      );

      leCredHolder = await retry(async () => {
        const cred = await getReceivedCredential(
          user.clients.get("le")![0],
          leCred.sad.d,
        );
        assert(cred !== undefined);
        return cred;
      }, CRED_RETRY_DEFAULTS);
    }

    assert.equal(leCredHolder.sad.d, leCred.sad.d);
    assert.equal(leCredHolder.sad.s, LE_SCHEMA_SAID);
    assert.equal(leCredHolder.sad.i, user.aids.get("qvi")![0].prefix);
    assert.equal(leCredHolder.sad.a.i, user.aids.get("le")![0].prefix);
    assert.equal(leCredHolder.sad.e.qvi.n, qviCred.sad.d);
    assert.equal(leCredHolder.status.s, "0");
    assert(leCredHolder.atc !== undefined);

    console.log("Issuing ECR vLEI Credential from LE");
    const ecrCredSource = Saider.saidify({
      d: "",
      le: {
        n: leCred.sad.d,
        s: leCred.sad.s,
      },
    })[1];

    const ecrCred = await getOrIssueCredential(
      user.clients.get("le")![0],
      user.aids.get("le")![0],
      user.aids.get("ecr")![0],
      leRegistry,
      ecrData,
      ECR_SCHEMA_SAID,
      ECR_RULES,
      ecrCredSource,
      true,
    );

    let ecrCredHolder = await getReceivedCredential(
      user.clients.get("ecr")![0],
      ecrCred.sad.d,
    );

    if (!ecrCredHolder) {
      await sendGrantMessage(
        user.clients.get("le")![0],
        user.aids.get("le")![0],
        user.aids.get("ecr")![0],
        ecrCred,
      );
      await sendAdmitMessage(
        user.clients.get("ecr")![0],
        user.aids.get("ecr")![0],
        user.aids.get("le")![0],
      );

      ecrCredHolder = await retry(async () => {
        const cred = await getReceivedCredential(
          user.clients.get("ecr")![0],
          ecrCred.sad.d,
        );
        assert(cred !== undefined);
        return cred;
      }, CRED_RETRY_DEFAULTS);
    }

    assert.equal(ecrCredHolder.sad.d, ecrCred.sad.d);
    assert.equal(ecrCredHolder.sad.s, ECR_SCHEMA_SAID);
    assert.equal(ecrCredHolder.sad.i, user.aids.get("le")![0].prefix);
    assert.equal(ecrCredHolder.sad.a.i, user.aids.get("ecr")![0].prefix);
    assert.equal(ecrCredHolder.sad.e.le.n, leCred.sad.d);
    assert.equal(ecrCredHolder.status.s, "0");
    assert(ecrCredHolder.atc !== undefined);

    console.log("Issuing ECR AUTH vLEI Credential");
    ecrAuthData.AID = user.aids.get("ecr")![0].prefix;
    const ecrAuthCredSource = Saider.saidify({
      d: "",
      le: {
        n: leCred.sad.d,
        s: leCred.sad.s,
      },
    })[1];

    const roleAidPrefix =
      user.aids.get("qvi")![0].prefix + user.aids.get("ecr")![0].prefix;
    const ecrAuthCred = await getOrIssueAuthCredential(
      user.clients.get("le")![0],
      user.aids.get("le")![0],
      user.aids.get("qvi")![0],
      user.aids.get("ecr")![0],
      leRegistry,
      ecrAuthData,
      ECR_AUTH_SCHEMA_SAID,
      ECR_AUTH_RULES,
      ecrAuthCredSource,
    );

    let ecrAuthCredHolder = await getReceivedCredential(
      user.clients.get("qvi")![0],
      ecrAuthCred.sad.d,
    );

    if (!ecrAuthCredHolder) {
      await sendGrantMessage(
        user.clients.get("le")![0],
        user.aids.get("le")![0],
        user.aids.get("qvi")![0],
        ecrAuthCred,
      );
      await sendAdmitMessage(
        user.clients.get("qvi")![0],
        user.aids.get("qvi")![0],
        user.aids.get("le")![0],
      );

      ecrAuthCredHolder = await retry(async () => {
        const cred = await getReceivedCredential(
          user.clients.get("qvi")![0],
          ecrAuthCred.sad.d,
        );
        assert(cred !== undefined);
        return cred;
      }, CRED_RETRY_DEFAULTS);
    }

    assert.equal(ecrAuthCredHolder.sad.d, ecrAuthCred.sad.d);
    assert.equal(ecrAuthCredHolder.sad.s, ECR_AUTH_SCHEMA_SAID);
    assert.equal(ecrAuthCredHolder.sad.i, user.aids.get("le")![0].prefix);
    assert.equal(ecrAuthCredHolder.sad.a.i, user.aids.get("qvi")![0].prefix);
    assert.equal(ecrAuthCredHolder.sad.a.AID, user.aids.get("ecr")![0].prefix);
    assert.equal(ecrAuthCredHolder.sad.e.le.n, leCred.sad.d);
    assert.equal(ecrAuthCredHolder.status.s, "0");
    assert(ecrAuthCredHolder.atc !== undefined);

    console.log("Issuing ECR vLEI Credential from ECR AUTH");
    const ecrCredSource2 = Saider.saidify({
      d: "",
      auth: {
        n: ecrAuthCred.sad.d,
        s: ecrAuthCred.sad.s,
        o: "I2I",
      },
    })[1];

    const ecrCred2 = await getOrIssueCredential(
      user.clients.get("qvi")![0],
      user.aids.get("qvi")![0],
      user.aids.get("ecr")![0],
      qviRegistry,
      ecrData,
      ECR_SCHEMA_SAID,
      ECR_RULES,
      ecrCredSource2,
      true,
    );

    let ecrCredHolder2 = await getReceivedCredential(
      user.clients.get("ecr")![0],
      ecrCred2.sad.d,
    );

    if (!ecrCredHolder2) {
      await sendGrantMessage(
        user.clients.get("qvi")![0],
        user.aids.get("qvi")![0],
        user.aids.get("ecr")![0],
        ecrCred2,
      );
      await sendAdmitMessage(
        user.clients.get("ecr")![0],
        user.aids.get("ecr")![0],
        user.aids.get("qvi")![0],
      );

      ecrCredHolder2 = await retry(async () => {
        const cred = await getReceivedCredential(
          user.clients.get("ecr")![0],
          ecrCred2.sad.d,
        );
        assert(cred !== undefined);
        return cred;
      }, CRED_RETRY_DEFAULTS);
    }

    assert.equal(ecrCredHolder2.sad.d, ecrCred2.sad.d);
    assert.equal(ecrCredHolder2.sad.s, ECR_SCHEMA_SAID);
    assert.equal(ecrCredHolder2.sad.i, user.aids.get("qvi")![0].prefix);
    assert.equal(ecrCredHolder2.sad.e.auth.n, ecrAuthCred.sad.d);
    assert.equal(ecrCredHolder2.status.s, "0");
    assert(ecrCredHolder2.atc !== undefined);

    console.log("Issuing OOR AUTH vLEI Credential");
    oorAuthData.AID = user.aids.get("ecr")![0].prefix;
    const oorAuthCredSource = Saider.saidify({
      d: "",
      le: {
        n: leCred.sad.d,
        s: leCred.sad.s,
      },
    })[1];

    const oorAuthCred = await getOrIssueAuthCredential(
      user.clients.get("le")![0],
      user.aids.get("le")![0],
      user.aids.get("qvi")![0],
      user.aids.get("ecr")![0],
      leRegistry,
      oorAuthData,
      OOR_AUTH_SCHEMA_SAID,
      OOR_AUTH_RULES,
      oorAuthCredSource,
    );

    let oorAuthCredHolder = await getReceivedCredential(
      user.clients.get("qvi")![0],
      oorAuthCred.sad.d,
    );

    if (!oorAuthCredHolder) {
      await sendGrantMessage(
        user.clients.get("le")![0],
        user.aids.get("le")![0],
        user.aids.get("qvi")![0],
        oorAuthCred,
      );
      await sendAdmitMessage(
        user.clients.get("qvi")![0],
        user.aids.get("qvi")![0],
        user.aids.get("le")![0],
      );

      oorAuthCredHolder = await retry(async () => {
        const cred = await getReceivedCredential(
          user.clients.get("qvi")![0],
          oorAuthCred.sad.d,
        );
        assert(cred !== undefined);
        return cred;
      }, CRED_RETRY_DEFAULTS);
    }

    assert.equal(oorAuthCredHolder.sad.d, oorAuthCred.sad.d);
    assert.equal(oorAuthCredHolder.sad.s, OOR_AUTH_SCHEMA_SAID);
    assert.equal(oorAuthCredHolder.sad.i, user.aids.get("le")![0].prefix);
    assert.equal(oorAuthCredHolder.sad.a.i, user.aids.get("qvi")![0].prefix);
    assert.equal(oorAuthCredHolder.sad.a.AID, user.aids.get("ecr")![0].prefix);
    assert.equal(oorAuthCredHolder.sad.e.le.n, leCred.sad.d);
    assert.equal(oorAuthCredHolder.status.s, "0");
    assert(oorAuthCredHolder.atc !== undefined);

    console.log("Issuing OOR vLEI Credential from OOR AUTH");
    const oorCredSource = Saider.saidify({
      d: "",
      auth: {
        n: oorAuthCred.sad.d,
        s: oorAuthCred.sad.s,
        o: "I2I",
      },
    })[1];

    const oorCred = await getOrIssueCredential(
      user.clients.get("qvi")![0],
      user.aids.get("qvi")![0],
      user.aids.get("ecr")![0],
      qviRegistry,
      oorData,
      OOR_SCHEMA_SAID,
      OOR_RULES,
      oorCredSource,
    );

    let oorCredHolder = await getReceivedCredential(
      user.clients.get("ecr")![0],
      oorCred.sad.d,
    );

    if (!oorCredHolder) {
      await sendGrantMessage(
        user.clients.get("qvi")![0],
        user.aids.get("qvi")![0],
        user.aids.get("ecr")![0],
        oorCred,
      );
      await sendAdmitMessage(
        user.clients.get("ecr")![0],
        user.aids.get("ecr")![0],
        user.aids.get("qvi")![0],
      );

      oorCredHolder = await retry(async () => {
        const cred = await getReceivedCredential(
          user.clients.get("ecr")![0],
          oorCred.sad.d,
        );
        assert(cred !== undefined);
        return cred;
      }, CRED_RETRY_DEFAULTS);
    }

    assert.equal(oorCredHolder.sad.d, oorCred.sad.d);
    assert.equal(oorCredHolder.sad.s, OOR_SCHEMA_SAID);
    assert.equal(oorCredHolder.sad.i, user.aids.get("qvi")![0].prefix);
    assert.equal(oorCredHolder.sad.e.auth.n, oorAuthCred.sad.d);
    assert.equal(oorCredHolder.status.s, "0");
    assert(oorCredHolder.atc !== undefined);

    await assertOperations(
      user.clients.get("gleif")![0],
      user.clients.get("qvi")![0],
      user.clients.get("le")![0],
      user.clients.get("ecr")![0],
    );
    await warnNotifications(
      user.clients.get("gleif")![0],
      user.clients.get("qvi")![0],
      user.clients.get("le")![0],
      user.clients.get("ecr")![0],
    );
  }
}

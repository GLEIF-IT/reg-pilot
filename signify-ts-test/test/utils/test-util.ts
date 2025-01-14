import signify, {
  CreateIdentiferArgs,
  EventResult,
  HabState,
  Operation,
  randomPasscode,
  ready,
  Salter,
  Serder,
  SignifyClient,
  Tier,
} from "signify-ts";
import { RetryOptions, retry } from "./retry";
import assert from "assert";
import { resolveEnvironment } from "../../src/utils/resolve-env";
import Docker from "dockerode";
import axios from "axios";

const docker = new Docker();

export interface Aid {
  name: string;
  prefix: string;
  oobi: string;
}

export interface Notification {
  i: string;
  dt: string;
  r: boolean;
  a: { r: string; d?: string; m?: string };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function admitSinglesig(
  client: SignifyClient,
  aidName: string,
  recipientAid: HabState
) {
  const grantMsgSaid = await waitAndMarkNotification(client, "/exn/ipex/grant");

  const [admit, sigs, aend] = await client.ipex().admit({
    senderName: aidName,
    message: "",
    grantSaid: grantMsgSaid,
    recipient: recipientAid.prefix,
  });

  await client
    .ipex()
    .submitAdmit(aidName, admit, sigs, aend, [recipientAid.prefix]);
}

/**
 * Assert that all operations were waited for.
 * <p>This is a postcondition check to make sure all long-running operations have been waited for
 * @see waitOperation
 */
export async function assertOperations(
  ...clients: SignifyClient[]
): Promise<void> {
  for (const client of clients) {
    const operations = await client.operations().list();
    expect(operations).toHaveLength(0);
  }
}

/**
 * Assert that all notifications were handled.
 * <p>This is a postcondition check to make sure all notifications have been handled
 * @see markNotification
 * @see markAndRemoveNotification
 */
export async function assertNotifications(
  ...clients: SignifyClient[]
): Promise<void> {
  for (const client of clients) {
    const res = await client.notifications().list();
    const notes = res.notes.filter((i: { r: boolean }) => i.r === false);
    expect(notes).toHaveLength(0);
  }
}

export async function createAid(
  client: SignifyClient,
  name: string
): Promise<Aid> {
  const [prefix, oobi] = await getOrCreateIdentifier(client, name);
  return { prefix, oobi, name };
}

export async function createAID(client: signify.SignifyClient, name: string) {
  await getOrCreateIdentifier(client, name);
  const aid = await client.identifiers().get(name);
  console.log(name, "AID:", aid.prefix);
  return aid;
}

export function createTimestamp() {
  return new Date().toISOString().replace("Z", "000+00:00");
}

/**
 * Get list of end role authorizations for a Keri idenfitier
 */
export async function getEndRoles(
  client: SignifyClient,
  alias: string,
  role?: string
): Promise<any> {
  const path =
    role !== undefined
      ? `/identifiers/${alias}/endroles/${role}`
      : `/identifiers/${alias}/endroles`;
  const response: Response = await client.fetch(path, "GET", null);
  if (!response.ok) throw new Error(await response.text());
  const result = await response.json();
  // console.log("getEndRoles", result);
  return result;
}

export async function getGrantedCredential(
  client: SignifyClient,
  credId: string
): Promise<any> {
  const credentialList = await client.credentials().list({
    filter: { "-d": credId },
  });
  let credential: any;
  if (credentialList.length > 0) {
    assert.equal(credentialList.length, 1);
    credential = credentialList[0];
  }
  return credential;
}

export async function getIssuedCredential(
  issuerClient: SignifyClient,
  issuerAID: HabState,
  recipientAID: HabState,
  schemaSAID: string
) {
  const credentialList = await issuerClient.credentials().list({
    filter: {
      "-i": issuerAID.prefix,
      "-s": schemaSAID,
      "-a-i": recipientAID.prefix,
    },
  });
  assert(credentialList.length <= 1);
  return credentialList[0];
}

export async function getOrCreateAID(
  client: SignifyClient,
  name: string,
  kargs: CreateIdentiferArgs
): Promise<HabState> {
  try {
    return await client.identifiers().get(name);
  } catch {
    console.log("Creating AID", name, ": ", kargs);
    const result: EventResult = await client.identifiers().create(name, kargs);

    await waitOperation(client, await result.op());
    const aid = await client.identifiers().get(name);

    const op = await client
      .identifiers()
      .addEndRole(name, "agent", client!.agent!.pre);
    await waitOperation(client, await op.op());
    console.log(name, "AID:", aid.prefix);
    return aid;
  }
}

/**
 * Connect or boot a SignifyClient instance
 */
export async function getOrCreateClient(
  bran: string | undefined = undefined,
  getOnly: boolean = false
): Promise<SignifyClient> {
  const env = resolveEnvironment();
  await ready();
  bran ??= randomPasscode();
  bran = bran.padEnd(21, "_");
  const client = new SignifyClient(env.url, bran, Tier.low, env.bootUrl);
  try {
    await client.connect();
  } catch (e: any) {
    if (!getOnly) {
      const res = await client.boot();
      if (!res.ok) throw new Error();
      await client.connect();
    } else {
      throw new Error(
        "Could not connect to client w/ bran " + bran + e.message
      );
    }
  }
  console.log("client", {
    agent: client.agent?.pre,
    controller: client.controller.pre,
  });
  return client;
}

/**
 * Connect or boot a number of SignifyClient instances
 * @example
 * <caption>Create two clients with random secrets</caption>
 * let client1: SignifyClient, client2: SignifyClient;
 * beforeAll(async () => {
 *   [client1, client2] = await getOrCreateClients(2);
 * });
 * @example
 * <caption>Launch jest from shell with pre-defined secrets</caption>
 */
export async function getOrCreateClients(
  count: number,
  brans: string[] | undefined = undefined,
  getOnly: boolean = false
): Promise<SignifyClient[]> {
  const tasks: Promise<SignifyClient>[] = [];
  for (let i = 0; i < count; i++) {
    tasks.push(getOrCreateClient(brans?.at(i) ?? undefined, getOnly));
  }
  const clients: SignifyClient[] = await Promise.all(tasks);
  console.log(`secrets="${clients.map((i) => i.bran).join(",")}"`);
  return clients;
}

/**
 * Get or resolve a Keri contact
 * @example
 * <caption>Create a Keri contact before running tests</caption>
 * let contact1_id: string;
 * beforeAll(async () => {
 *   contact1_id = await getOrCreateContact(client2, "contact1", name1_oobi);
 * });
 */
export async function getOrCreateContact(
  client: SignifyClient,
  name: string,
  oobi: string
): Promise<string> {
  const list = await client.contacts().list(undefined, "alias", `^${name}$`);
  // console.log("contacts.list", list);
  if (list.length > 0) {
    const contact = list[0];
    if (contact.oobi === oobi) {
      // console.log("contacts.id", contact.id);
      return contact.id;
    }
  }
  let op = await client.oobis().resolve(oobi, name);
  op = await waitOperation(client, op);
  return op.response.i;
}

/**
 * Get or create a Keri identifier. Uses default witness config from `resolveEnvironment`
 * @example
 * <caption>Create a Keri identifier before running tests</caption>
 * let name1_id: string, name1_oobi: string;
 * beforeAll(async () => {
 *   [name1_id, name1_oobi] = await getOrCreateIdentifier(client1, "name1");
 * });
 * @see resolveEnvironment
 */
export async function getOrCreateIdentifier(
  client: SignifyClient,
  name: string,
  kargs: CreateIdentiferArgs | undefined = undefined
): Promise<[string, string]> {
  let id: any = undefined;
  try {
    const identfier = await client.identifiers().get(name);
    // console.log("identifiers.get", identfier);
    id = identfier.prefix;
  } catch {
    const env = resolveEnvironment();
    kargs ??=
      env.witnessIds.length > 0
        ? { toad: env.witnessIds.length, wits: env.witnessIds }
        : {};
    const result: EventResult = await client.identifiers().create(name, kargs);
    let op = await result.op();
    op = await waitOperation(client, op);
    // console.log("identifiers.create", op);
    id = op.response.i;
  }
  const eid = client.agent?.pre!;
  if (!(await hasEndRole(client, name, "agent", eid))) {
    const result: EventResult = await client
      .identifiers()
      .addEndRole(name, "agent", eid);
    let op = await result.op();
    op = await waitOperation(client, op);
    console.log("identifiers.addEndRole", op);
  }

  const oobi = await client.oobis().get(name, "agent");
  const result: [string, string] = [id, oobi.oobis[0]];
  console.log(name, result);
  return result;
}

export async function getOrIssueCredential(
  issuerClient: SignifyClient,
  issuerAid: Aid,
  recipientAid: Aid,
  issuerRegistry: { regk: string },
  credData: any,
  schema: string,
  rules?: any,
  source?: any,
  privacy = false
): Promise<any> {
  const credentialList = await issuerClient.credentials().list();

  if (credentialList.length > 0) {
    const credential = credentialList.find(
      (cred: any) =>
        cred.sad.s === schema &&
        cred.sad.i === issuerAid.prefix &&
        cred.sad.a.i === recipientAid.prefix &&
        cred.sad.a.AID === credData.AID! &&
        cred.status.et != "rev"
    );
    if (credential) return credential;
  }

  const issResult = await issuerClient.credentials().issue(issuerAid.name, {
    ri: issuerRegistry.regk,
    s: schema,
    u: privacy ? new Salter({}).qb64 : undefined,
    a: {
      i: recipientAid.prefix,
      u: privacy ? new Salter({}).qb64 : undefined,
      ...credData,
    },
    r: rules,
    e: source,
  });

  await waitOperation(issuerClient, issResult.op);
  const credential = await issuerClient.credentials().get(issResult.acdc.ked.d);

  return credential;
}

export async function revokeCredential(
  issuerClient: SignifyClient,
  issuerAid: Aid,
  credentialSaid: string
): Promise<any> {
  const credentialList = await issuerClient.credentials().list();

  const revResult = await issuerClient
    .credentials()
    .revoke(issuerAid.name, credentialSaid);

  await waitOperation(issuerClient, revResult.op);
  const credential = await issuerClient.credentials().get(credentialSaid);

  return credential;
}

export async function getStates(client: SignifyClient, prefixes: string[]) {
  const participantStates = await Promise.all(
    prefixes.map((p) => client.keyStates().get(p))
  );
  return participantStates.map((s: any[]) => s[0]);
}

/**
 * Test if end role is authorized for a Keri identifier
 */
export async function hasEndRole(
  client: SignifyClient,
  alias: string,
  role: string,
  eid: string
): Promise<boolean> {
  const list = await getEndRoles(client, alias, role);
  for (const i of list) {
    if (i.role === role && i.eid === eid) {
      return true;
    }
  }
  return false;
}

/**
 * Logs a warning for each un-handled notification.
 * <p>Replace warnNotifications with assertNotifications when test handles all notifications
 * @see assertNotifications
 */
export async function warnNotifications(
  ...clients: SignifyClient[]
): Promise<void> {
  let count = 0;
  for (const client of clients) {
    const res = await client.notifications().list();
    const notes = res.notes.filter((i: { r: boolean }) => i.r === false);
    if (notes.length > 0) {
      count += notes.length;
      console.warn("notifications", notes);
    }
  }
  expect(count).toBeGreaterThan(0); // replace warnNotifications with assertNotifications
}

export async function deleteOperations<T = any>(
  client: SignifyClient,
  op: Operation<T>
) {
  if (op.metadata?.depends) {
    await deleteOperations(client, op.metadata.depends);
  }

  await client.operations().delete(op.name);
}

export async function getReceivedCredential(
  client: SignifyClient,
  credId: string
): Promise<any> {
  const credentialList = await client.credentials().list({
    filter: {
      "-d": credId,
    },
  });
  let credential: any;
  if (credentialList.length > 0) {
    assert.equal(credentialList.length, 1);
    credential = credentialList[0];
  }
  return credential;
}

/**
 * Mark and remove notification.
 */
export async function markAndRemoveNotification(
  client: SignifyClient,
  note: Notification
): Promise<void> {
  try {
    await client.notifications().mark(note.i);
  } finally {
    await client.notifications().delete(note.i);
  }
}

/**
 * Mark notification as read.
 */
export async function markNotification(
  client: SignifyClient,
  note: Notification
): Promise<void> {
  await client.notifications().mark(note.i);
}

export async function resolveOobi(
  client: SignifyClient,
  oobi: string,
  alias?: string
) {
  const op = await client.oobis().resolve(oobi, alias);
  await waitOperation(client, op);
}

export async function waitForCredential(
  client: SignifyClient,
  credSAID: string,
  MAX_RETRIES: number = 10
) {
  let retryCount = 0;
  while (retryCount < MAX_RETRIES) {
    const cred = await getReceivedCredential(client, credSAID);
    if (cred) return cred;

    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log(` retry-${retryCount}: No credentials yet...`);
    retryCount = retryCount + 1;
  }
  throw Error("Credential SAID: " + credSAID + " has not been received");
}

export async function waitAndMarkNotification(
  client: SignifyClient,
  route: string
) {
  const notes = await waitForNotifications(client, route);

  await Promise.all(
    notes.map((note) => {
      client.notifications().mark(note.i);
    })
  );

  return notes[notes.length - 1]?.a.d ?? "";
}

export async function waitForNotifications(
  client: SignifyClient,
  route: string,
  options: RetryOptions = {}
): Promise<Notification[]> {
  return retry(async () => {
    const response: { notes: Notification[] } = await client
      .notifications()
      .list();

    const notes = response.notes.filter(
      (note) => note.a.r === route && note.r === false
    );

    if (!notes.length) {
      throw new Error(`No notifications with route ${route}`);
    }

    return notes;
  }, options);
}

/**
 * Poll for operation to become completed.
 * Removes completed operation
 */
export async function waitOperation<T = any>(
  client: SignifyClient,
  op: Operation<T> | string,
  signal?: AbortSignal
): Promise<Operation<T>> {
  if (typeof op === "string") {
    op = await client.operations().get(op);
  }

  const oplist = await client.operations().list();
  op = await client
    .operations()
    .wait(op, { signal: signal ?? AbortSignal.timeout(60000) });
  await deleteOperations(client, op);

  return op;
}

export async function getOrCreateRegistry(
  client: SignifyClient,
  aid: Aid,
  registryName: string
): Promise<{ name: string; regk: string }> {
  let registries = await client.registries().list(aid.name);
  registries = registries.filter(
    (reg: { name: string }) => reg.name == registryName
  );
  if (registries.length > 0) {
    assert.equal(registries.length, 1);
  } else {
    const regResult = await client
      .registries()
      .create({ name: aid.name, registryName: registryName });
    await waitOperation(client, await regResult.op());
    registries = await client.registries().list(aid.name);
    registries = registries.filter(
      (reg: { name: string }) => reg.name == registryName
    );
  }
  console.log(registries);

  return registries[0];
}

export async function sendGrantMessage(
  senderClient: SignifyClient,
  senderAid: Aid,
  recipientAid: Aid,
  credential: any
) {
  const [grant, gsigs, gend] = await senderClient.ipex().grant({
    senderName: senderAid.name,
    acdc: new Serder(credential.sad),
    anc: new Serder(credential.anc),
    iss: new Serder(credential.iss),
    ancAttachment: credential.ancAttachment,
    recipient: recipientAid.prefix,
    datetime: createTimestamp(),
  });

  let op = await senderClient
    .ipex()
    .submitGrant(senderAid.name, grant, gsigs, gend, [recipientAid.prefix]);
  op = await waitOperation(senderClient, op);
}

export async function sendAdmitMessage(
  senderClient: SignifyClient,
  senderAid: Aid,
  recipientAid: Aid
) {
  const notifications = await waitForNotifications(
    senderClient,
    "/exn/ipex/grant"
  );
  assert.equal(notifications.length, 1);
  const grantNotification = notifications[0];

  const [admit, sigs, aend] = await senderClient.ipex().admit({
    senderName: senderAid.name,
    message: "",
    grantSaid: grantNotification.a.d!,
    recipient: recipientAid.prefix,
    datetime: createTimestamp(),
  });

  let op = await senderClient
    .ipex()
    .submitAdmit(senderAid.name, admit, sigs, aend, [recipientAid.prefix]);
  op = await waitOperation(senderClient, op);

  await markAndRemoveNotification(senderClient, grantNotification);
}

export async function launchTestKeria(
  kontainerName: string,
  kimageName: string,
  keriaAdminPort: number = 3901,
  keriaHttpPort: number = 3902,
  keriaBootPort: number = 3903
): Promise<Docker.Container> {
  // Check if the container is already running
  const containers = await docker.listContainers({ all: true });
  let container: Docker.Container;

  // Check if any container is using the specified ports
  const portInUse = containers.find((c) => {
    const ports = c.Ports.map((p) => p.PublicPort);
    return (
      ports.includes(keriaAdminPort) ||
      ports.includes(keriaHttpPort) ||
      ports.includes(keriaBootPort)
    );
  });
  if (portInUse) {
    const pContainer = docker.getContainer(portInUse.Id);
    console.warn(
      `Warning: One of the specified ports (${keriaAdminPort}, ${keriaHttpPort}, ${keriaBootPort}) is already in use. Stopping that one\n` +
        `Container ID: ${portInUse.Id}\n` +
        `Container Names: ${portInUse.Names.join(", ")}\n` +
        `Container Image: ${portInUse.Image}\n` +
        `Container State: ${portInUse.State}\n` +
        `Container Status: ${portInUse.Status}`
    );
    await pContainer.stop();
  }

  const existingContainer = containers.find((c) =>
    c.Names.includes(`/${kontainerName}`)
  );
  if (existingContainer) {
    if (existingContainer.State === "running") {
      console.warn(
        `Warning: Container with name ${kontainerName} is already running.\n` +
          `Container ID: ${existingContainer.Id}\n` +
          `Container Names: ${existingContainer.Names.join(", ")}\n` +
          `Container Image: ${existingContainer.Image}\n` +
          `Container State: ${existingContainer.State}\n` +
          `Container Status: ${existingContainer.Status}`
      );
      container = docker.getContainer(existingContainer.Id);
    } else {
      console.warn(
        `Warning: Container with name ${kontainerName} exists but is not running. Starting the container.\n` +
          `Container ID: ${existingContainer.Id}\n` +
          `Container Names: ${existingContainer.Names.join(", ")}\n` +
          `Container Image: ${existingContainer.Image}\n` +
          `Container State: ${existingContainer.State}\n` +
          `Container Status: ${existingContainer.Status}`
      );
      container = docker.getContainer(existingContainer.Id);
      await container.start();
    }
  } else {
    // Pull Docker image
    await new Promise<void>((resolve, reject) => {
      docker.pull(kimageName, (err: any, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, onFinished, onProgress);

        function onFinished(err: any, output: any) {
          if (err) return reject(err);
          resolve();
        }

        function onProgress(event: any) {
          console.log(event);
        }
      });
    });

    // Create and start the container
    container = await docker.createContainer({
      name: kontainerName,
      Image: kimageName,
      ExposedPorts: {
        [`${keriaAdminPort}/tcp`]: {},
        [`${keriaHttpPort}/tcp`]: {},
        [`${keriaBootPort}/tcp`]: {},
      },
      HostConfig: {
        PortBindings: {
          [`${keriaAdminPort}/tcp`]: [{ HostPort: `${keriaAdminPort}` }],
          [`${keriaHttpPort}/tcp`]: [{ HostPort: `${keriaHttpPort}` }],
          [`${keriaBootPort}/tcp`]: [{ HostPort: `${keriaBootPort}` }],
        },
      },
    });
    await container.start();
  }

  await performHealthCheck(`http://localhost:${keriaHttpPort}/spec.yaml`);
  return container;
}

// Function to perform health check
async function performHealthCheck(
  url: string,
  timeout: number = 12000,
  interval: number = 1000
) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await axios.get(url);
      if (response.status === 200) {
        console.log("Service is healthy");
        return;
      }
    } catch (error) {
      console.log(`Waiting for service to be healthy ${url}: ${error}`);
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error("Service did not become healthy in time");
}

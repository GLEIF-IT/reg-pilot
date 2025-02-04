import { strict as assert } from "assert";
import signify from "signify-ts";
import {
  assertNotifications,
  assertOperations,
  createAID,
  createTimestamp,
  getOrCreateClient,
  getOrCreateContact,
  markAndRemoveNotification,
  resolveOobi,
  waitAndMarkNotification,
  waitForNotifications,
  waitOperation,
} from "../src/utils/test-util";
import {
  acceptMultisigIncept,
  addEndRoleMultisig,
  delegateMultisig,
  startMultisigIncept,
} from "../src/utils/multisig-utils";
import { step } from "../src/utils/test-step";
import {
  KeriaConfig,
  TestEnvironment,
  TestKeria,
  TestPaths,
} from "../src/utils/resolve-env";
import path from "path";

const delegatorGroupName = "delegator_group";
const delegateeGroupName = "delegatee_group";
const delegator1Name = "delegator1";
const delegator2Name = "delegator2";
const delegatee1Name = "delegatee1";
const delegatee2Name = "delegatee2";

let testKeria: TestKeria;

beforeAll(async () => {
  await signify.ready();
  const testPaths = TestPaths.getInstance(
    "delegation-multisig",
    path.join(process.cwd(), "docker-compose.yaml")
  );
  testKeria = TestKeria.getInstance(testPaths, 3901, 3902, 3903, 0);

  let keriaConfig: KeriaConfig;
  keriaConfig = {
    dt: "2023-12-01T10:05:25.062609+00:00",
    keria: {
      dt: "2023-12-01T10:05:25.062609+00:00",
      curls: ["http://keria:3902/"],
    },
    iurls: [
      "http://localhost:5642/oobi/BBilc4-L3tFUnfM_wJr4S4OJanAv_VmF_dJNN6vkf2Ha/controller",
      "http://localhost:5643/oobi/BLskRTInXnMxWaGqcpSyMgo0nYbalW99cGZESrz3zapM/controller",
      "http://localhost:5644/oobi/BIKKuvBwpmDVA4Ds-EpL5bt9OqPzWPja2LigFYZN2YfX/controller",
    ],
    durls: [
      "http://localhost:7723/oobi/EBNaNu-M9P5cgrnfl2Fvymy4E_jvxxyjb70PRtiANlJy",
      "http://localhost:7723/oobi/EMhvwOlyEJ9kN4PrwCpr9Jsv7TxPhiYveZ0oP3lJzdEi",
      "http://localhost:7723/oobi/EKA57bKBKxr_kN7iN5i7lMUxpMG-s19dRcmov1iDxz-E",
      "http://localhost:7723/oobi/EEy9PkikFcANV1l7EHukCeXqrzT1hNZjGlUk7wuMO5jw",
      "http://localhost:7723/oobi/ENPXp1vQzRF6JwIuS-mp2U8Uf1MoADoP_GqQ62VsDZWY",
      "http://localhost:7723/oobi/EH6ekLjSr8V32WyFbGe1zXjTzFs9PkTYmupJ9H65O14g",
      "http://localhost:7723/oobi/EBfdlu8R27Fbx-ehrqwImnK-8Cm79sqbAQ4MmvEAYqao",
    ],
  };

  const pullImage = false;
  await testKeria.beforeAll(
    "weboftrust/keria:latest"
    // "delegation-multisig-test",
    // keriaConfig,
    // pullImage,
  );
  const testEnv = TestEnvironment.getInstance("docker", testKeria);
  testEnv.witnessIds = []; // TODO: don't override the default config
});

test("delegation-multisig", async function run() {
  // Boot three clients
  const [
    delegator1Client,
    delegator2Client,
    delegatee1Client,
    delegatee2Client,
  ] = await step("Creating single sig clients", async () => {
    return await Promise.all([
      getOrCreateClient(),
      getOrCreateClient(),
      getOrCreateClient(),
      getOrCreateClient(),
    ]);
  });

  // Create delegator and delegatee identifiers clients
  const [delegator1Aid, delegator2Aid, delegatee1Aid, delegatee2Aid] =
    await step("Creating single sig aids", async () => {
      return await Promise.all([
        createAID(delegator1Client, delegator1Name),
        createAID(delegator2Client, delegator2Name),
        createAID(delegatee1Client, delegatee1Name),
        createAID(delegatee2Client, delegatee2Name),
      ]);
    });

  //TODO a workaround as of KERIA 0.2.0-rc2
  // const agentHostAndPort = new URL(delegator1Client.url).host;
  // const agentHost = agentHostAndPort.split(":")[0];
  // const agentHttpUrl = `http://${agentHost}:${testKeria.keriaHttpPort}`;

  // Exchange OOBIs
  const [delegator1Oobi, delegator2Oobi, delegatee1Oobi, delegatee2Oobi] =
    await step("Getting OOBIs before resolving...", async () => {
      // return [`${agentHttpUrl}/oobi/${delegator1Aid.prefix}/agent`,`${agentHttpUrl}/oobi/${delegator2Aid.prefix}/agent`,`${agentHttpUrl}/oobi/${delegatee1Aid.prefix}/agent`,`${agentHttpUrl}/oobi/${delegatee2Aid.prefix}/agent`]
      return await Promise.all([
        await delegator1Client.oobis().get(delegator1Name, "agent"),
        await delegator2Client.oobis().get(delegator2Name, "agent"),
        await delegatee1Client.oobis().get(delegatee1Name, "agent"),
        await delegatee2Client.oobis().get(delegatee2Name, "agent"),
      ]);
    });

  await step("Resolving OOBIs", async () => {
    // await Promise.all([
    //   resolveOobi(delegator1Client, delegator2Oobi, delegator2Name),
    //   resolveOobi(delegator2Client, delegator1Oobi, delegator1Name),
    //   resolveOobi(delegatee1Client, delegatee2Oobi, delegatee2Name),
    //   resolveOobi(delegatee2Client, delegatee1Oobi, delegatee1Name),
    // ]);
    await Promise.all([
      resolveOobi(delegator1Client, delegator2Oobi.oobis[0], delegator2Name),
      resolveOobi(delegator2Client, delegator1Oobi.oobis[0], delegator1Name),
      resolveOobi(delegatee1Client, delegatee2Oobi.oobis[0], delegatee2Name),
      resolveOobi(delegatee2Client, delegatee1Oobi.oobis[0], delegatee1Name),
    ]);
  });
  console.log(
    `${delegator1Name}(${delegator1Aid.prefix}) and ${delegatee1Name}(${delegatee1Aid.prefix}) resolved ${delegator2Name}(${delegator2Aid.prefix}) and ${delegatee2Name}(${delegatee2Aid.prefix}) OOBIs and vice versa`
  );

  // First member start the creation of a multisig identifier
  // Create a multisig AID for the GEDA.
  // Skip if a GEDA AID has already been incepted.
  const otor1 = await step(
    `${delegator1Name}(${delegator1Aid.prefix}) initiated delegator multisig, waiting for ${delegator2Name}(${delegator2Aid.prefix}) to join...`,
    async () => {
      return await startMultisigIncept(delegator1Client, {
        groupName: delegatorGroupName,
        localMemberName: delegator1Aid.name,
        participants: [delegator1Aid.prefix, delegator2Aid.prefix],
        isith: 2,
        nsith: 2,
        toad: 0,
        wits: [],
        //   "BBilc4-L3tFUnfM_wJr4S4OJanAv_VmF_dJNN6vkf2Ha",
        //   "BLskRTInXnMxWaGqcpSyMgo0nYbalW99cGZESrz3zapM",
        //   "BIKKuvBwpmDVA4Ds-EpL5bt9OqPzWPja2LigFYZN2YfX",
        // ],
      });
    }
  );

  const [ntor] = await waitForNotifications(delegator2Client, "/multisig/icp", {
    maxSleep: 10000,
    minSleep: 1000,
    maxRetries: undefined,
    timeout: 30000,
  });
  await markAndRemoveNotification(delegator2Client, ntor);
  assert(ntor.a.d);
  const otor2 = await acceptMultisigIncept(delegator2Client, {
    localMemberName: delegator2Aid.name,
    groupName: delegatorGroupName,
    msgSaid: ntor.a.d,
  });

  const torpre = otor1.name.split(".")[1];
  await Promise.all([
    waitOperation(delegator1Client, otor1),
    waitOperation(delegator2Client, otor2),
  ]);

  const adelegatorGroupName1 = await delegator1Client
    .identifiers()
    .get(delegatorGroupName);
  const adelegatorGroupName2 = await delegator2Client
    .identifiers()
    .get(delegatorGroupName);

  assert.equal(adelegatorGroupName1.prefix, adelegatorGroupName2.prefix);
  assert.equal(adelegatorGroupName1.name, adelegatorGroupName2.name);
  const adelegatorGroupName = adelegatorGroupName1;

  //Resolve delegator OOBI
  const delegatorGroupNameOobi = await step(
    `Add and resolve delegator OOBI ${delegatorGroupName}(${adelegatorGroupName.prefix})`,
    async () => {
      const timestamp = createTimestamp();
      const opList1 = await addEndRoleMultisig(
        delegator1Client,
        delegatorGroupName,
        delegator1Aid,
        [delegator2Aid],
        adelegatorGroupName,
        timestamp,
        true
      );
      const opList2 = await addEndRoleMultisig(
        delegator2Client,
        delegatorGroupName,
        delegator2Aid,
        [delegator1Aid],
        adelegatorGroupName,
        timestamp
      );

      await Promise.all(
        opList1.map((op) => waitOperation(delegator1Client, op))
      );
      await Promise.all(
        opList2.map((op) => waitOperation(delegator2Client, op))
      );

      await waitAndMarkNotification(delegator1Client, "/multisig/rpy");
      await waitAndMarkNotification(delegator2Client, "/multisig/rpy");

      const [odelegatorGroupName1, odelegatorGroupName2] = await Promise.all([
        delegator1Client.oobis().get(adelegatorGroupName.name, "agent"),
        delegator2Client.oobis().get(adelegatorGroupName.name, "agent"),
      ]);

      assert.equal(odelegatorGroupName1.role, odelegatorGroupName2.role);
      assert.equal(
        odelegatorGroupName1.oobis[0],
        odelegatorGroupName2.oobis[0]
      );

      return odelegatorGroupName1.oobis[0];
    }
  );

  const oobiGtor = delegatorGroupNameOobi.split("/agent/")[0];
  await Promise.all([
    getOrCreateContact(delegatee1Client, adelegatorGroupName.name, oobiGtor),
    getOrCreateContact(delegatee2Client, adelegatorGroupName.name, oobiGtor),
  ]);

  const opDelegatee1 = await step(
    `${delegatee1Name}(${delegatee1Aid.prefix}) initiated delegatee multisig, waiting for ${delegatee2Name}(${delegatee2Aid.prefix}) to join...`,
    async () => {
      return await startMultisigIncept(delegatee1Client, {
        groupName: delegateeGroupName,
        localMemberName: delegatee1Aid.name,
        participants: [delegatee1Aid.prefix, delegatee2Aid.prefix],
        isith: 2,
        nsith: 2,
        toad: 0,
        delpre: torpre,
        wits: [],
        //   "BBilc4-L3tFUnfM_wJr4S4OJanAv_VmF_dJNN6vkf2Ha",
        //   "BLskRTInXnMxWaGqcpSyMgo0nYbalW99cGZESrz3zapM",
        //   "BIKKuvBwpmDVA4Ds-EpL5bt9OqPzWPja2LigFYZN2YfX",
        // ],
      });
    }
  );

  // Second member of delegatee check notifications and join the multisig
  const [ntee] = await waitForNotifications(delegatee2Client, "/multisig/icp");
  await markAndRemoveNotification(delegatee2Client, ntee);
  assert(ntee.a.d);

  const opDelegatee2 = await acceptMultisigIncept(delegatee2Client, {
    localMemberName: delegatee2Aid.name,
    groupName: delegateeGroupName,
    msgSaid: ntee.a.d,
  });

  console.log(`${delegatee2Name} joined multisig, waiting for delegator...`);

  const agtee1 = await delegatee1Client.identifiers().get(delegateeGroupName);
  const agtee2 = await delegatee2Client.identifiers().get(delegateeGroupName);

  assert.equal(agtee1.prefix, agtee2.prefix);
  assert.equal(agtee1.name, agtee2.name);

  const teepre = opDelegatee1.name.split(".")[1];
  assert.equal(opDelegatee2.name.split(".")[1], teepre);
  console.log("Delegatee prefix:", teepre);

  await step("delegator anchors/approves delegation", async () => {
    // GEDA anchors delegation with an interaction event.
    const anchor = {
      i: teepre,
      s: "0",
      d: teepre,
    };
    const delApprOp1 = await delegateMultisig(
      delegator1Client,
      delegator1Aid,
      [delegator2Aid],
      adelegatorGroupName,
      anchor,
      true
    );
    const delApprOp2 = await delegateMultisig(
      delegator2Client,
      delegator2Aid,
      [delegator1Aid],
      adelegatorGroupName,
      anchor
    );
    const [dresult1, dresult2] = await Promise.all([
      waitOperation(delegator1Client, delApprOp1),
      waitOperation(delegator2Client, delApprOp2),
    ]);

    assert.equal(dresult1.response, dresult2.response);

    await waitAndMarkNotification(delegator1Client, "/multisig/ixn");
  });

  const queryOp1 = await delegator1Client
    .keyStates()
    .query(adelegatorGroupName.prefix, "1");
  const queryOp2 = await delegator2Client
    .keyStates()
    .query(adelegatorGroupName.prefix, "1");

  const kstor1 = await waitOperation(delegator1Client, queryOp1);
  const kstor2 = await waitOperation(delegator2Client, queryOp2);

  // QARs query the GEDA's key state
  const ksteetor1 = await delegatee1Client
    .keyStates()
    .query(adelegatorGroupName.prefix, "1");
  const ksteetor2 = await delegatee2Client
    .keyStates()
    .query(adelegatorGroupName.prefix, "1");
  const teeTor1 = await waitOperation(delegatee1Client, ksteetor1);
  const teeTor2 = await waitOperation(delegatee2Client, ksteetor2);

  const teeDone1 = await waitOperation(delegatee1Client, opDelegatee1);
  const teeDone2 = await waitOperation(delegatee2Client, opDelegatee2);
  console.log("Delegated multisig created!");

  const agtee = await delegatee1Client.identifiers().get(delegateeGroupName);
  assert.equal(agtee.prefix, teepre);

  await assertOperations(
    delegator1Client,
    delegator2Client,
    delegatee1Client,
    delegatee2Client
  );
  await assertNotifications(
    delegator1Client,
    delegator2Client,
    delegatee1Client,
    delegatee2Client
  );
}, 600000);

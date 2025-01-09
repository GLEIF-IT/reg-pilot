import path from "path";
import Docker from "dockerode";
import { resolveEnvironment, TestPaths } from "../src/utils/resolve-env";

import { getConfig, SIMPLE_TYPE } from "./utils/test-data";

import { loadWorkflow, runWorkflow } from "./utils/run-workflow";

import { downloadReports } from "../src/utils/bank-reports";
import { launchTestKeria } from "./utils/test-util";

let testPaths: TestPaths;
let configJson: any;
let containers: Map<string, Docker.Container> = new Map<
  string,
  Docker.Container
>();

const bankNum = process.env.BANK_NUM ? parseInt(process.env.BANK_NUM) : 1;
const bankImage = `ronakseth96/keria:TestBank_${bankNum}`;
const bankContainer = `bank${bankNum}`;
const bankName = "Bank_" + bankNum;
const offset = 10 * (bankNum - 1);
const keriaAdminPort =
  (process.env.KERIA_ADMIN_PORT
    ? parseInt(process.env.KERIA_ADMIN_PORT)
    : 3901) + offset;
const keriaHttpPort =
  (process.env.KERIA_HTTP_PORT ? parseInt(process.env.KERIA_HTTP_PORT) : 3902) +
  offset;
const keriaBootPort =
  (process.env.KERIA_BOOT_PORT ? parseInt(process.env.KERIA_BOOT_PORT) : 3903) +
  offset;

beforeAll(async () => {
  process.env.KERIA = process.env.KERIA
    ? process.env.KERIA
    : `http://localhost:${keriaAdminPort}`;
  process.env.KERIA_BOOT = process.env.KERIA_BOOT
    ? process.env.KERIA_BOOT
    : `http://localhost:${keriaBootPort}`;
  process.env.DOCKER_HOST = process.env.DOCKER_HOST
    ? process.env.DOCKER_HOST
    : "localhost";
  process.env.SPEED = "fast";
  process.env.INCLUDE_ALL_SIGNED_REPORTS = "false";
  process.env.INCLUDE_FAIL_REPORTS = "false";
  process.env.TEST_USER_NAME = process.env.TEST_USER_NAME
    ? process.env.TEST_USER_NAME
    : bankName;

  testPaths = new TestPaths();
  await downloadReports();
  configJson = getConfig(testPaths.testUserConfigFile, true);

  if (
    process.env.START_TEST_KERIA === undefined ||
    process.env.START_TEST_KERIA === "true"
  ) {
    await setupBank();
  }
});

afterAll(async () => {
  for (const container of containers.values()) {
    await container.stop();
    await container.remove();
    await containers.delete(bankName);
  }
});

async function setupBank() {
  const keriaContainer = await launchTestKeria(bankContainer, bankImage);
  containers.set(bankName, keriaContainer);
}

test("api-verifier-bank-test-workflow", async function run() {
  process.env.TEST_ENVIRONMENT = "bank_test";
  const env = resolveEnvironment();

  const workflowPath = path.join(
    testPaths.workflowsDir,
    "bank-api-verifier-test-workflow.yaml"
  );
  const workflow = loadWorkflow(workflowPath);

  if (workflow && configJson) {
    await runWorkflow(workflow, configJson, env);
  }
}, 3600000);

test("eba-verifier-bank-test-workflow", async function run() {
  process.env.TEST_ENVIRONMENT = "eba_bank_test";
  const env = resolveEnvironment();

  const workflowPath = path.join(
    testPaths.workflowsDir,
    "eba-verifier-test-workflow.yaml"
  );
  const workflow = loadWorkflow(workflowPath);

  if (workflow && configJson) {
    await runWorkflow(workflow, configJson, env);
  }
}, 3600000);

test("vlei-issuance-reports-bank-test-workflow", async function run() {
  process.env.REPORT_TYPES = SIMPLE_TYPE;
  const env = resolveEnvironment();

  console.log(
    `Running vlei issuance and reports generation test for bank: ${bankName}`
  );
  const bankDirPath = testPaths.testUserDir;
  const workflowName = "workflow.yaml";
  const workflowPath = path.join(bankDirPath, workflowName);
  const workflow = loadWorkflow(workflowPath);

  if (workflow && configJson) {
    await runWorkflow(workflow, configJson, env);
  }
}, 3600000);

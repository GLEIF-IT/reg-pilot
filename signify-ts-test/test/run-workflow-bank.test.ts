import path from "path";
import Docker from "dockerode";
import { TestEnvironment, TestPaths } from "../src/utils/resolve-env";

import { getConfig, SIMPLE_TYPE } from "./utils/test-data";

import { loadWorkflow, runWorkflow } from "./utils/run-workflow";

import { downloadReports } from "../src/utils/bank-reports";
import {
  launchTestKeria,
  runDockerCompose,
  stopDockerCompose,
} from "./utils/test-util";

let testPaths: TestPaths;
let env: TestEnvironment;
let configJson: any;
let containers: Map<string, Docker.Container> = new Map<
  string,
  Docker.Container
>();

console.log(`run-workflow-bank process.argv array: ${process.argv}`);
const bankNum = parseInt(process.argv[process.argv.length - 1], 10) || 1;
const bankImage = `ronakseth96/keria:TestBank_${bankNum}`;
const bankContainer = `bank${bankNum}`;
const bankName = "Bank_" + bankNum;
const offset = 10 * (bankNum - 1);
const keriaAdminPort =
  parseInt(process.argv[process.argv.length - 4], 10) + offset ||
  20001 + offset;
const keriaHttpPort =
  parseInt(process.argv[process.argv.length - 3], 10) + offset ||
  20002 + offset;
const keriaBootPort =
  parseInt(process.argv[process.argv.length - 2], 10) + offset ||
  20003 + offset;

beforeAll(async () => {
  process.env.DOCKER_HOST = process.env.DOCKER_HOST
    ? process.env.DOCKER_HOST
    : "localhost";
  process.env.SPEED = "fast";
  process.env.TEST_USER_NAME = process.env.TEST_USER_NAME
    ? process.env.TEST_USER_NAME
    : bankName;

  testPaths = TestPaths.getInstance(bankName);
  await downloadReports(bankNum);
  // await generateBankConfig(bankNum);
  configJson = getConfig(testPaths.testUserConfigFile);

  // should we try to launch a user container?
  if (
    process.env.START_TEST_KERIA === undefined ||
    process.env.START_TEST_KERIA === "true"
  ) {
    console.log(
      `Starting local services using ${testPaths.dockerComposeFile} up -d verify`
    );
    await runDockerCompose(testPaths.dockerComposeFile, "up -d", "verify");
    const keriaContainer = await launchTestKeria(
      bankContainer,
      bankImage,
      keriaAdminPort,
      keriaHttpPort,
      keriaBootPort
    );
    containers.set(bankName, keriaContainer);
  }
});

afterAll(async () => {
  for (const container of containers.values()) {
    await container.stop();
    // await container.remove();
    await containers.delete(bankName);
  }
  console.log(`Stopping local services using ${testPaths.dockerComposeFile}`);
  await stopDockerCompose(testPaths.dockerComposeFile, "down -v", "verify");
});

test("api-verifier-bank-test-workflow", async function run() {
  console.log(`Running api-verifier-bank-test-workflow for bank: ${bankName}`);
  env = TestEnvironment.getInstance(
    "docker",
    keriaAdminPort,
    keriaHttpPort,
    keriaBootPort
  );

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
  console.log(`Running eba-verifier-bank-test-workflow for bank: ${bankName}`);
  env = TestEnvironment.getInstance(
    "eba_bank_test",
    keriaAdminPort,
    keriaHttpPort,
    keriaBootPort
  );
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
  console.log(
    `Running vlei-issuance-reports-bank-test-workflow for bank: ${bankName}`
  );
  process.env.REPORT_TYPES = SIMPLE_TYPE;

  env = TestEnvironment.getInstance(
    "docker",
    keriaAdminPort,
    keriaHttpPort,
    keriaBootPort
  );

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

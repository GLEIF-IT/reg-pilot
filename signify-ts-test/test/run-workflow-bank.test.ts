import minimist from "minimist";
import path from "path";
import Docker from "dockerode";
import { TestEnvironment, TestPaths } from "../src/utils/resolve-env";

import { getConfig, SIMPLE_TYPE } from "./utils/test-data";

import { loadWorkflow, runWorkflow } from "./utils/run-workflow";

import {
  createZipWithCopies,
  downloadUnpackReports,
} from "../src/utils/bank-reports";
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

// Parse command-line arguments using minimist
const args = minimist(process.argv.slice(2), {
  unknown: (arg: string) => {
    console.error(`Unknown argument: ${arg}`);
    return false;
  },
});

// Access named arguments
const ARG_MAX_REPORT_SIZE = "max-report-size";
const ARG_BANK_NUM = "bank-num";
const ARG_KERIA_ADMIN_PORT = "keria-admin-port";
const ARG_KERIA_HTTP_PORT = "keria-http-port";
const ARG_KERIA_BOOT_PORT = "keria-boot-port";
const ARG_REFRESH = "refresh";

const maxReportMbArg = parseInt(args[ARG_MAX_REPORT_SIZE], 10);
const maxReportMb = !isNaN(maxReportMbArg) ? maxReportMbArg : 0; // 1 MB
const bankNum = parseInt(args[ARG_BANK_NUM], 10) || 1;
const bankImage = `ronakseth96/keria:TestBank_${bankNum}`;
const bankContainer = `bank${bankNum}`;
const bankName = "Bank_" + bankNum;
const offset = 10 * (bankNum - 1);
const keriaAdminPort =
  parseInt(args[ARG_KERIA_ADMIN_PORT], 10) + offset || 20001 + offset;
const keriaHttpPort =
  parseInt(args[ARG_KERIA_HTTP_PORT], 10) + offset || 20002 + offset;
const keriaBootPort =
  parseInt(args[ARG_KERIA_BOOT_PORT], 10) + offset || 20003 + offset;
const refresh = args[ARG_REFRESH] === "true";

console.log(
  "bankNum:",
  bankNum,
  "bankImage:",
  bankImage,
  "bankContainer:",
  bankContainer,
  "bankName:",
  bankName,
  "offset:",
  offset,
  "keriaAdminPort:",
  keriaAdminPort,
  "keriaHttpPort:",
  keriaHttpPort,
  "keriaBootPort:",
  keriaBootPort,
  "maxReportMb:",
  maxReportMb
);

beforeAll(async () => {
  process.env.DOCKER_HOST = process.env.DOCKER_HOST
    ? process.env.DOCKER_HOST
    : "localhost";
  process.env.SPEED = "fast";
  process.env.TEST_USER_NAME = process.env.TEST_USER_NAME
    ? process.env.TEST_USER_NAME
    : bankName;

  testPaths = TestPaths.getInstance(bankName);
  await downloadUnpackReports(bankNum, refresh);
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
    await runWorkflow(workflow, configJson, env, testPaths);
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

  const pdfFilePath = path.format({
    dir: path.dirname(testPaths.testBankReportZip),
    name: path.basename(testPaths.testBankReportZip, ".zip"),
    ext: ".pdf",
  });
  const zipWithCopies = createZipWithCopies(pdfFilePath, maxReportMb);
  expect(zipWithCopies).toBe(testPaths.testBankReportZip);

  if (workflow && configJson) {
    await runWorkflow(workflow, configJson, env, testPaths);
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
    await runWorkflow(workflow, configJson, env, testPaths);
  }
}, 3600000);

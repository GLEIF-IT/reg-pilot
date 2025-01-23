import minimist from "minimist";
import path from "path";
import Docker from "dockerode";
import { TestEnvironment, TestPaths } from "../src/utils/resolve-env";

import { getConfig, SIMPLE_TYPE } from "./utils/test-data";

import { loadWorkflow, runWorkflow } from "./utils/run-workflow";

import {
  createZipWithCopies,
  downloadConfigWorkflowReports,
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

// Access named arguments
const ARG_MAX_REPORT_SIZE = "max-report-size";
const ARG_BANK_NUM = "bank-num";
const ARG_KERIA_ADMIN_PORT = "keria-admin-port";
const ARG_KERIA_HTTP_PORT = "keria-http-port";
const ARG_KERIA_BOOT_PORT = "keria-boot-port";
const ARG_REFRESH = "refresh";
const ARG_CLEAN = "clean";

// Parse command-line arguments using minimist
const args = minimist(process.argv.slice(process.argv.indexOf("--") + 1), {
  alias: {
    [ARG_MAX_REPORT_SIZE]: "m",
    [ARG_BANK_NUM]: "b",
    [ARG_KERIA_ADMIN_PORT]: "kap",
    [ARG_KERIA_HTTP_PORT]: "khp",
    [ARG_KERIA_BOOT_PORT]: "kbp",
    [ARG_REFRESH]: "r",
    [ARG_CLEAN]: "c",
  },
  default: {
    [ARG_MAX_REPORT_SIZE]: 1, // Default to 1 MB
    [ARG_BANK_NUM]: 1,
    [ARG_KERIA_ADMIN_PORT]: 20001,
    [ARG_KERIA_HTTP_PORT]: 20002,
    [ARG_KERIA_BOOT_PORT]: 20003,
    [ARG_REFRESH]: false,
    [ARG_CLEAN]: true,
  },
  "--": true,
  unknown: (arg) => {
    console.warn(
      `Unknown argument, likely you aren't running from a test script: ${arg}`
    );
    // throw new Error(`Unknown argument: ${arg}`);
    return false;
  },
});

console.log("Parsed arguments:", {
  [ARG_MAX_REPORT_SIZE]: args[ARG_MAX_REPORT_SIZE],
  [ARG_BANK_NUM]: args[ARG_BANK_NUM],
  [ARG_KERIA_ADMIN_PORT]: args[ARG_KERIA_ADMIN_PORT],
  [ARG_KERIA_HTTP_PORT]: args[ARG_KERIA_HTTP_PORT],
  [ARG_KERIA_BOOT_PORT]: args[ARG_KERIA_BOOT_PORT],
  [ARG_REFRESH]: args[ARG_REFRESH],
  [ARG_CLEAN]: args[ARG_CLEAN],
});

const maxReportMbArg = parseInt(args[ARG_MAX_REPORT_SIZE], 10);
const maxReportMb = !isNaN(maxReportMbArg) ? maxReportMbArg : 0; // 1 MB
const bankNum = parseInt(args[ARG_BANK_NUM], 10) || 1;
const bankImage = `ronakseth96/keria:TestBank_${bankNum}`;
const bankName = "Bank_" + bankNum;
const bankContainer = `${bankName}_keria`.toLowerCase();
const offset = 10 * (bankNum - 1);
const keriaAdminPort =
  parseInt(args[ARG_KERIA_ADMIN_PORT], 10) + offset || 20001 + offset;
const keriaHttpPort =
  parseInt(args[ARG_KERIA_HTTP_PORT], 10) + offset || 20002 + offset;
const keriaBootPort =
  parseInt(args[ARG_KERIA_BOOT_PORT], 10) + offset || 20003 + offset;
const refresh = args[ARG_REFRESH] === "true";
const clean = args[ARG_CLEAN] === "true";
testPaths = TestPaths.getInstance(bankName);
const pdfFilePath = path.format({
  dir: path.dirname(testPaths.testBankReportZip),
  name: path.basename(testPaths.testBankReportZip, ".zip"),
  ext: ".pdf",
});

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
  maxReportMb,
  "refresh:",
  refresh,
  "clean:",
  clean
);

beforeAll(async () => {
  process.env.DOCKER_HOST = process.env.DOCKER_HOST
    ? process.env.DOCKER_HOST
    : "localhost";
  process.env.SPEED = "fast";
  // process.env.TEST_USER_NAME = process.env.TEST_USER_NAME
  //   ? process.env.TEST_USER_NAME
  //   : bankName;

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
  if (clean) {
    console.log("Cleaning up test data");
    for (const container of containers.values()) {
      await container.stop();
      // await container.remove();
      await containers.delete(bankName);
    }
    console.log(`Stopping local services using ${testPaths.dockerComposeFile}`);
    await stopDockerCompose(testPaths.dockerComposeFile, "down -v", "verify");
  }
});

test("api-verifier-bank-test-workflow", async function run() {
  console.log(`Running api-verifier-bank-test-workflow for bank: ${bankName}`);
  env = TestEnvironment.getInstance(
    "docker",
    keriaAdminPort,
    keriaHttpPort,
    keriaBootPort
  );

  await downloadConfigWorkflowReports(bankName, true, false, false, refresh);
  // await generateBankConfig(bankNum);
  configJson = getConfig(testPaths.testUserConfigFile);

  const workflowPath = path.join(
    testPaths.workflowsDir,
    "bank-api-verifier-test-workflow.yaml"
  );
  const workflow = loadWorkflow(workflowPath);

  if (workflow && configJson) {
    await runWorkflow(workflow, configJson, env, testPaths);
  }
}, 3600000);

test("eba-verifier-prep-only", async function run() {
  console.warn(
    "eba-verifier-prep-only is not a real test but allows for the preparation of the EBA verifier test"
  );
  await downloadConfigWorkflowReports(bankName, false, false, false, refresh);
  // await generateBankConfig(bankNum);
  configJson = getConfig(testPaths.testUserConfigFile);

  const zipWithCopies = createZipWithCopies(pdfFilePath, maxReportMb, refresh, bankNum);
  testPaths.testBankReportZip = zipWithCopies;
});

test("eba-verifier-bank-test-workflow", async function run() {
  console.log(`Running eba-verifier-bank-test-workflow for bank: ${bankName}`);
  env = TestEnvironment.getInstance(
    "eba_bank_test",
    keriaAdminPort,
    keriaHttpPort,
    keriaBootPort
  );

  await downloadConfigWorkflowReports(bankName, false, false, false, refresh);
  // await generateBankConfig(bankNum);
  configJson = getConfig(testPaths.testUserConfigFile);

  const workflowPath = path.join(
    testPaths.workflowsDir,
    "eba-verifier-test-workflow.yaml"
  );
  const workflow = loadWorkflow(workflowPath);

  const zipWithCopies = createZipWithCopies(pdfFilePath, maxReportMb, refresh, bankNum);
  testPaths.testBankReportZip = zipWithCopies;
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

  await downloadConfigWorkflowReports(bankName, true, false, false, refresh);
  // await generateBankConfig(bankNum);
  configJson = getConfig(testPaths.testUserConfigFile);

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

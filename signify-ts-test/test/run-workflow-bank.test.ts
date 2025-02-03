import minimist from "minimist";
import path from "path";
import {
  TestEnvironment,
  TestKeria,
  TestPaths,
} from "../src/utils/resolve-env";

import { getConfig, SIMPLE_TYPE } from "../src/utils/test-data";

import { loadWorkflow, runWorkflow } from "../src/utils/run-workflow";

import { downloadConfigWorkflowReports } from "../src/utils/bank-reports";

let testPaths: TestPaths;
let env: TestEnvironment;
let configJson: any;

console.log(`run-workflow-bank process.argv array: ${process.argv}`);

// Access named arguments
const ARG_MAX_REPORT_SIZE = "max-report-size";
const ARG_BANK_NUM = "bank-num";
const ARG_REFRESH = "refresh";
const ARG_CLEAN = "clean";

// Parse command-line arguments using minimist
const args = minimist(process.argv.slice(process.argv.indexOf("--") + 1), {
  alias: {
    [ARG_MAX_REPORT_SIZE]: "m",
    [ARG_BANK_NUM]: "b",
    [ARG_REFRESH]: "r",
    [ARG_CLEAN]: "c",
  },
  default: {
    [ARG_MAX_REPORT_SIZE]: 0, // Default to 1 MB
    [ARG_BANK_NUM]: 1,
    [ARG_REFRESH]: false,
    [ARG_CLEAN]: true,
  },
  "--": true,
  unknown: (arg) => {
    console.info(
      `Unknown run-workflow-bank argument, Skipping: ${arg}`
    );
    // throw new Error(`Unknown argument: ${arg}`);
    return false;
  },
});

console.log("Parsed arguments:", {
  [ARG_MAX_REPORT_SIZE]: args[ARG_MAX_REPORT_SIZE],
  [ARG_BANK_NUM]: args[ARG_BANK_NUM],
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
const refresh = args[ARG_REFRESH] ? args[ARG_REFRESH] === "true" : true;
const clean = args[ARG_CLEAN] === "true";
testPaths = TestPaths.getInstance(bankName);
const testKeria = TestKeria.getInstance(testPaths, 20001, 20002, 20003, offset);

// set test data for workflow
testPaths.testUserName = bankName;
testPaths.testUserNum = bankNum;
testPaths.maxReportMb = maxReportMb;
testPaths.refreshTestData = refresh;

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
  testKeria.keriaAdminPort,
  "keriaHttpPort:",
  testKeria.keriaHttpPort,
  "keriaBootPort:",
  testKeria.keriaBootPort,
  "maxReportMb:",
  maxReportMb,
  "refresh:",
  refresh,
  "clean:",
  clean
);

beforeAll(async () => {
  process.env.SPEED = "fast";
  await testKeria.beforeAll(bankImage, bankContainer);

});

afterAll(async () => {
  await testKeria.afterAll(clean);
});

test("api-verifier-bank-test-workflow", async function run() {
  console.log(`Running api-verifier-bank-test-workflow for bank: ${bankName}`);
  env = TestEnvironment.getInstance("docker", testKeria);

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
});

test("eba-verifier-bank-test-workflow", async function run() {
  console.log(`Running eba-verifier-bank-test-workflow for bank: ${bankName}`);
  env = TestEnvironment.getInstance("eba_bank_test", testKeria);

  await downloadConfigWorkflowReports(bankName, false, false, false, refresh);
  // await generateBankConfig(bankNum);
  configJson = getConfig(testPaths.testUserConfigFile);

  const workflowPath = path.join(
    testPaths.workflowsDir,
    "eba-verifier-test-workflow.yaml"
  );
  const workflow = loadWorkflow(workflowPath);

  if (workflow && configJson) {
    await runWorkflow(workflow, configJson, env, testPaths);
  }
}, 3600000);

test("vlei-issuance-reports-bank-test-workflow", async function run() {
  console.log(
    `Running vlei-issuance-reports-bank-test-workflow for bank: ${bankName}`
  );
  process.env.REPORT_TYPES = SIMPLE_TYPE;

  env = TestEnvironment.getInstance("docker", testKeria);

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

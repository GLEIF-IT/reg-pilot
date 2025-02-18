import minimist from "minimist";
import path, { parse } from "path";
import {
  TestEnvironment,
  TestKeria,
  TestPaths,
} from "../src/utils/resolve-env";
import {
  WorkflowRunner,
  getConfig,
  loadWorkflow,
} from "vlei-verifier-workflows";

import { SIMPLE_TYPE } from "../src/utils/test-data";

import { downloadConfigWorkflowReports } from "../src/utils/bank-reports";
import {
  ApiTestStepRunner,
  GenerateReportStepRunner,
  SignReportStepRunner,
  VleiVerificationTestStepRunner,
} from "./utils/workflow-step-runners";
import assert from "assert";

let testPaths: TestPaths;
let env: TestEnvironment;
let configJson: any;

console.log(`run-workflow-bank process.argv array: ${process.argv}`);

// Access named arguments
const ARG_MAX_REPORT_SIZE = "max-report-size";
const ARG_BANK_NUM = "bank-num";
const ARG_REFRESH = "refresh";
const ARG_CLEAN = "clean";
const ARG_KERIA_START_PORT = "keria-start-port";

// Parse command-line arguments using minimist
const args = minimist(process.argv.slice(process.argv.indexOf("--") + 1), {
  alias: {
    [ARG_MAX_REPORT_SIZE]: "m",
    [ARG_BANK_NUM]: "b",
    [ARG_REFRESH]: "r",
    [ARG_CLEAN]: "c",
    [ARG_KERIA_START_PORT]: "ksp",
  },
  default: {
    [ARG_MAX_REPORT_SIZE]: 0, // Default to 1 MB
    [ARG_BANK_NUM]: 1,
    [ARG_REFRESH]: false,
    [ARG_CLEAN]: true,
    [ARG_KERIA_START_PORT]: 3900, //TODO once prepareClient in vlei-verifiers-workflow is updated, this could be 20000
  },
  "--": true,
  unknown: (arg) => {
    console.info(`Unknown run-workflow-bank argument, Skipping: ${arg}`);
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
const maxReportMb = !isNaN(maxReportMbArg) ? maxReportMbArg : 1; // 1 MB
const bankNum = parseInt(args[ARG_BANK_NUM], 10) || 0;
const bankImage = `ronakseth96/keria:TestBank_${bankNum}`;
const bankName = "Bank_" + bankNum;
const bankContainer = `${bankName}_keria`.toLowerCase();
const offset = 10 * (bankNum - 1);
const refresh = args[ARG_REFRESH] ? args[ARG_REFRESH] === "false" : true;
const clean = args[ARG_CLEAN] === "false";
testPaths = TestPaths.getInstance(bankName);
const keriaAdminPort = parseInt(args[ARG_KERIA_START_PORT]) + 1 || 20001;
const keriaHttpPort = parseInt(args[ARG_KERIA_START_PORT]) + 2 || 20002;
const keriaBootPort = parseInt(args[ARG_KERIA_START_PORT]) + 3 || 20003;
const testKeria = TestKeria.getInstance(
  testPaths,
  keriaAdminPort,
  keriaHttpPort,
  keriaBootPort,
  offset,
);

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
  "keriaAdminPort:",
  testKeria.keriaAdminPort,
  "keriaHttpPort:",
  testKeria.keriaHttpPort,
  "keriaBootPort:",
  testKeria.keriaBootPort,
  "offset:",
  offset,
  "maxReportMb:",
  maxReportMb,
  "refresh:",
  refresh,
  "clean:",
  clean,
);

beforeAll(async () => {
  process.env.SPEED = "fast";
  await testKeria.beforeAll(bankImage, bankContainer, refresh);
});

afterAll(async () => {
  await testKeria.afterAll(clean);
});

test("api-verifier-bank-test-workflow", async function run() {
  console.log(`Running api-verifier-bank-test-workflow for bank: ${bankName}`);
  env = TestEnvironment.getInstance("docker", testKeria);

  await downloadConfigWorkflowReports(bankName, true, false, false, refresh);
  // await generateBankConfig(bankNum);
  configJson = await getConfig(testPaths.testUserConfigFile);

  const workflowPath = path.join(
    testPaths.workflowsDir,
    "bank-api-verifier-test-workflow.yaml",
  );
  const workflow = loadWorkflow(workflowPath);

  if (workflow && configJson) {
    const wr = new WorkflowRunner(workflow, configJson);
    await wr.prepareClients();
    wr.registerRunner("generate_report", new GenerateReportStepRunner());
    wr.registerRunner("api_test", new ApiTestStepRunner());
    wr.registerRunner("sign_report", new SignReportStepRunner());
    const workflowRunResult = await wr.runWorkflow();
    assert.equal(workflowRunResult, true);
  }
}, 3600000);

test("eba-verifier-prep-only", async function run() {
  console.warn(
    "eba-verifier-prep-only is not a real test but allows for the preparation of the EBA verifier test",
  );
  await downloadConfigWorkflowReports(bankName, false, false, false, refresh);
  // await generateBankConfig(bankNum);
  configJson = await getConfig(testPaths.testUserConfigFile);
});

test("eba-verifier-bank-test-workflow", async function run() {
  console.log(`Running eba-verifier-bank-test-workflow for bank: ${bankName}`);
  env = TestEnvironment.getInstance("eba_bank_test", testKeria);

  await downloadConfigWorkflowReports(bankName, false, false, false, refresh);
  // await generateBankConfig(bankNum);
  configJson = await getConfig(testPaths.testUserConfigFile);

  const workflowPath = path.join(
    testPaths.workflowsDir,
    "eba-verifier-test-workflow.yaml",
  );
  const workflow = loadWorkflow(workflowPath);

  if (workflow && configJson) {
    const wr = new WorkflowRunner(workflow, configJson);
    await wr.prepareClients();
    wr.registerRunner("generate_report", new GenerateReportStepRunner());
    wr.registerRunner("api_test", new ApiTestStepRunner());
    wr.registerRunner("sign_report", new SignReportStepRunner());
    const workflowRunResult = await wr.runWorkflow();
    assert.equal(workflowRunResult, true);
  }
}, 3600000);

test("vlei-issuance-reports-bank-test-workflow", async function run() {
  console.log(
    `Running vlei-issuance-reports-bank-test-workflow for bank: ${bankName}`,
  );
  process.env.REPORT_TYPES = SIMPLE_TYPE;

  env = TestEnvironment.getInstance("docker", testKeria);
  await downloadConfigWorkflowReports(bankName, true, false, false, refresh);

  // await generateBankConfig(bankNum);
  configJson = await getConfig(testPaths.testUserConfigFile);

  console.log(
    `Running vlei issuance and reports generation test for bank: ${bankName}`,
  );
  const bankDirPath = testPaths.testUserDir;
  const workflowName = "workflow.yaml";
  const workflowPath = path.join(bankDirPath, workflowName);
  const workflow = loadWorkflow(workflowPath);

  if (workflow && configJson) {
    const wr = new WorkflowRunner(workflow, configJson);
    await wr.prepareClients();
    wr.registerRunner("generate_report", new GenerateReportStepRunner());
    wr.registerRunner("api_test", new ApiTestStepRunner());
    wr.registerRunner(
      "vlei_verification_test",
      new VleiVerificationTestStepRunner(),
    );
    const workflowRunResult = await wr.runWorkflow();
    assert.equal(workflowRunResult, true);
  }
}, 3600000);

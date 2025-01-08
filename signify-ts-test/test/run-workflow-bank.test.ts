import path from "path";
import Docker from "dockerode";
import { resolveEnvironment, TestEnvironment } from "./utils/resolve-env";

import { getConfig, SIMPLE_TYPE } from "./utils/test-data";

import { loadWorkflow, runWorkflow } from "./utils/run-workflow";

import { downloadReports, TEST_BANK_DATA } from "../src/utils/test-reports";
import { launchTestKeria } from "./utils/test-util";

let containers: Map<string, Docker.Container> = new Map<string, Docker.Container>();
const bankNum = process.env.BANK_NUM ? parseInt(process.env.BANK_NUM) : 1;
const bankImage = `ronakseth96/keria:TestBank_${bankNum}`;
const bankContainer = `bank${bankNum}`;
const bankName = "Bank_" + bankNum;
const offset = 10 * (bankNum - 1);
const keriaAdminPort = (process.env.KERIA_ADMIN_PORT ? parseInt(process.env.KERIA_ADMIN_PORT) : 3901) + offset;
const keriaHttpPort = (process.env.KERIA_HTTP_PORT ? parseInt(process.env.KERIA_HTTP_PORT) : 3902) + offset;
const keriaBootPort = (process.env.KERIA_BOOT_PORT ? parseInt(process.env.KERIA_BOOT_PORT) : 3903) + offset;

const configPath = path.join(process.cwd(), `./test/data/${TEST_BANK_DATA}`);
const configFilePath = path.join(configPath,`${bankName}/config.json`);
const configJson = getConfig(configFilePath, true);


beforeAll(() => {
  process.env.KERIA = `http://localhost:${keriaAdminPort}`;
  process.env.KERIA_AGENT_PORT = keriaHttpPort.toString();
  process.env.KERIA_BOOT = `http://localhost:${keriaBootPort}`;
  process.env.DOCKER_HOST = "localhost";
  process.env.SPEED = "fast";
  process.env.INCLUDE_ALL_SIGNED_REPORTS = "false";
  process.env.INCLUDE_FAIL_REPORTS = "false";
});

async function teardownBank(name: string) {
  // Stop Docker service
  const container = containers.get(name);
  if (container) {
    await container.stop();
    // await container.remove();
  }
}

async function setupBank() {

  const keriaContainer = await launchTestKeria(bankContainer, bankImage);
  if(keriaContainer) {
    containers.set(bankName, keriaContainer);

    const testDataDir = path.join(process.cwd(), `./test/data/`);
    await downloadReports(bankNum, testDataDir);

    return bankName;
  }
}

test("api-verifier-bank-test-workflow", async function run() {
  // You need to set the BANK_NAME environment variable. Ex.: export BANK_NAME=Bank_2.
  process.env.TEST_ENVIRONMENT = "bank_test";
  process.env.REG_PILOT_API = "http://localhost:8000";

  const env = resolveEnvironment();

  const bankStarted = await setupBank();

  const workflowPath = path.join(process.cwd(), "./src/workflows/bank-api-verifier-test-workflow.yaml");
  const workflow = loadWorkflow(workflowPath);
  if (workflow && configJson) {
    await runWorkflow(workflow, configJson, env);
  }

  if (bankStarted) {
    await teardownBank(bankName)
  }
}, 3600000);

test("eba-verifier-bank-test-workflow", async function run() {
  // You need to set the BANK_NAME environment variable. Ex.: export BANK_NAME=Bank_2.
  process.env.TEST_ENVIRONMENT = "eba_bank_test";
  process.env.REG_PILOT_API = "https://errp.test.eba.europa.eu/api-security";
  process.env.REG_PILOT_FILER = "https://errp.test.eba.europa.eu/api";
  const env = resolveEnvironment();

  const bankStarted = await setupBank();

  const workflowPath = path.join(process.cwd(), "./src/workflows/eba-verifier-test-workflow.yaml");
  const workflow = loadWorkflow(workflowPath);

  if (workflow && configJson) {
    await runWorkflow(workflow, configJson, env);
  }
  if (bankStarted) {
    await teardownBank(bankName);
  }
}, 3600000);

test("vlei-issuance-reports-bank-test-workflow", async function run() {
  // You need to set the BANK_NAME environment variable. Ex.: export BANK_NAME=Bank_2.
  process.env.REPORT_TYPES = SIMPLE_TYPE;
  const env = resolveEnvironment();

  const bankStarted = await setupBank();

  console.log(
    `Running vlei issuance and reports generation test for bank: ${bankName}`
  );
  const bankDirPath = `./test/data/${TEST_BANK_DATA}/${bankName}/`;
  const workflowName = "workflow.yaml";
  const workflowPath = path.join(process.cwd(), bankDirPath, workflowName);
  const workflow = loadWorkflow(workflowPath);

  if (workflow && configJson) {
    await runWorkflow(workflow, configJson, env);
  }

  if (bankStarted) {
    await teardownBank(bankName);
  }
}, 3600000);
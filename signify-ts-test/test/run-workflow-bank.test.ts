import path from "path";
import Docker from "dockerode";
import { resolveEnvironment, TestEnvironment } from "./utils/resolve-env";

import { getConfig, SIMPLE_TYPE } from "./utils/test-data";

import { loadWorkflow, runWorkflow } from "./utils/run-workflow";
import axios from "axios";
import { downloadReports } from "../src/utils/test-reports";

const fs = require("fs");
const yaml = require("js-yaml");

const docker = new Docker();
let container: Docker.Container;

const bankNum = 581;
const bankContainer = `bank${bankNum}`;
const bankName = "Bank_" + bankNum;
const offset = 10 * (bankNum - 1);
const keriaAdminPort = offset + 20001;
const keriaHttpPort = offset + 20002;
const keriaBootPort = offset + 20003;

afterAll(async () => {
  // Stop Docker service
  if (container) {
    await container.stop();
    await container.remove();
  }
});

beforeAll(async () => {
  process.env.KERIA = `http://localhost:${keriaAdminPort}`;
  process.env.KERIA_AGENT_PORT = keriaHttpPort.toString();
  process.env.KERIA_BOOT = `http://localhost:${keriaBootPort}`;
  process.env.DOCKER_HOST = "localhost";
  process.env.SPEED = "fast";
  process.env.INCLUDE_ALL_SIGNED_REPORTS = "false";
  process.env.INCLUDE_FAIL_REPORTS = "false";

  // Check if the container is already running
  const containers = await docker.listContainers({ all: true });
  const existingContainer = containers.find((c) =>
    c.Names.includes(`/${bankContainer}`)
  );

  if (!existingContainer) {
    // Pull Docker image
    await new Promise<void>((resolve, reject) => {
      docker.pull(
        `ronakseth96/keria:TestBank_${bankNum}`,
        (err: any, stream: NodeJS.ReadableStream) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, onFinished, onProgress);

          function onFinished(err: any, output: any) {
            if (err) return reject(err);
            resolve();
          }

          function onProgress(event: any) {
            console.log(event);
          }
        }
      );
    });

    // Start Docker service
    container = await docker.createContainer({
      Image: `ronakseth96/keria:TestBank_${bankNum}`,
      name: bankContainer,
      Env: [
        "KERI_AGENT_CORS=1",
        "PYTHONUNBUFFERED=1",
        "PYTHONIOENCODING=UTF-8",
      ],
      HostConfig: {
        PortBindings: {
          "3901/tcp": [{ HostPort: `${keriaAdminPort}` }],
          "3902/tcp": [{ HostPort: `${keriaHttpPort}` }],
          "3903/tcp": [{ HostPort: `${keriaBootPort}` }],
        },
      },
      Cmd: [
        "--config-dir",
        "/keria/config",
        "--config-file",
        "keria.json",
        "--loglevel",
        "DEBUG",
      ],
    });
    await container.start();
  } else {
    // Use the existing container
    container = docker.getContainer(existingContainer.Id);
    if (existingContainer.State !== "running") {
      await container.start();
    }
  }

  // Perform health check
  await performHealthCheck(`http://localhost:${keriaHttpPort}/spec.yaml`);

  await downloadReports(bankNum);
});

// Function to perform health check
async function performHealthCheck(
  url: string,
  timeout: number = 60000,
  interval: number = 5000
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
      console.log("Waiting for service to be healthy...");
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error("Service did not become healthy in time");
}

test("api-verifier-bank-test-workflow", async function run() {
  // You need to set the BANK_NAME environment variable. Ex.: export BANK_NAME=Bank_2.
  process.env.TEST_ENVIRONMENT = "bank_test";
  process.env.REG_PILOT_API = "http://localhost:8000";

  const env = resolveEnvironment();

  const workflowPath = "../src/workflows/bank-api-verifier-test-workflow.yaml";
  const workflow = loadWorkflow(path.join(__dirname, `${workflowPath}`));
  const configFilePath = `${bankName}/config.json`;
  const configJson = await getConfig(configFilePath, true);
  if (workflow && configJson) {
    await runWorkflow(workflow, configJson, env);
  }
}, 3600000);

test("eba-verifier-bank-test-workflow", async function run() {
  // You need to set the BANK_NAME environment variable. Ex.: export BANK_NAME=Bank_2.
  process.env.TEST_ENVIRONMENT = "eba_bank_test";
  process.env.REG_PILOT_API = "https://errp.test.eba.europa.eu/api-security";
  process.env.REG_PILOT_FILER = "https://errp.test.eba.europa.eu/api";
  const env = resolveEnvironment();
  const workflowPath = "../src/workflows/eba-verifier-test-workflow.yaml";
  const workflow = loadWorkflow(path.join(__dirname, `${workflowPath}`));
  const configFilePath = `${bankName}/config.json`;
  const configJson = await getConfig(configFilePath, true);
  if (workflow && configJson) {
    await runWorkflow(workflow, configJson, env);
  }
}, 3600000);

test("vlei-issuance-reports-bank-test-workflow", async function run() {
  // You need to set the BANK_NAME environment variable. Ex.: export BANK_NAME=Bank_2.
  process.env.REPORT_TYPES = SIMPLE_TYPE;
  const env = resolveEnvironment();
  console.log(
    `Running vlei issuance and reports generation test for bank: ${bankName}`
  );
  const bankDirPath = `./data/600-banks-test-data/${bankName}/`;
  const workflowName = "workflow.yaml";
  const workflow = loadWorkflow(
    path.join(__dirname, `${bankDirPath}`) + workflowName,
  );
  const configFilePath = `${bankName}/config.json`;
  const configJson = await getConfig(configFilePath, true);
  if (workflow && configJson) {
    await runWorkflow(workflow, configJson, env);
  }
}, 3600000);
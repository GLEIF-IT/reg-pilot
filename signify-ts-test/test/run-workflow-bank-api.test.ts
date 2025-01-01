import path from "path";
import Docker from 'dockerode';
import { resolveEnvironment, TestEnvironment } from "./utils/resolve-env";

import { getConfig } from "./utils/test-data";

import { runWorkflow } from "./utils/run-workflow";

const fs = require("fs");
const yaml = require("js-yaml");

let env: TestEnvironment;
const docker = new Docker();
let container: Docker.Container;

const bankNum = 581;
const bankContainer=`bank${bankNum}`
const bankName = "Bank_"+bankNum;
const offset = 10*(bankNum-1);
const keriaAdminPort = offset+20001;
const keriaHttpPort = offset+20002;
const keriaBootPort = offset+20003;

afterAll(async () => {
  // Stop Docker service
  if (container) {
    await container.stop();
    await container.remove();
  }
});

beforeAll(async () => {
  env = resolveEnvironment();
  process.env.KERIA = `http://localhost:${keriaAdminPort}`;
  process.env.KERIA_AGENT_PORT = keriaHttpPort.toString();
  process.env.KERIA_BOOT = `http://localhost:${keriaBootPort}`;
  process.env.DOCKER_HOST = "localhost";
  process.env.REG_PILOT_API = "localhost:8000";

  // Check if the container is already running
  const containers = await docker.listContainers({ all: true });
  const existingContainer = containers.find(c => c.Names.includes(`/${bankContainer}`));

  if (!existingContainer) {
    // Pull Docker image
    await new Promise<void>((resolve, reject) => {
      docker.pull(`ronakseth96/keria:TestBank_${bankNum}`, (err: any, stream: NodeJS.ReadableStream) => {
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

    // Start Docker service
    container = await docker.createContainer({
      Image: `ronakseth96/keria:TestBank_${bankNum}`,
      name: bankContainer,
      Env: [
        'KERI_AGENT_CORS=1',
        'PYTHONUNBUFFERED=1',
        'PYTHONIOENCODING=UTF-8'
      ],
      HostConfig: {
        PortBindings: {
          '3901/tcp': [{ HostPort: `${keriaAdminPort}` }],
          '3902/tcp': [{ HostPort: `${keriaHttpPort}` }],
          '3903/tcp': [{ HostPort: `${keriaBootPort}` }]
        }
      },
      Cmd: ['--config-dir', '/keria/config', '--config-file', 'keria.json', '--loglevel', 'DEBUG']
    });
    await container.start();
  } else {
    // Use the existing container
    container = docker.getContainer(existingContainer.Id);
    if (existingContainer.State !== 'running') {
      await container.start();
    }
  }
});

// Function to load and parse YAML file
function loadWorkflow(filePath: string) {
  try {
    const file = fs.readFileSync(filePath, "utf8");
    return yaml.load(file);
  } catch (e) {
    console.error("Error reading YAML file:", e);
    return null;
  }
}

test("api-verifier-bank-test-workflow", async function run() {
  // You need to set the BANK_NAME environment variable. Ex.: export BANK_NAME=Bank_2.
  process.env.TEST_ENVIRONMENT = "bank_test";

  const workflowPath = "../src/workflows/bank-api-verifier-test-workflow.yaml";
  const workflow = loadWorkflow(path.join(__dirname, `${workflowPath}`));
  const configFilePath = `${bankName}/config.json`;
  const configJson = await getConfig(configFilePath, true);
  if (workflow && configJson) {
    await runWorkflow(workflow, configJson);
  }
}, 3600000);

test("eba-verifier-bank-test-workflow", async function run() {
  // You need to set the BANK_NAME environment variable. Ex.: export BANK_NAME=Bank_2.
  process.env.TEST_ENVIRONMENT = "eba_bank_test";

  const workflowPath = "../src/workflows/eba-verifier-test-workflow.yaml";
  const workflow = loadWorkflow(path.join(__dirname, `${workflowPath}`));
  const configFilePath = `${bankName}/config.json`;
  const configJson = await getConfig(configFilePath, true);
  if (workflow && configJson) {
    await runWorkflow(workflow, configJson);
  }
}, 3600000);

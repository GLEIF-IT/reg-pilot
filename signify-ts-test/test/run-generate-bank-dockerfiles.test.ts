import * as fs from "fs";
import { number } from "mathjs";
import * as path from "path";
import { convertDockerHost } from "../src/utils/test-host";

const keriaAdminPort = 20001;
const keriaBootPort = 20003;
const keriaHttpPort = 20002;
const outputDir = "../images";

// Run containers with --network host to have access to the locally running Kerias(ex. docker run --network host bank_1_api_test)

test("generate-bank-dockerfiles", async function run() {
  // Generate dockerfiles for bank api tests
  const firstbank = process.env.FIRST_BANK || 1;
  const bankAmount = process.env.BANK_COUNT || 1;
  const eba = process.env.EBA === "true";
  generateDockerfiles(number(firstbank), number(bankAmount), eba);
}, 3600000);

function generateDockerfiles(
  firstbank: number,
  bankAmount: number,
  eba: boolean = false,
) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let testName;
  if (eba) {
    testName = "eba-verifier-bank-test-workflow";
  } else {
    testName = "api-verifier-bank-test-workflow";
  }

  const apiBaseUrl = process.env.REG_PILOT_API;
  const filerBaseUrl = process.env.REG_PILOT_FILER;

  // Generate Dockerfiles
  const lastbank = firstbank + bankAmount - 1;

  for (let i = firstbank; i <= lastbank; i++) {
    const bankName = `Bank_${i}`;
    const offset = (i - 1) * 10;
    const kAdminPort = keriaAdminPort + offset;
    const kHttpPort = keriaHttpPort + offset;
    const kBootPort = keriaBootPort + offset;
    const keriaAdminUrl = convertDockerHost(`http://localhost:${kAdminPort}`);
    const keriaBootUrl = convertDockerHost(`http://localhost:${kBootPort}`);
    const dockerfileContent = `
  # Use a base image with the correct platform
  FROM node:20-alpine AS base
  WORKDIR /signify-ts-test
  COPY ../signify-ts-test .
  
  # Update npm to the latest version
  RUN npm install -g npm@latest
  RUN npm install --legacy-peer-deps
  
  RUN npm run build
  ENV TEST_ENVIRONMENT=${process.env.TEST_ENVIRONMENT}
  ENV BANK_NUM=${i}
  ENV BANK_NAME=${bankName}
  ENV KERIA=${keriaAdminUrl}
  ENV KERIA_BOOT=${keriaBootUrl}
  ENV KERIA_ADMIN_PORT=${kAdminPort}
  ENV KERIA_HTTP_PORT=${kHttpPort} 
  ENV REG_PILOT_API=${apiBaseUrl}
  ENV REG_PILOT_FILER=${filerBaseUrl}
  # ENV USE_DOCKER_INTERNAL=${process.env.USE_DOCKER_INTERNAL}
  
  CMD ["npx", "jest", "--testNamePattern", "${testName}", "start", "./test/run-workflow-bank.test.ts"]
  `;

    // Write the Dockerfile to the output directory
    const filePath = path.join(outputDir, `bank_${i}.dockerfile`);
    fs.writeFileSync(filePath, dockerfileContent.trim());
    console.log(`Generated: ${filePath} with content: ${dockerfileContent}`);
  }
}

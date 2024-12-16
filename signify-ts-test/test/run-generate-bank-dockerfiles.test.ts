import * as fs from "fs";
import { number } from "mathjs";
import * as path from "path";

const baseKeriaUrl = 20001;
const baseKeriaBootUrl = 20003;
const baseKeriaAgentPort = 20002;
const outputDir = "../images";

// Run containers with --network host to have access to the locally running Kerias(ex. docker run --network host bank_1_api_test)

test("generate-bank-dockerfiles", async function run() {
  // Generate dockerfiles for bank api tests
  const bankAmount = process.env.BANK_COUNT || 1;
  const bankStart = process.env.BANK_START || 0;
  generateDockerfiles(number(bankAmount), number(bankStart));
}, 3600000);

function generateDockerfiles(bankAmount: number, bankStart: number = 0) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate Dockerfiles
  for (let i = (1+bankStart); i <= (bankAmount+bankStart); i++) {
    const bankName = `Bank_${i}`;
    const keriaUrl = `http://host.docker.internal:${baseKeriaUrl + (i - 1) * 10}`;
    const keriaBootUrl = `http://host.docker.internal:${baseKeriaBootUrl + (i - 1) * 10}`;
    const apiBaseUrl = process.env.REG_PILOT_API;

    const dockerfileContent = `
  # Use a base image with the correct platform
  FROM node:20-alpine AS base
  WORKDIR /signify-ts-test
  COPY ../signify-ts-test .
  RUN npm i
  
  RUN npm run build
  ENV BANK_NAME=${bankName}
  ENV KERIA=${keriaUrl}
  ENV KERIA_BOOT=${keriaBootUrl}
  ENV KERIA_AGENT_PORT=${baseKeriaAgentPort + (i - 1) * 10} 
  ENV REG_PILOT_API=${apiBaseUrl}
  
  CMD ["npx", "jest", "start", "./test/run-workflow-bank-api.test.ts"]
  `;

    // Write the Dockerfile to the output directory
    const filePath = path.join(outputDir, `bank_${i}.dockerfile`);
    fs.writeFileSync(filePath, dockerfileContent.trim());
    console.log(`Generated: ${filePath}`);
  }
}

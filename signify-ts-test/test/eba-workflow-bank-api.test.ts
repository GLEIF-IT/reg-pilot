import path from "path";
import { resolveEnvironment, TestEnvironment } from "./utils/resolve-env";

import { getConfig } from "./utils/test-data";

import { runWorkflow } from "./utils/run-workflow";

const fs = require("fs");
const yaml = require("js-yaml");

let env: TestEnvironment;

afterAll((done) => {
  done();
});
beforeAll((done) => {
  process.env.TEST_ENVIRONMENT = "eba_bank_test";
  process.env.KERIA = "http://localhost:20171";
  process.env.KERIA_BOOT = "http://localhost:20173";
  process.env.BANK_NAME = "Bank_18";
  done();
  env = resolveEnvironment();
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

test("eba-api-verifier-bank-test-workflow", async function run() {
  // You need to set the BANK_NAME environment variable. Ex.: export BANK_NAME=Bank_2.
  const bankName = process.env.BANK_NAME;
  const workflowPath = "../src/workflows/eba-api-verifier-test-workflow.yaml";
  const workflow = loadWorkflow(path.join(__dirname, `${workflowPath}`));
  const configFilePath = `${bankName}/config.json`;
  const configJson = await getConfig(configFilePath, true);
  if (workflow && configJson) {
    await runWorkflow(workflow, configJson);
  }
}, 3600000);

// test("hard coded eba api test", async function run() {
//   const url = 'https://errp.test.eba.europa.eu/api/upload';
//   const headers = new Headers({
//     'Accept': 'application/json, text/plain, */*',
//     'Accept-Encoding': 'gzip, deflate, br, zstd',
//     'Accept-Language': 'en-US,en;q=0.9',
//     'Authorization': 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImRpc3BsYXlOYW1lIjoiSm9obiBEb2UiLCJzQU1BY2NvdW50TmFtZSI6IkpvaG4gRG9lIiwidXNlclByaW5jaXBhbE5hbWUiOiJKb2huIERvZSIsImRlcGFydG1lbnQiOiIyMzc5MzJBTFlVTUU3RFFEQzJENyIsImNvIjoiTi9BIiwiYyI6Ik4vQSIsInNpZ25pZnlSZXNvdXJjZSI6IkVMOWJ4UGlmdm9kSmNtTUY2VlIyNWhiSEVOT0xKWWVaWUVtdktRVkxwZmxTIiwidXNlclJvbGVzIjpbIlJPTEVfRVVDTElEX1BJTF9SUlBQT1JUQUxfQVBQQ05UWFQiXSwic2VsZWN0ZWRSb2xlIjoiUk9MRV9FVUNMSURfUElMX1JSUFBPUlRBTF9BUFBDTlRYVCJ9LCJpYXQiOjE3MzQ2MzE4ODEsImV4cCI6MTczNDY3NTA4MSwiYXVkIjoiZXVjbGlkLWF1dGhvcml6YXRpb24tc2VydmljZSIsImlzcyI6ImV1Y2xpZC1jYXBvcnRhbC1hdXRoZW50aWNhdGlvbi1zZXJ2aWNlOjEuMy4xMC00NjctRklOQUwtUElMTEFSMy10cnVuayIsInN1YiI6IkpvaG4gRG9lIn0.a36N6T-C9qlk9aYCrJqVlj5AcVcgdTdmcl9NxQ7W6yeWaau-a24ii4x_EgahManxagErREUmHf48IcCtXPanw7f354QNFoiZMms8SDwFZgLFXMnxbS5oSTjwDOG3gooNSm7s9zNPIeNaKNFCSanhgQy_PcBUaBZKYrJpn5t43NYhWCR7X3ci5u4ud85mNU7rqOBCFk63DhZ35KSefzoGMm0DFOolU9L_G_QRPfIQoqgD990DaY9kznjJCEyhLir8_L44SUkqtB4vpYTXa6yrvdl2cLJoHbzLXUBZvNKYNTDaBO58eBxp53fWaAi7h4SYtRbmo718ILBAynk6QUFyb1j2hSwWeGZnK7jRD4PXjAoxmONvlbx1fGZwAu8vr5sg4xGBdqknKCgF4vSZJrdh7OnjZXqLf3LKY8dazS7afma_xFUy0alb9Il3SPTmpmN_9uja3sxJJtoLp_obcJNSewticT2zd1erPJVOPSXIMFuYjzNdV1q4FaWaqIaO4yd0EFmBcSwCvs8mMqRxL3FMEzd6D_MbQyHvlwqUv1QOCnhXPUmDXxYvB36SjvwaFNtnrm4HX3ldXS9gxtNRd_iS1du4B2pdSjCC938v6D4ItdhQeWsZ7mz_tLO457q2HTOyWjT10yeO6jfJ3SaeQEF5Puz3nSdsG3qX6VeNhH1nGgw',
//     'Cache-Control': 'no-cache',
//     'Connection': 'keep-alive',
//     // 'Content-Length': '155793',
//     'Content-Type': 'multipart/form-data; boundary=----WebKitFormBoundaryMFfstfyLvpcJPEes',
//     'Expires': 'Sat, 01 Jan 2000 00:00:00 GMT',
//     'Host': 'errp.test.eba.europa.eu',
//     'Origin': 'https://errp.test.eba.europa.eu',
//     'Pragma': 'no-cache',
//     'Referer': 'https://errp.test.eba.europa.eu/portal/pillar3/uploadFile',
//     'Sec-Fetch-Dest': 'empty',
//     'Sec-Fetch-Mode': 'cors',
//     'Sec-Fetch-Site': 'same-origin',
//     'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
//     'directory': '237932ALYUME7DQDC2D7.CON',
//     'name': '237932ALYUME7DQDC2D7.CON_GR_PILLAR3010000_P3REMDISDOCS_2023-12-31_202401113083647123_signed.zip',
//     'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
//     'sec-ch-ua-mobile': '?0',
//     'sec-ch-ua-platform': '"macOS"',
//     'signature': 'indexed="?0";signify="0BCUsmykdoYp21CekgM7Mh8ZUNWVMTUiGtBZIEZTOul9xFj5jHmUfdo7BgRWT_0jM7iRWfbstzioFGXGC6iOwrsM"',
//     'signature-input': 'signify=("@method" "@path" "signify-resource" "signify-timestamp");created=1734631888;keyid="BPB49yxZQMwwpT0CHPOSfZWk2T8v3iAVUfgQ24ff-zoF";alg="ed25519"',
//     'signify-resource': 'EL9bxPifvodJcmMF6VR25hbHENOLJYeZYEmvKQVLpflS',
//     'signify-timestamp': '2024-12-19T18:11:28.525000+00:00',
//     'size': '155601',
//     'uiversion': '1.3.10-467-FINAL-PILLAR3-trunk',
//     'x-file-id': '237932ALYUME7DQDC2D7.CON_GR_PILLAR3010000_P3REMDISDOCS_2023-12-31_202401113083647123_signed.zip-1734631175867',
//     'x-start-byte': '0'
//   });
  
//   const formData = new FormData();
//   formData.append('file', new Blob(['file content']), '237932ALYUME7DQDC2D7.CON_GR_PILLAR3010000_P3REMDISDOCS_2023-12-31_202401113083647123_signed.zip');
  
//   const requestOptions = {
//     method: 'POST',
//     headers: headers,
//     body: formData
//   };
  
//   fetch(url, requestOptions)
//     .then(response => response.json())
//     .then(data => console.log(data))
//     .catch(error => console.error('Error:', error));  
// }, 3600000);
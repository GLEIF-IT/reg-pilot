import path from "path";
const fs = require("fs");
const yaml = require("js-yaml");

const tmpReportsPath = path.join(__dirname, "./data/tmp_reports");
const tmpReportsUnpackedPath = path.join(
  __dirname,
  "./data/tmp_reports_unpacked",
);
const signedReportsPath = path.join(__dirname, "./data/signed_reports");
const faileportsPath = path.join(__dirname, "./data/fail_reports");

const removeFolderRecursive = (folderPath: string) => {
  if (fs.existsSync(folderPath)) {
    fs.rmSync(folderPath, { recursive: true, force: true });
    console.log(`Deleted folder: ${folderPath}`);
  } else {
    console.log(`Folder not found: ${folderPath}`);
  }
};

const cleanupReports = (bankName: string) => {
  const currentTmpSignedReportsUnpackedPath = `${tmpReportsUnpackedPath}/${bankName}/reports/signed_reports`;
  const currentTmpFailReportsUnpackedPath = `${tmpReportsUnpackedPath}/${bankName}/reports/fail_reports`;
  const signedItems = fs.readdirSync(currentTmpSignedReportsUnpackedPath);
  signedItems.forEach((item: any) => {
    removeFolderRecursive(`${signedReportsPath}/${item}`);
  });
  const failItems = fs.readdirSync(currentTmpFailReportsUnpackedPath);
  failItems.forEach((item: any) => {
    removeFolderRecursive(`${faileportsPath}/${item}`);
  });
  removeFolderRecursive(`${tmpReportsPath}`);
  removeFolderRecursive(`${tmpReportsUnpackedPath}`);
};
test("bank-reports-cleanup", async function run() {
  // You need to set the BANK_NAME environment variable. Ex.: export BANK_NAME=Bank_2.
  const bankName = process.env.BANK_NAME || "Bank_1";
  cleanupReports(bankName);
}, 3600000);

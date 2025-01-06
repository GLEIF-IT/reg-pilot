import path from "path";
const fs = require("fs");
const yaml = require("js-yaml");

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "../data");

const tmpReportsPath = `${dataDir}/tmp_reports`;
const tmpReportsUnpackedPath = path.join(
  process.cwd(),
  `${dataDir}/tmp_reports_unpacked`
);
const signedReportsPath = `${dataDir}/signed_reports`;
const faileportsPath = `${dataDir}/fail_reports`;

const removeFolderRecursive = (folderPath: string) => {
  if (fs.existsSync(folderPath)) {
    fs.rmSync(folderPath, { recursive: true, force: true });
    console.log(`Deleted folder: ${folderPath}`);
  } else {
    console.log(`Folder not found: ${folderPath}`);
  }
};

export function cleanupReports(
  bankName: string = process.env.BANK_NAME || "Bank_1"
) {
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
}

import path from "path";
const fs = require("fs");
const yaml = require("js-yaml");
import axios from "axios";
import AdmZip from "adm-zip";

const bankReportsUrl =
  "https://raw.githubusercontent.com/aydarng/bank_reports/main";
const tmpReportsPath = path.join(__dirname, "./data/tmp_reports");

const downloadFileFromUrl = async (url: string, destFilePath: string) => {
  const filePath = destFilePath;

  const response = await axios.get(url, {
    responseType: "stream",
  });
  if (!fs.existsSync(tmpReportsPath)) {
    fs.mkdirSync(tmpReportsPath);
  }
  const writer = fs.createWriteStream(filePath);

  return new Promise<void>((resolve, reject) => {
    response.data.pipe(writer);

    writer.on("finish", () => {
      writer.close();
      resolve();
    });

    writer.on("error", (err: any) => {
      writer.destroy();
      reject(err);
    });
  });
};

const unpackZipFile = (
  zipFilePath: string,
  destFolder: string,
  bankName: string,
  includeAllSignedReports = false,
  includeFailReports = false,
) => {
  const zip = new AdmZip(zipFilePath);
  zip.extractAllTo(destFolder, false); // if true overwrites existing files
  const signedReportsPath = path.join(__dirname, "./data/signed_reports");
  const failReportsPath = path.join(__dirname, "./data/fail_reports");
  const confPath = path.join(__dirname, "./data/600-banks-test-data");

  if (!includeAllSignedReports) {
    const specificPrefix = "external_manifest_orig_bundle";
    console.log(`Only moving reports with specific prefix: ${specificPrefix}`);
    moveReports(
      path.join(destFolder, bankName, `/reports/signed_reports`),
      signedReportsPath,
      specificPrefix,
    );
  } else {
    console.log(`Moving all signed reports`);
    moveReports(
      path.join(destFolder, bankName, `/reports/signed_reports`),
      signedReportsPath,
    );
  }
  if (includeFailReports) {
    moveReports(
      path.join(destFolder, bankName, `/reports/fail_reports`),
      failReportsPath,
    );
  }
  moveFiles(path.join(destFolder, bankName), path.join(confPath, bankName));
  removeFolderRecursive(path.join(destFolder, bankName));
};

const removeFolderRecursive = (folderPath: string) => {
  if (fs.existsSync(folderPath)) {
    fs.rmSync(folderPath, { recursive: true, force: true });
    console.log(`Deleted folder: ${folderPath}`);
  } else {
    console.log(`Folder not found: ${folderPath}`);
  }
};

const moveReports = (
  srcDir: string,
  destDir: string,
  specificPrefix?: string,
) => {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const items = fs.readdirSync(srcDir);
  items.forEach((item: any) => {
    if (specificPrefix) {
      const aidPath = path.join(srcDir, item);
      const aidReps = fs.readdirSync(aidPath);
      aidReps.forEach((rep: any) => {
        if (rep.startsWith(specificPrefix)) {
          const srcPath = path.join(aidPath, rep);
          const destPath = path.join(destDir, item, rep);
          fs.cpSync(srcPath, destPath, { recursive: true });
          console.log(`Moved specific report: ${srcPath} to ${destPath}`);
          return;
        }
      });
    } else {
      const srcPath = path.join(srcDir, item);
      const destPath = path.join(destDir, item);
      fs.cpSync(srcPath, destPath, { recursive: true });
      console.log(`Moved report folder: ${srcPath} to ${destPath}`);
    }
  });
};

const moveFiles = (srcDir: string, destDir: string) => {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
    console.log(`Created folder: ${destDir}`);
  }
  const items = fs.readdirSync(srcDir);
  items.forEach((item: any) => {
    const srcPath = path.join(srcDir, item);
    const destPath = path.join(destDir, item);
    if (fs.lstatSync(srcPath).isFile()) {
      fs.cpSync(srcPath, destPath);
      console.log(`Moved file: ${srcPath} to ${destPath}`);
    }
  });
};

test("bank-reports-download", async function run() {
  // You need to set the BANK_NAME environment variable. Ex.: export BANK_NAME=Bank_2.
  const bankName = process.env.BANK_NAME || "Bank_1";
  const curBankReportsUrl = `${bankReportsUrl}/${bankName}.zip`;
  const destFilePath = `${tmpReportsPath}/${bankName}.zip`;
  await downloadFileFromUrl(curBankReportsUrl, destFilePath);

  const includeFailReports = process.env.INCLUDE_FAIL_REPORTS || "false";
  const doFailReps = includeFailReports?.toLowerCase() === "true";
  const includeAllSignedReports =
    process.env.INCLUDE_ALL_SIGNED_REPORTS || "false";
  const doAllSigned = includeAllSignedReports?.toLowerCase() === "true";

  unpackZipFile(
    destFilePath,
    path.join(__dirname, "/data/tmp_reports_unpacked"),
    bankName,
    doAllSigned,
    doFailReps,
  );
  removeFolderRecursive(destFilePath);
}, 3600000);

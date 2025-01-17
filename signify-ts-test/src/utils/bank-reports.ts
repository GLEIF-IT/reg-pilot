import AdmZip from "adm-zip";
import axios from "axios";
import fs from "fs";
import path from "path";
import { TestPaths } from "./resolve-env";

const bankReportsUrl =
  "https://raw.githubusercontent.com/aydarng/bank_reports/main";

export async function downloadFileFromUrl(url: string, destFilePath: string) {
  const testPaths = TestPaths.getInstance();
  const response = await axios.get(url, {
    responseType: "stream",
  });
  if (!fs.existsSync(testPaths.tmpReportUnpackDir)) {
    fs.mkdirSync(testPaths.tmpReportUnpackDir, { recursive: true });
  }
  // Ensure the parent directory for destFilePath exists
  const parentDir = path.dirname(destFilePath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  const writer = fs.createWriteStream(destFilePath);

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
}

export async function downloadReports() {
  const testPaths = TestPaths.getInstance();
  const bankName = testPaths.testUserName;
  console.log(`Downloading reports for bank: ${bankName}`);
  const curBankReportsUrl = `${bankReportsUrl}/${bankName}.zip`;
  const zipFilePath = `${testPaths.tmpReportsDir}/${bankName}.zip`;
  await downloadFileFromUrl(curBankReportsUrl, zipFilePath);

  const includeFailReports = process.env.INCLUDE_FAIL_REPORTS || "false";
  const doFailReps = includeFailReports?.toLowerCase() === "true";
  const includeAllSignedReports =
    process.env.INCLUDE_ALL_SIGNED_REPORTS || "false";
  const doAllSigned = includeAllSignedReports?.toLowerCase() === "true";

  unpackZipFile(zipFilePath, bankName, doAllSigned, doFailReps);
}

export function unpackZipFile(
  zipFilePath: string,
  bankName: string,
  includeAllSignedReports = false,
  includeFailReports = false
) {
  const testPaths = TestPaths.getInstance();
  const zip = new AdmZip(zipFilePath);

  zip.extractAllTo(testPaths.tmpReportUnpackDir, false); // if true overwrites existing files

  if (!includeAllSignedReports) {
    const specificPrefix = "external_manifest";
    console.log(`Only moving reports with specific prefix: ${specificPrefix}`);
    moveReports(
      testPaths.testTmpSignedReports,
      testPaths.testSignedReports,
      specificPrefix
    );
  } else {
    console.log(`Moving all signed reports`);
    moveReports(testPaths.testTmpSignedReports, testPaths.testSignedReports);
  }
  if (includeFailReports) {
    moveReports(testPaths.testTmpFailReports, testPaths.testFailReports);
  }
  moveFiles(
    path.join(testPaths.tmpReportUnpackDir, bankName),
    testPaths.testUserDir
  );
}

const moveReports = (
  srcDir: string,
  destDir: string,
  specificPrefix?: string
) => {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const items = fs.readdirSync(srcDir);
  for (const item of items) {
    if (specificPrefix) {
      const aidPath = path.join(srcDir, item);
      const aidReps = fs.readdirSync(aidPath);
      for (const rep of aidReps) {
        if (rep.startsWith(specificPrefix)) {
          const srcPath = path.join(aidPath, rep);
          const destPath = path.join(destDir, item, rep);
          fs.cpSync(srcPath, destPath, { recursive: true });
          console.log(`Moved specific report: ${srcPath} to ${destPath}`);
          break;
        }
      }
    } else {
      const srcPath = path.join(srcDir, item);
      const destPath = path.join(destDir, item);
      fs.cpSync(srcPath, destPath, { recursive: true });
      console.log(`Moved report folder: ${srcPath} to ${destPath}`);
    }
  }
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

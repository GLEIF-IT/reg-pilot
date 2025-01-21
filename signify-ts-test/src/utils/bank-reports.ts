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

export async function downloadReports(
  bankNum: number,
  doAllSigned = false,
  doFailReps = false
) {
  const bankName = `Bank_${bankNum}`;
  const testPaths = TestPaths.getInstance(bankName);
  console.log(`Downloading reports for bank: ${bankName}`);
  const curBankReportsUrl = `${bankReportsUrl}/${bankName}.zip`;
  const zipFilePath = `${testPaths.tmpReportsDir}/${bankName}.zip`;
  await downloadFileFromUrl(curBankReportsUrl, zipFilePath);

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

const removeFolderRecursive = (folderPath: string) => {
  if (fs.existsSync(folderPath)) {
    fs.rmSync(folderPath, { recursive: true, force: true });
    console.log(`Deleted folder: ${folderPath}`);
  } else {
    console.log(`Folder not found: ${folderPath}`);
  }
};

export function cleanupReports(bankNum: number) {
  const testPaths = TestPaths.getInstance("Bank_" + bankNum);
  const signedItems = fs.readdirSync(testPaths.testTmpSignedReports);
  signedItems.forEach((item: any) => {
    removeFolderRecursive(path.join(testPaths.testTmpSignedReports, item));
  });
  const failItems = fs.readdirSync(testPaths.testTmpFailReports);
  failItems.forEach((item: any) => {
    removeFolderRecursive(path.join(testPaths.testTmpFailReports, item));
  });
  removeFolderRecursive(testPaths.tmpReportsDir);
  removeFolderRecursive(testPaths.tmpReportUnpackDir);
}

export function createZipWithCopies(pdfPath: string, maxSizeMb: number, replaceZip = "true"): string {
  const zip = new AdmZip();
  const pdfData = fs.readFileSync(pdfPath);
  const pdfSize = pdfData.length;
  let currentSize = 0;
  let copyIndex = 1;
  const maxSizeBytes = maxSizeMb * 1024 * 1024; // Convert MB to bytes
  do {
    const pdfName = `${path.basename(pdfPath, ".pdf")}_${copyIndex}.pdf`;
    zip.addFile(pdfName, pdfData);
    console.log(`Added ${pdfName} to ZIP file`);
    currentSize += pdfSize;
    copyIndex++;
    console.log(`Current ZIP size: ${currentSize} bytes`);
  } while (currentSize < maxSizeBytes);
  const outputZipPath = path.format({
    dir: path.dirname(pdfPath),
    name: path.basename(pdfPath, '.pdf'),
    ext: '.zip'
  });

  // Remove the ZIP file if it already exists
  if (fs.existsSync(outputZipPath) && replaceZip) {
    fs.unlinkSync(outputZipPath);
    console.log(`Removed existing ZIP file at ${outputZipPath}`);
  }

  zip.writeZip(outputZipPath);
  console.log(
    `Created ZIP file at ${outputZipPath} with size ${currentSize} bytes`
  );
  return outputZipPath;
}

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
  if (!fs.existsSync(testPaths.testUserDir)) {
    fs.mkdirSync(testPaths.testUserDir, { recursive: true });
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

export async function downloadConfigWorkflowReports(
  bankName: string,
  doReports = true,
  doAllSigned = false,
  doFailReps = false,
  refresh = true,
) {
  const testPaths = TestPaths.getInstance();
  const zipFilePath = `${testPaths.tmpReportsDir}/${bankName}.zip`;
  const curBankZipUrl = `${bankReportsUrl}/${bankName}.zip`;

  if (refresh || !fs.existsSync(zipFilePath)) {
    try {
      console.log(`Downloading workflow/config/reports for bank: ${bankName}`);
      await downloadFileFromUrl(curBankZipUrl, zipFilePath);
    } catch (error) {
      console.warn(
        `Error downloading config/workflow/reports for: ${bankName}`,
        error,
      );
    }
  } else {
    console.log(
      `Using existing ZIP file: ${zipFilePath} for bank: ${bankName}`,
    );
  }
  unpackZipFile(zipFilePath, bankName, doReports, doAllSigned, doFailReps);
}

export function unpackZipFile(
  zipFilePath: string,
  bankName: string,
  includeReports = true,
  includeAllSignedReports = false,
  includeFailReports = false,
) {
  const testPaths = TestPaths.getInstance();
  const zip = new AdmZip(zipFilePath);

  zip.extractAllTo(testPaths.testUsersDir, true); // if true overwrites existing files

  if (includeReports && !includeAllSignedReports) {
    const specificRepType = "external_manifest";
    console.log(`Only moving reports with specific prefix: ${specificRepType}`);
    moveReports(
      testPaths.testTmpSignedReports,
      testPaths.testSignedReports,
      specificRepType,
    );
  } else if (includeReports) {
    console.log(`Moving all signed reports`);
    moveReports(testPaths.testTmpSignedReports, testPaths.testSignedReports);
  }
  if (includeReports && includeFailReports) {
    moveReports(testPaths.testTmpFailReports, testPaths.testFailReports);
  }
}

const moveReports = (
  srcDir: string,
  destDir: string,
  specificRepType?: string,
) => {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const items = fs.readdirSync(srcDir);
  for (const item of items) {
    if (specificRepType) {
      const aidPath = path.join(srcDir, item);
      const aidReps = fs.readdirSync(aidPath);
      for (const rep of aidReps) {
        if (rep.startsWith(specificRepType)) {
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
}

export function createZipWithCopies(
  pdfPath: string,
  bankName: string,
  maxSizeMb: number,
  replaceZip = true,
  divisor = 1,
): string {
  let zipFileName = path.basename(pdfPath, ".pdf");
  // if (userNum) {
  //    zipFileName += `_${userNum}`
  // }
  const outputZipPath = path.format({
    dir: path.join(path.dirname(pdfPath), bankName),
    name: zipFileName,
    ext: ".zip",
  });

  // Remove the ZIP file if it already exists
  if (fs.existsSync(outputZipPath) && !replaceZip) {
    console.log(`ZIP file already exists at ${outputZipPath}`);
    return outputZipPath;
  } else if (fs.existsSync(outputZipPath) && replaceZip) {
    fs.unlinkSync(outputZipPath);
    console.log(`Removed existing ZIP file at ${outputZipPath}`);
  }

  const zip = new AdmZip();
  const pdfData = fs.readFileSync(pdfPath);
  const pdfSize = pdfData.length;
  let currentSize = 0;
  let copyIndex = 1;
  const maxSizeBytes = (maxSizeMb * 1024 * 1024) / divisor; // Convert MB to bytes
  do {
    const pdfName = `${path.basename(pdfPath, ".pdf")}_${copyIndex}.pdf`;
    zip.addFile(pdfName, pdfData);
    currentSize += pdfSize;
    copyIndex++;
    if (copyIndex % 100 === 0) {
      console.log(`Added ${pdfName} to ZIP file`);
      console.log(`Current ZIP size: ${currentSize} bytes`);
    }
  } while (currentSize < maxSizeBytes);

  console.log(`Added ${copyIndex - 1} pdfs to ZIP file`);
  console.log(`ZIP size: ${currentSize} bytes`);

  // make the parent path for the output ZIP file
  const parentDir = path.dirname(outputZipPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  zip.writeZip(outputZipPath);
  console.log(
    `Created ZIP file at ${outputZipPath} with size ${currentSize} bytes`,
  );
  return outputZipPath;
}

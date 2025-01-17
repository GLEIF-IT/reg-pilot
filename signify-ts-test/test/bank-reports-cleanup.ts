import path from "path";
import { TestPaths } from "../src/utils/resolve-env";
import fs from "fs";

const removeFolderRecursive = (folderPath: string) => {
  if (fs.existsSync(folderPath)) {
    fs.rmSync(folderPath, { recursive: true, force: true });
    console.log(`Deleted folder: ${folderPath}`);
  } else {
    console.log(`Folder not found: ${folderPath}`);
  }
};

export function cleanupReports() {
  const testPaths = TestPaths.getInstance();
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

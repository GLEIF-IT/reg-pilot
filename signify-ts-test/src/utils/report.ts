import { strict as assert } from "assert";
import fs from "fs";
import * as path from "path";
import AdmZip from "adm-zip";
import * as fsExtra from "fs-extra";
import { generateFileDigest } from "./generate-digest";
import signify, { Signer } from "signify-ts";
import { TestEnvironment, TestPaths } from "./resolve-env";

import { unknownPrefix } from "../constants";

export const EXTERNAL_MAN_TYPE = "external_manifest";
export const SIMPLE_TYPE = "simple";
export const UNFOLDERED_TYPE = "unfoldered";
export const UNZIPPED_TYPE = "unzipped";
export const FAIL_TYPE = "fail";

const tempDir = "temp_reports";

// Function to delete a report dir'
function deleteReportsDir(repDir: string): void {
  if (fs.existsSync(repDir)) {
    fs.rmSync(repDir, { recursive: true });
    // fs.rmdirSync(dirPath, { recursive: true });
    // console.log("Directory temp_reports deleted.", dirPath);
  } else {
    // console.log("Directory temp_reports does not exist.", dirPath);
  }
}

export async function generate_reports(
  ecrAid: string,
  keeper: signify.Keeper,
  unsignedReports: string[],
  reportTypes: string[],
  copyFolder?: string
) {
  let zipsProcessed = 0;
  const signedReports = [] as string[];
  console.log(
    `Generating ${reportTypes} signed reports from orig reports: ${unsignedReports}`
  );

  for (const unsignedReport of unsignedReports) {
    const unsignedDir = path.dirname(unsignedReport);
    const dataDir = path.dirname(unsignedDir);

    const failDirPrefixed = path.join(dataDir, "failDir", ecrAid);
    const signedDirPrefixed = path.join(dataDir, "signedDir", ecrAid);
    const tempPath = path.join(dataDir, tempDir);
    deleteReportsDir(signedDirPrefixed);
    deleteReportsDir(failDirPrefixed);

    deleteReportsDir(tempPath);
    fs.mkdirSync(tempDir, { recursive: true });
    const signedReports = await createSignedReports(
      unsignedReport,
      reportTypes,
      keeper,
      ecrAid,
      signedDirPrefixed
    );

    assert.equal(signedReports.length > 0, true);

    if (reportTypes.includes(FAIL_TYPE)) {
      deleteReportsDir(tempPath);
      fs.mkdirSync(tempDir, { recursive: true });
      assert.equal(
        await createFailReports(failDirPrefixed, signedDirPrefixed),
        true
      );
    }

    if (copyFolder) {
      fs.cpSync(
        signedDirPrefixed,
        path.join(dataDir, copyFolder, "signed_reports", ecrAid),
        { recursive: true }
      );
      if (reportTypes.includes(FAIL_TYPE)) {
        fs.cpSync(
          failDirPrefixed,
          path.join(dataDir, copyFolder, "fail_reports", ecrAid),
          { recursive: true }
        );
      }
    }
    zipsProcessed += 1;
  }

  assert(zipsProcessed > 0, "No reports zip files processed");
}

module.exports = {
  generate_reports,
  createSignedReports,
  getEbaSignedReport,
  SIMPLE_TYPE,
};

export async function createSignedReports(
  filePath: string,
  reportTypes: string[] = [SIMPLE_TYPE],
  keeper: signify.Keeper,
  ecrAid: string,
  signedDirPrefixed: string
): Promise<string[]> {
  const fileName = path.basename(filePath, path.extname(filePath));
  const signedReports = [] as string[];
  const testPaths = TestPaths.getInstance();
  if (fs.lstatSync(filePath).isFile()) {
    const zip = new AdmZip(filePath);
    fsExtra.emptyDirSync(testPaths.tmpReportsDir);
    const fileExtension = path.extname(filePath);

    // generate packaged signed report types
    if (
      reportTypes.includes(EXTERNAL_MAN_TYPE) ||
      reportTypes.includes(UNZIPPED_TYPE)
    ) {
      zip.extractAllTo(testPaths.tmpReportsDir, true);

      const foundPath = findReportsDir(testPaths.tmpReportsDir);
      if (!foundPath) {
        throw new Error(`No reports directory found in ${testPaths.tmpReportsDir}`);
      }
      const complexManifest = await buildManifest(
        foundPath,
        false,
        keeper,
        ecrAid
      );
      const complexManJson = JSON.stringify(complexManifest, null, 2);
      if (reportTypes.includes(EXTERNAL_MAN_TYPE)) {
        console.log(`Processing external manifest file signature: ${filePath}`);
        // extract the zip so we can produce digests/signatures for each file

        let shortFileName = `${EXTERNAL_MAN_TYPE}_${fileName}_signed${fileExtension}`;
        const signedRepPath = path.join(signedDirPrefixed, shortFileName);
        console.log(
          `Creating ${EXTERNAL_MAN_TYPE} packaged signed report ` +
            signedRepPath
        );
        await createExternalManifestZip(
          signedRepPath,
          filePath,
          complexManJson
        );
        signedReports.push(signedRepPath);
      }
      if (reportTypes.includes(UNZIPPED_TYPE)) {
        const manPath = await writeReportsJson(testPaths.tmpReportsDir, complexManJson);
        if (reportTypes.includes(UNFOLDERED_TYPE)) {
          //generate unfoldered zip, like older xbrl spec
          const unfolderedShortFileName = `${UNFOLDERED_TYPE}_${UNZIPPED_TYPE}_${fileName}_signed${fileExtension}`;
          const unfolderedRepPath = path.join(
            signedDirPrefixed,
            unfolderedShortFileName
          );
          console.log(
            "Creating unfoldered+unzipped signed report " + unfolderedRepPath
          );
          const sufZip = await transferTempToZip(
            testPaths.tmpReportsDir,
            unfolderedRepPath,
            false
          );
          validateReport(new AdmZip(sufZip));
          signedReports.push(unfolderedRepPath);
        }
        // generate unzipped foldered signed report
        const shortFileName = `${UNZIPPED_TYPE}_${fileName}_signed${fileExtension}`;
        const repPath = path.join(signedDirPrefixed, shortFileName);
        console.log("Creating unzipped+foldered signed report " + repPath);
        const sfZip = await transferTempToZip(testPaths.tmpReportsDir, repPath);
        validateReport(new AdmZip(sfZip));
        signedReports.push(repPath);
        fsExtra.emptyDirSync(testPaths.tmpReportsDir);
      }
    }
    if (reportTypes.includes(SIMPLE_TYPE)) {
      console.log(`Processing simple file signature: ${filePath}`);
      // just copy the zip file here for a single digest/signature
      fsExtra.copySync(filePath, path.join(testPaths.tmpReportsDir, path.basename(filePath)));
      console.log(`Copied ${filePath} to ${testPaths.tmpReportsDir}`);
      // }

      const simpleManifest = await buildManifest(
        testPaths.tmpReportsDir,
        true,
        keeper,
        ecrAid
      );
      const simpleManJson = JSON.stringify(simpleManifest, null, 2);

      const manifestPath = path.join(testPaths.tmpReportsDir, "META-INF", "reports.json");
      console.log(`Writing manifest with digests/signatures ${manifestPath}`);

      const manifestDir = path.dirname(manifestPath);
      if (!fs.existsSync(manifestDir)) {
        fs.mkdirSync(manifestDir, { recursive: true });
      }

      fs.writeFileSync(manifestPath, simpleManJson, "utf8");
      const shortFileName = `${fileName}_signed${fileExtension}`;
      const signedRepPath = path.join(signedDirPrefixed, shortFileName);
      console.log(`Creating simple packaged signed report ${signedRepPath}`);
      const sfZip = await transferTempToZip(testPaths.tmpReportsDir, signedRepPath);
      validateReport(new AdmZip(sfZip));
      signedReports.push(signedRepPath);
    }
  }
  return signedReports;
}

export async function getEbaSignedReport(
  filePath: string,
  signedDirPath: string,
  aid: string,
  keeper: signify.Keeper
): Promise<string> {
  const signedZips = await createSignedReports(
    filePath,
    [SIMPLE_TYPE],
    keeper,
    aid,
    path.join(signedDirPath, aid)
  );
  return signedZips[0];
}

async function buildManifest(
  repDirPath: string,
  simple: boolean,
  keeper: signify.Keeper,
  ecrAid: string
): Promise<Manifest> {
  const reportEntries = await fs.promises.readdir(repDirPath, {
    withFileTypes: true,
  });

  let docInfo = {
    documentType: "http://xbrl.org/PWD/2020-12-09/report-package",
    signatures: [] as Signature[],
  } as DocumentInfo;
  let manifest = {
    documentInfo: docInfo,
  } as Manifest;
  for (const reportEntry of reportEntries) {
    let signature: Signature = {
      file: "",
      digest: "",
      aid: "",
      sigs: [],
    };

    const reportPath = path.join(repDirPath, reportEntry.name);
    const digested = await addDigestToReport(reportPath, signature, simple);
    assert(digested, `Failed to add digest for ${reportPath}`);

    const signed = await addSignatureToReport(signature, keeper, ecrAid);
    assert(signed, `Failed to add signature for ${reportPath}`);

    docInfo.signatures.push(signature);
  }
  return manifest;
}

async function createFailReports(
  failDirPrefixed: string,
  signedDirPrefixed: string
): Promise<boolean> {
  const failFuncs: Array<(manifestPath: string) => Promise<boolean>> = [
    genMissingSignature,
    genNoSignature,
    removeMetaInfReportsJson,
    wrongAid,
  ];
  console.log("Generating test case: no META-INF/reports.json");

  // Loop over the reports directory
  const reports = fs.readdirSync(signedDirPrefixed);

  for (const file of reports) {
    const filePath = path.join(signedDirPrefixed, file);
    if (fs.lstatSync(filePath).isFile()) {
      console.log(`Processing file: ${filePath}`);
      const zip = new AdmZip(filePath);
      let fullTemp = path.join(process.cwd(), tempDir);
      fsExtra.emptyDirSync(fullTemp);
      for (const failFunc of failFuncs) {
        validateReport(zip);
        zip.extractAllTo(fullTemp, true);

        const repDirs: string[] = await listDirectories(fullTemp);
        let manifestPath;
        let foldered = true;
        if (repDirs.includes("META-INF")) {
          // either this is a zip packaged report or an unfoldered report
          manifestPath = path.join(fullTemp, "META-INF", "reports.json");
          foldered = false;
        } else {
          // this is a foldered report
          assert.equal(repDirs.length, 1);
          for (const repDir of repDirs) {
            const repDirPath = path.join(fullTemp, repDir);
            const repDirs = await listDirectories(repDirPath);
            if (repDirs.includes("META-INF")) {
              manifestPath = path.join(repDirPath, "META-INF", "reports.json");
              break;
            }
          }
        }
        assert(manifestPath, "No META-INF/reports.json found in " + fullTemp);
        assert.equal(fs.existsSync(manifestPath), true);
        assert.equal(await failFunc(manifestPath), true);
        // Extract the file name and extension
        const fileName = path.basename(file, path.extname(file));
        const fileExtension = path.extname(file);
        const shortFileName = `${failFunc.name}_${fileName}${fileExtension}`;
        const repPath = path.join(failDirPrefixed, shortFileName);
        const failZip = await transferTempToZip(fullTemp, repPath, true);
        if (failZip) {
          fsExtra.emptyDirSync(fullTemp);
        }
        // }
      }
    }
  }

  return true;
}

async function genMissingSignature(manifestPath: string): Promise<boolean> {
  console.log(`Generating missing signature case for manifest ${manifestPath}`);

  assert.equal(fs.existsSync(manifestPath), true);
  const data = await fs.promises.readFile(manifestPath, "utf-8");
  let manifest: Manifest = JSON.parse(data);
  const signatures: Signature[] = manifest.documentInfo.signatures;

  // Remove one signature entry from the manifest
  if (manifest.documentInfo && manifest.documentInfo.signatures) {
    const origSigs = manifest.documentInfo.signatures;
    const numSigs = origSigs.length;
    if (numSigs > 0) {
      const remSig = origSigs.shift(); // Remove the first signature
      // Save the modified manifest back to reports.json
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      assert.equal(origSigs.length, numSigs - 1);
      return true;
    } else {
      throw new Error("No signatures to remove from " + manifestPath);
    }
  }

  throw new Error("Could not remove signature from " + manifestPath);
}

async function wrongAid(manifestPath: string): Promise<boolean> {
  console.log(`Generating wrong AID case for manifest ${manifestPath}`);

  assert.equal(fs.existsSync(manifestPath), true);
  const data = await fs.promises.readFile(manifestPath, "utf-8");
  let manifest: Manifest = JSON.parse(data);
  const signatures: Signature[] = manifest.documentInfo.signatures;

  // Remove one signature entry from the manifest
  if (manifest.documentInfo && manifest.documentInfo.signatures) {
    for (const sig of manifest.documentInfo.signatures) {
      sig.aid = unknownPrefix;
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    return true;
  }

  throw new Error("No signatures to add unknown aid to " + manifestPath);
}

async function genNoSignature(manifestPath: string): Promise<boolean> {
  assert.equal(fs.existsSync(manifestPath), true);
  const data = await fs.promises.readFile(manifestPath, "utf-8");
  let manifest: Manifest = JSON.parse(data);

  // Remove all signature entries from the manifest
  if (manifest.documentInfo && manifest.documentInfo.signatures) {
    const origSigs = manifest.documentInfo.signatures;
    const numSigs = origSigs.length;
    if (numSigs > 0) {
      origSigs.length = 0; // Remove all signatures
      // Save the modified manifest back to reports.json
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      assert.equal(origSigs.length, 0);
      return true;
    } else {
      throw new Error("No signatures to remove from " + manifestPath);
    }
  }

  throw new Error("Could not remove signatures from " + manifestPath);
}

async function listDirectories(directoryPath: string): Promise<string[]> {
  try {
    const entries = await fs.promises.readdir(directoryPath, {
      withFileTypes: true,
    });
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    return directories;
  } catch (error) {
    console.error(`Error reading directory: ${error}`);
    return [];
  }
}

async function listReportZips(dir: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    fs.readdir(dir, async (err, files) => {
      if (err) {
        return reject(err);
      }
      const zipFiles = files.filter((file) => path.extname(file) === ".zip");
      const reportZips = [];
      for (const zipFile of zipFiles) {
        const zip = new AdmZip(path.join(dir, zipFile));
        const zipEntries = zip.getEntries();
        if (
          zipEntries.some(
            (entry) => entry.isDirectory && entry.entryName.endsWith("reports/")
          )
        ) {
          if (reportZips.length > 0) {
            throw new Error(
              "Multiple report zips found in but we dont handle that case currnetly " +
                dir
            );
          }
          reportZips.push(zipFile);
        }
      }
      resolve(reportZips);
    });
  });
}

async function removeMetaInfReportsJson(
  manifestPath: string
): Promise<boolean> {
  if (fs.existsSync(manifestPath)) {
    console.log(`Removing ${manifestPath}`);
    fs.unlinkSync(manifestPath);
    assert.equal(fs.existsSync(manifestPath), false);
    return true;
  }
  throw new Error(`Missing manifest file ${manifestPath}`);
}

async function addSignatureToReport(
  signatureBlock: Signature,
  keeper: signify.Keeper,
  ecrAid: string
): Promise<boolean> {
  const sigs = [] as string[];
  for (const signer of keeper.signers as Signer[]) {
    const nonPrefixedDigest = signatureBlock.digest.split("-", 2)[1];
    // console.log(`Signing non-prefixed digest ${nonPrefixedDigest}`);

    const sig = signer.sign(signify.b(nonPrefixedDigest), 0);
    const result = signer.verfer.verify(sig.raw, nonPrefixedDigest);
    assert.equal(result, true);
    sigs.push(sig.qb64);
  }
  assert(
    sigs.length > 0,
    `No signatures added to signature block ${signatureBlock}`
  );
  signatureBlock.sigs = sigs;
  signatureBlock.aid = ecrAid;

  return true;
}

async function addDigestToReport(
  reportPath: string,
  signatureBlock: Signature,
  simple = false
): Promise<boolean> {
  const reportName = path.basename(reportPath);
  const buffer = await fs.promises.readFile(reportPath);
  const dig = generateFileDigest(buffer);

  let relativeFilePath;
  if (simple) {
    relativeFilePath = `${reportName}`;
  } else {
    relativeFilePath = `${path.basename(path.dirname(reportPath))}/${reportName}`;
  }
  signatureBlock.file = relativeFilePath;
  signatureBlock.digest = dig;

  return true;
}

// Function to create a zip file from a temporary directory
async function transferTempToZip(
  tempDir: string,
  filePath: string,
  allowSubDir: boolean = true
): Promise<string> {
  const zip = new AdmZip();
  if (allowSubDir) {
    zip.addLocalFolder(tempDir);
  } else {
    const dirs: string[] = await listDirectories(tempDir);
    let found = false;
    for (const dir of dirs) {
      const repDirPath = path.join(tempDir, dir);
      zip.addLocalFolder(repDirPath);
    }
  }

  // Ensure the output directory exists
  if (!fs.existsSync(path.dirname(filePath))) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  // Write the zip file to the desired file path
  zip.writeZip(filePath);

  // Assert that the filePath exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`Failed to create the zip file at ${filePath}`);
  } else {
    console.log(`Zip file created at ${filePath}`);
    console.log(
      `Zip file contains: ${zip.getEntries().map((entry) => entry.entryName)}`
    );
  }

  return filePath;
}

interface Signature {
  file: string;
  digest: string;
  aid: string;
  sigs: string[];
}

interface DocumentInfo {
  documentType: string;
  extends: string[];
  signatures: Signature[];
}

interface Manifest {
  documentInfo: DocumentInfo;
}

async function getRepPath(fullTemp: string): Promise<string> {
  const dirs: string[] = await listDirectories(fullTemp);

  const repZip: string[] = await listReportZips(fullTemp);
  let repDirPath: string = fullTemp;
  if (dirs.includes("META-INF")) {
    if (dirs.includes("reports")) {
      console.log(
        "Non-foldered report, found META-INF and reports directories"
      );
    } else if (repZip.length > 0) {
      console.log(
        "Packaged report, found META-INF and zip with reports directories"
      );
    } else {
      throw new Error(
        "Report has META-INF but no reports directory or zip " + fullTemp
      );
    }
  } else {
    let found = false;
    for (const dir of dirs) {
      repDirPath = path.join(fullTemp, dir);
      const repDirs = await listDirectories(repDirPath);
      if (repDirs.includes("META-INF") && repDirs.includes("reports")) {
        console.log("Foldered report, found META-INF and reports directories");
        found = true;
        break;
      }
    }
    assert(
      found,
      "Report is missing dir with META-INF and/or reports directory in " +
        fullTemp
    );
  }
  return repDirPath;
}

async function createExternalManifestZip(
  signedRepPath: string,
  origZipFilePath: string,
  manJson: string
): Promise<void> {
  // Create a temporary directory
  const tempDir = path.join(process.cwd(), "tempZipDir");
  fsExtra.emptyDirSync(tempDir);

  // Extract the original zip file to the temporary directory
  const destOrigZip = path.join(tempDir, path.basename(origZipFilePath));
  fs.copyFileSync(origZipFilePath, destOrigZip);

  // Create META-INF directory inside the temporary directory
  const metaInfDir = path.join(tempDir, "META-INF");
  if (!fs.existsSync(metaInfDir)) {
    fs.mkdirSync(metaInfDir);
  }

  const destManifestPath = path.join(metaInfDir, "reports.json");
  fs.writeFileSync(destManifestPath, manJson, "utf8");
  console.log(`Manifest written to path ${destManifestPath}: ${manJson}`);

  // Create a new zip file that includes the contents of the temporary directory
  const newZip = new AdmZip();
  newZip.addLocalFolder(tempDir);
  newZip.writeZip(signedRepPath);

  // Clean up the temporary directory
  fsExtra.removeSync(tempDir);

  console.log(
    `${EXTERNAL_MAN_TYPE} zip package file created at: ${signedRepPath}`
  );
}

function validateReport(zip: AdmZip) {
  const zipEntries = zip.getEntries();
  // Check for META-INF directory and report.json
  const metaInfEntry = zipEntries.find((entry) =>
    entry.entryName.endsWith("META-INF/")
  );
  if (!metaInfEntry) {
    throw new Error("META-INF directory not found in the zip file");
  }

  const reportJsonEntry = zipEntries.find((entry) =>
    entry.entryName.endsWith("META-INF/reports.json")
  );
  if (!reportJsonEntry) {
    throw new Error("report.json not found in META-INF directory");
  }

  // Check for reports directory or zip file
  const reportsEntry = zipEntries.find(
    (entry) => entry.entryName.endsWith("reports/") && entry.isDirectory
  );
  const reportsZipEntry = zipEntries.find((entry) =>
    entry.entryName.endsWith(".zip")
  );

  if (!reportsEntry && !reportsZipEntry) {
    throw new Error(
      "Neither reports directory nor zip file found in the zip file"
    );
  }

  console.log(
    "Validation passed: META-INF directory with report.json and either reports directory or zip file found."
  );
}

function findReportsDir(dirPath: string): string | null {
  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.lstatSync(fullPath).isDirectory()) {
      if (file === "reports") {
        return fullPath;
      } else {
        const found = findReportsDir(fullPath);
        if (found) {
          return found;
        }
      }
    }
  }

  return null;
}

async function writeReportsJson(
  fullTemp: string,
  manJson: string
): Promise<string> {
  const dirPath = await getRepPath(fullTemp);
  const manifestPath = path.join(dirPath, "META-INF", "reports.json");
  fs.writeFileSync(manifestPath, manJson, "utf8");
  console.log(`Manifest written to path ${manifestPath}: ${manJson}`);
  return manifestPath;
}

import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import AdmZip from "adm-zip";
import * as fsExtra from "fs-extra";
import { generateFileDigest } from "./utils/generate-digest";
import { Aid, getOrCreateClients } from "./utils/test-util";
import signify, { HabState, Signer, SignifyClient } from "signify-ts";
import { resolveEnvironment, TestEnvironment } from "./utils/resolve-env";
import { buildUserData, User } from "../src/utils/handle-json-config";

import { unknownPrefix } from "../src/constants";

let env: TestEnvironment;
let ecrAid: HabState;
let roleClient: SignifyClient;
let keeper: signify.Keeper;

const origDir = "orig_reports";
let unsignedReports: string[];
const failDir = "fail_reports";
let failDirPrefixed: string;
const signedDir = "signed_reports";
let signedDirPrefixed: string;
const tempDir = "temp_reports";
const secretsJsonPath = "../src/config/";
let users: Array<User>;
const tempExtManifestDir = "temp_manifest";

afterAll(async () => {
  deleteReportsDir(tempDir);
});

beforeAll(async () => {
  env = resolveEnvironment();
  const secretsJson = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, secretsJsonPath + env.secretsJsonConfig),
      "utf-8",
    ),
  );
  users = await buildUserData(secretsJson);
  unsignedReports = process.env.UNSIGNED_REPORTS
    ? process.env.UNSIGNED_REPORTS.split(",")
    : getDefaultOrigReports();
});

// Function to create a report dir
function createReportsDir(tempDir: string): void {
  const dirPath = path.join(__dirname, tempDir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath);
    console.log("Directory temp_reports created.");
  } else {
    console.log("Directory temp_reports already exists.");
  }
}

// Function to delete a report dir'
function deleteReportsDir(repDir: string): void {
  const dirPath = path.join(__dirname, repDir);
  if (fs.existsSync(dirPath)) {
    fs.rmdirSync(dirPath, { recursive: true });
    console.log("Directory temp_reports deleted.", dirPath);
  } else {
    console.log("Directory temp_reports does not exist.", dirPath);
  }
}

// This test assumes you have run a vlei-issuance test that sets up the glief, qvi, le, and
// role identifiers and Credentials.
test("report-generation-test", async function run() {
  for (const user of users) {
    const clients = await getOrCreateClients(
      1,
      [user.secrets.get("ecr")!],
      true,
    );
    roleClient = clients[clients.length - 1];
    ecrAid = await roleClient.identifiers().get("ecr1");
    keeper = roleClient.manager!.get(ecrAid);
    failDirPrefixed = path.join(__dirname, "data", failDir, ecrAid.prefix);
    signedDirPrefixed = path.join(__dirname, "data", signedDir, ecrAid.prefix);
    await generate_reports(ecrAid, keeper, signedDirPrefixed, failDirPrefixed);
  }
}, 100000);

async function generate_reports(
  ecrAid: HabState,
  keeper: signify.Keeper,
  signedDirPrefixed: string,
  failDirPrefixed: string,
) {
  deleteReportsDir(tempDir);
  createReportsDir(tempDir);
  deleteReportsDir(signedDirPrefixed);
  const signedSuccess = await createSignedReports(
    unsignedReports,
    ecrAid,
    keeper,
  );
  assert.equal(signedSuccess, true);

  if (signedSuccess) {
    deleteReportsDir(tempDir);
    createReportsDir(tempDir);
    assert.equal(await updateUnknownReport(), true);
    deleteReportsDir(tempDir);
    createReportsDir(tempDir);
    deleteReportsDir(failDirPrefixed);
    assert.equal(
      await createFailReports(failDirPrefixed, signedDirPrefixed),
      true,
    );
  }
}

async function createSignedReports(
  filePaths: string[],
  ecrAid: HabState,
  keeper: signify.Keeper,
): Promise<boolean> {
  for (const filePath of filePaths) {
    const fileName = path.basename(filePath, path.extname(filePath));
    if (fs.lstatSync(filePath).isFile()) {
      console.log(`Processing file: ${filePath}`);
      const zip = new AdmZip(filePath);
      const fullTemp = path.join(__dirname, tempDir);
      fsExtra.emptyDirSync(fullTemp);
      zip.extractAllTo(fullTemp, true);

      const repDirPath = await getRepPath(fullTemp);

      const tempManDir = path.join(__dirname, tempExtManifestDir);
      fsExtra.ensureDirSync(tempManDir);
      const tempMetaDir = path.join(tempExtManifestDir, "META-INF");
      fsExtra.ensureDirSync(tempMetaDir);
      const tempManifest = path.join(tempMetaDir, "reports.json");

      const manDigested = await addDigestsToReport(
        repDirPath,
        ecrAid.prefix,
        tempManifest,
      );
      if (manDigested) {
        //generate packaged zip, like older xbrl spec
        await signReport(repDirPath, tempManifest, keeper);
        const fileExtension = path.extname(filePath);
        const shortFileName = `${fileName}_signed${fileExtension}`;
        const signedRepPath = path.join(signedDirPrefixed, shortFileName);
        console.log("Creating packaged signed report " + signedRepPath);
        await createExternalManifestZip(signedRepPath, filePath, tempManifest);
      }

      const digested: boolean = await addDigestsToReport(
        repDirPath,
        ecrAid.prefix,
      );
      if (digested) {
        //generate foldered zip, like older xbrl spec
        const manifestPath = path.join(repDirPath, "META-INF", "reports.json");
        await signReport(repDirPath, manifestPath, keeper);
        const fileExtension = path.extname(filePath);
        const shortFileName = `unzipped${fileName}_signed${fileExtension}`;
        const repPath = path.join(signedDirPrefixed, shortFileName);
        console.log("Creating foldered signed report " + repPath);
        const sfZip = await transferTempToZip(fullTemp, repPath);
        validateReport(new AdmZip(sfZip));

        //generate unfoldered zip, like older xbrl spec
        const unfolderedShortFileName = `unzipped_unfoldered${fileName}_signed${fileExtension}`;
        const unfolderedRepPath = path.join(
          signedDirPrefixed,
          unfolderedShortFileName,
        );
        console.log("Creating unfoldered signed report " + unfolderedRepPath);
        const sufZip = await transferTempToZip(
          fullTemp,
          unfolderedRepPath,
          false,
        );
        validateReport(new AdmZip(sufZip));
        fsExtra.emptyDirSync(fullTemp);
      }
    }
  }
  return true;
}

async function updateUnknownReport(): Promise<boolean> {
  const unknownReportsDir = path.join(__dirname, "data", "unknown_reports");
  console.log(`Updating unknown report ${unknownReportsDir}`);

  const reports = fs.readdirSync(unknownReportsDir);

  const file = reports[0];
  const filePath = path.join(unknownReportsDir, file);
  const fileName = path.basename(file, path.extname(file));
  if (fs.lstatSync(filePath).isFile()) {
    const zip = new AdmZip(filePath);

    const fullTemp = path.join(__dirname, tempDir);
    fsExtra.emptyDirSync(fullTemp);
    zip.extractAllTo(fullTemp, true);

    const repDirPath = await getRepPath(fullTemp);
    const digested: boolean = await addDigestsToReport(
      repDirPath,
      unknownPrefix,
    );
    if (digested) {
      const fileExtension = path.extname(file);
      const shortFileName = `report.zip`;
      const repPath = path.join(unknownReportsDir, shortFileName);
      const uZip = await transferTempToZip(fullTemp, repPath);
      validateReport(new AdmZip(uZip));
    }
    fsExtra.emptyDirSync(fullTemp);
  }
  return true;
}

async function createFailReports(
  failDirPrefixed: string,
  signedDirPrefixed: string,
): Promise<boolean> {
  const failFuncs: Array<(manifestPath: string) => Promise<boolean>> = [
    genMissingSignature,
    genNoSignature,
    removeMetaInfReportsJson,
  ];
  console.log("Generating test case: no META-INF/reports.json");

  // Loop over the reports directory
  const reports = fs.readdirSync(signedDirPrefixed);

  for (const file of reports) {
    const filePath = path.join(signedDirPrefixed, file);
    if (fs.lstatSync(filePath).isFile()) {
      console.log(`Processing file: ${filePath}`);
      const zip = new AdmZip(filePath);
      let fullTemp = path.join(__dirname, tempDir);
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
            (entry) =>
              entry.isDirectory && entry.entryName.endsWith("reports/"),
          )
        ) {
          if (reportZips.length > 0) {
            throw new Error(
              "Multiple report zips found in but we dont handle that case currnetly " +
                dir,
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
  manifestPath: string,
): Promise<boolean> {
  if (fs.existsSync(manifestPath)) {
    console.log(`Removing ${manifestPath}`);
    fs.unlinkSync(manifestPath);
    assert.equal(fs.existsSync(manifestPath), false);
    return true;
  }
  throw new Error(`Missing manifest file ${manifestPath}`);
}

async function signReport(
  repDirPath: string,
  manifestPath: string,
  keeper: signify.Keeper,
): Promise<boolean> {
  let manifest;
  if (fs.existsSync(manifestPath)) {
    const data = await fs.promises.readFile(manifestPath, "utf-8");
    manifest = JSON.parse(data);
    console.log(
      "Preparing for signing, found META-INF/reports.json in " + repDirPath,
    );
  } else {
    throw new Error("Missing META-INF/reports.json in " + repDirPath);
  }

  const reportsDir = path.join(repDirPath, "reports");

  // signature blocks, with no signatures yet, containing digest must already have been added.
  for (const signature of manifest.documentInfo.signatures) {
    const fileName = signature.file;
    const dig = signature.digest;
    const nonPrefixedDigest = dig.split("-", 2)[1];
    console.log("Non prefixed digest is " + nonPrefixedDigest);
    const sigs = [] as string[];
    for (const signer of keeper.signers as Signer[]) {
      const sig = signer.sign(signify.b(nonPrefixedDigest), 0);
      const result = signer.verfer.verify(sig.raw, nonPrefixedDigest);
      assert.equal(result, true);
      sigs.push(sig.qb64);
    }
    signature.sigs = sigs;
  }

  await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  return true;
}

async function addDigestsToReport(
  repDirPath: string,
  prefix: string,
  externalManifestPath?: string,
): Promise<boolean> {
  const manifestPath = path.join(repDirPath, "META-INF", "reports.json");
  const data = await fs.promises.readFile(manifestPath, "utf-8");
  let manifest = JSON.parse(data);

  // Add digests to signature block, the signReport function will sign the digests
  const signatures: Signature[] = [];
  const reportsDir = path.join(repDirPath, "reports");
  const reportEntries = await fs.promises.readdir(reportsDir, {
    withFileTypes: true,
  });

  for (const reportEntry of reportEntries) {
    const reportPath = path.join(reportsDir, reportEntry.name);
    const buffer = await fs.promises.readFile(reportPath);
    const dig = generateFileDigest(buffer);
    signatures.push({
      file: `../reports/${reportEntry.name}`,
      digest: dig,
      aid: prefix,
      sigs: [],
    });
  }

  manifest.documentInfo.signatures = signatures;
  const manJson = JSON.stringify(manifest, null, 2);
  if (!externalManifestPath) {
    console.log("Writing internal manifest to " + manifestPath);
    await fs.promises.writeFile(manifestPath, manJson);
  } else {
    console.log("Writing external manifest to " + externalManifestPath);
    await fs.promises.writeFile(externalManifestPath, manJson);
  }
  return true;
}

// Function to create a zip file from a temporary directory
async function transferTempToZip(
  tempDir: string,
  filePath: string,
  allowSubDir: boolean = true,
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
      `Zip file contains: ${zip.getEntries().map((entry) => entry.entryName)}`,
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

interface Digest {
  file: string;
  dig: string;
}

async function getRepPath(fullTemp: string): Promise<string> {
  const dirs: string[] = await listDirectories(fullTemp);
  const repZip: string[] = await listReportZips(fullTemp);
  let repDirPath: string = fullTemp;
  if (dirs.includes("META-INF")) {
    if (dirs.includes("reports")) {
      console.log(
        "Non-foldered report, found META-INF and reports directories",
      );
    } else if (repZip.length > 0) {
      console.log(
        "Packaged report, found META-INF and zip with reports directories",
      );
    } else {
      throw new Error(
        "Report has META-INF but no reports directory or zip " + fullTemp,
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
        fullTemp,
    );
  }
  return repDirPath;
}
function getDefaultOrigReports(): string[] {
  console.log(`Getting unsigned reports from ${origDir}`);

  // Loop over the files in the ./data/orig_reports directory
  const origReportsDir = path.join(__dirname, "data", origDir);

  const reports = fs.readdirSync(origReportsDir);
  console.log("Available reports: ", reports);

  const unsignedReps = [] as string[];
  for (const reportFile of reports) {
    // const file = reports[0];
    const filePath = path.join(origReportsDir, reportFile);
    unsignedReps.push(filePath);
  }

  return unsignedReps;
}

async function createExternalManifestZip(
  signedRepPath: string,
  origZipFilePath: string,
  newManifestPath: string,
): Promise<void> {
  // Create a temporary directory
  const tempDir = path.join(__dirname, "tempZipDir");
  fsExtra.emptyDirSync(tempDir);

  // Extract the original zip file to the temporary directory
  const destOrigZip = path.join(tempDir, path.basename(origZipFilePath));
  fs.copyFileSync(origZipFilePath, destOrigZip);

  // Create META-INF directory inside the temporary directory
  const metaInfDir = path.join(tempDir, "META-INF");
  if (!fs.existsSync(metaInfDir)) {
    fs.mkdirSync(metaInfDir);
  }

  // Copy the new manifest file to the META-INF directory
  const manifestFileName = path.basename(newManifestPath);
  const destManifestPath = path.join(metaInfDir, manifestFileName);
  fs.copyFileSync(newManifestPath, destManifestPath);

  // Create a new zip file that includes the contents of the temporary directory
  const newZip = new AdmZip();
  newZip.addLocalFolder(tempDir);
  newZip.writeZip(signedRepPath);

  // Clean up the temporary directory
  fsExtra.removeSync(tempDir);

  console.log(`New zip package file created at: ${signedRepPath}`);
}

function validateReport(zip: AdmZip) {
  const zipEntries = zip.getEntries();
  // Check for META-INF directory and report.json
  const metaInfEntry = zipEntries.find((entry) =>
    entry.entryName.endsWith("META-INF/"),
  );
  if (!metaInfEntry) {
    throw new Error("META-INF directory not found in the zip file");
  }

  const reportJsonEntry = zipEntries.find((entry) =>
    entry.entryName.endsWith("META-INF/reports.json"),
  );
  if (!reportJsonEntry) {
    throw new Error("report.json not found in META-INF directory");
  }

  // Check for reports directory or zip file
  const reportsEntry = zipEntries.find(
    (entry) => entry.entryName.endsWith("reports/") && entry.isDirectory,
  );
  const reportsZipEntry = zipEntries.find((entry) =>
    entry.entryName.endsWith(".zip"),
  );

  if (!reportsEntry && !reportsZipEntry) {
    throw new Error(
      "Neither reports directory nor zip file found in the zip file",
    );
  }

  console.log(
    "Validation passed: META-INF directory with report.json and either reports directory or zip file found.",
  );
}

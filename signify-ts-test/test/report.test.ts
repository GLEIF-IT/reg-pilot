import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import AdmZip from "adm-zip";
import * as fsExtra from "fs-extra";
import { generateFileDigest } from "./utils/generate-digest";
import { Aid, getOrCreateClients } from "./utils/test-util";
import signify, { HabState, Signer, SignifyClient } from "signify-ts";
import { resolveEnvironment, TestEnvironment } from "./utils/resolve-env";
import {buildUserData, User} from "../src/utils/handle-json-config";

import { sign } from "crypto";

let env: TestEnvironment;
let ecrAid: HabState;
let roleClient: SignifyClient;
let keeper: signify.Keeper;

export const unknownPrefix = "EBcIURLpxmVwahksgrsGW6_dUw0zBhyEHYFk17eWrZfk";

const failDir = "fail_reports";
let failDirPrefixed: string;
const signedDir = "signed_reports";
let signedDirPrefixed: string;
const tempDir = "temp_reports";
const secretsJsonPath = "../src/config/"
let users: Array<User>;

afterAll(async () => {
  deleteReportsDir(tempDir);
});

beforeAll(async () => {
  env = resolveEnvironment();
  const secretsJson = JSON.parse(fs.readFileSync(path.join(__dirname, secretsJsonPath + env.secretsJsonConfig), 'utf-8'));
  users = await buildUserData(secretsJson);
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
  for (const user of users){
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
    await generate_reports(ecrAid, keeper, signedDirPrefixed);
  }

}, 100000);


async function generate_reports(ecrAid: HabState, keeper: signify.Keeper, signedDirPrefixed: string) {
  deleteReportsDir(tempDir);
  createReportsDir(tempDir);
  deleteReportsDir(signedDirPrefixed);
  const signedSuccess = await createSignedReports(ecrAid, keeper);
  assert.equal(signedSuccess, true);

  if (signedSuccess) {
    deleteReportsDir(tempDir);
    createReportsDir(tempDir);
    assert.equal(await updateUnknownReport(), true);
    deleteReportsDir(tempDir);
    createReportsDir(tempDir);
    deleteReportsDir(failDirPrefixed);
    assert.equal(await createFailReports(), true);
  }
}

async function createSignedReports(ecrAid: HabState, keeper: signify.Keeper): Promise<boolean> {
  console.log("Signing reports");

  // Loop over the files in the ./data/orig_reports directory
  const origReportsDir = path.join(__dirname, "data", "orig_reports");
  const reports = fs.readdirSync(origReportsDir);
  console.log("Available reports: ", reports);

  for (const file of reports) {
    // const file = reports[0];
    const filePath = path.join(origReportsDir, file);
    const fileName = path.basename(file, path.extname(file));
    if (fs.lstatSync(filePath).isFile()) {
      console.log(`Processing file: ${filePath}`);
      const zip = new AdmZip(filePath);
      const fullTemp = path.join(__dirname, tempDir);
      fsExtra.emptyDirSync(fullTemp);
      zip.extractAllTo(fullTemp, true);
      //   const tempUnzipDir = path.join(tempDir,fileName);
      //   assert(fs.existsSync(tempUnzipDir), `Failed to extract the zip file to ${tempUnzipDir}`);

      const repDirPath = await getRepPath(fullTemp);

      const digested: boolean = await addDigestsToReport(
        repDirPath,
        ecrAid.prefix,
      );
      if (digested) {
        //generate foldered zip, like older xbrl spec
        await signReport(repDirPath, keeper, ecrAid);
        const fileExtension = path.extname(file);
        const shortFileName = `signed_${fileName.substring(Math.max(0, fileName.length - 50), fileName.length)}${fileExtension}`;
        const repPath = path.join(signedDirPrefixed, shortFileName);
        console.log("Creating signed report " + repPath);
        await transferTempToZip(fullTemp, repPath);

        const unfolderedShortFileName = `unfoldered_signed_${fileName.substring(Math.max(0, fileName.length - 50), fileName.length)}${fileExtension}`;
        const unfolderedRepPath = path.join(
          signedDirPrefixed,
          unfolderedShortFileName,
        );
        console.log("Creating unfoldered signed report " + unfolderedRepPath);
        await transferTempToZip(fullTemp, unfolderedRepPath, false);
      }

      fsExtra.emptyDirSync(fullTemp);
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
      await transferTempToZip(fullTemp, repPath);
    }
    fsExtra.emptyDirSync(fullTemp);
  }
  return true;
}

async function createFailReports(): Promise<boolean> {
  const failFuncs: Array<(repDirPath: string) => Promise<boolean>> = [
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
      const fullTemp = path.join(__dirname, tempDir);
      fsExtra.emptyDirSync(fullTemp);
      for (const failFunc of failFuncs) {
        zip.extractAllTo(fullTemp, true);

        const repDirPath = await getRepPath(fullTemp);
        const digested: boolean = await addDigestsToReport(
          repDirPath,
          ecrAid.prefix,
        );
        if (digested) {
          const signedReps = fs.readdirSync(fullTemp);

          for (const signedRepDir of signedReps) {
            const fullTempSigned = path.join(__dirname, tempDir, signedRepDir);
            assert.equal(await failFunc(fullTempSigned), true);
            // Extract the file name and extension
            const fileName = path.basename(file, path.extname(file));
            const fileExtension = path.extname(file);
            const shortFileName = `${failFunc.name}_${fileName.substring(Math.max(0, fileName.length - 50), fileName.length)}${fileExtension}`;
            const repPath = path.join(failDirPrefixed, shortFileName);
            await transferTempToZip(fullTemp, repPath);
            fsExtra.emptyDirSync(fullTemp);
          }
        }
      }
      return true;
    }
  }

  throw new Error("Failed to create fail reports");
}

async function genMissingSignature(repDirPath: string): Promise<boolean> {
  const repDirs: string[] = await listDirectories(repDirPath);
  assert.equal(
    repDirs.includes("META-INF") && repDirs.includes("reports"),
    true,
  );

  const manifestPath = path.join(repDirPath, "META-INF", "reports.json");

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

async function genNoSignature(repDirPath: string): Promise<boolean> {
  const repDirs: string[] = await listDirectories(repDirPath);
  assert.equal(
    repDirs.includes("META-INF") && repDirs.includes("reports"),
    true,
  );

  const manifestPath = path.join(repDirPath, "META-INF", "reports.json");

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

async function removeMetaInfReportsJson(repDirPath: string): Promise<boolean> {
  const repDirs: string[] = await listDirectories(repDirPath);
  assert.equal(
    repDirs.includes("META-INF") && repDirs.includes("reports"),
    true,
  );

  const manifestPath = path.join(repDirPath, "META-INF", "reports.json");
  if (fs.existsSync(manifestPath)) {
    console.log("Removing META-INF/reports.json file");
    fs.unlinkSync(manifestPath);
    assert.equal(fs.existsSync(manifestPath), false);
    return true;
  } else {
    throw new Error("Missing META-INF/reports.json in " + repDirPath);
  }
  throw new Error("Failed to remove META-INF/reports.json in " + repDirPath);
}

async function signReport(
  repDirPath: string,
  keeper: signify.Keeper,
  ecrAid: HabState
): Promise<boolean> {
  // console.log("Found META-INF and reports directories");
  const manifestPath = path.join(repDirPath, "META-INF", "reports.json");
  let manifest;
  if (fs.existsSync(manifestPath)) {
    const data = await fs.promises.readFile(manifestPath, "utf-8");
    manifest = JSON.parse(data);
  } else {
    throw new Error("Missing META-INF/reports.json in " + repDirPath);
  }

  const reportsDir = path.join(repDirPath, "reports");

  // signature blocks, with no signatures yet, containing digest must already have been added.
  for (const signature of manifest.documentInfo.signatures) {
    const fileName = signature.file;
    const dig = signature.digest;
    const nonPrefixedDigest = dig.split("_", 2)[1];
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
  await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  return true;
}

// Function to create a zip file from a temporary directory
async function transferTempToZip(
  tempDir: string,
  filePath: string,
  foldered: boolean = true,
) {
  const zip = new AdmZip();

  // Add the contents of the tempDir to the zip file
  if (foldered) {
    zip.addLocalFolder(tempDir);
  } else {
    const dirs: string[] = await listDirectories(tempDir);
    let found = false;
    for (const dir of dirs) {
      const repDirPath = path.join(tempDir, dir);
      // const repDirEntries = await fs.promises.readdir(repDirPath, { withFileTypes: true });
      const repDirs: string[] = await listDirectories(repDirPath);
      if (repDirs.includes("META-INF") && repDirs.includes("reports")) {
        zip.addLocalFolder(repDirPath);
        found = true;
      }
    }
    if (!found) {
      throw new Error(
        "No sub-dir with META-INF and reports directory found in " + filePath,
      );
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
  }

  // Remove the temporary directory
  // fsExtra.removeSync(temp);
  //   console.log("Cleaning up temporary directory", tempDir);
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
  let repDirPath: string = fullTemp;
  if (dirs.includes("META-INF") && dirs.includes("reports")) {
    console.log(
      "Adding digest to non-foldered report, found META-INF and reports directories",
    );
  } else {
    let found = false;
    for (const dir of dirs) {
      repDirPath = path.join(fullTemp, dir);
      const repDirs = await listDirectories(repDirPath);
      if (repDirs.includes("META-INF") && repDirs.includes("reports")) {
        console.log(
          "Adding digest to foldered report, found META-INF and reports directories",
        );
        found = true;
        break;
      }
    }
    assert(
      found,
      "Missing dir with META-INF and/or reports directory in " + fullTemp,
    );
  }
  return repDirPath;
}

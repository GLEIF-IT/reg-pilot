import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import AdmZip from "adm-zip";
import * as fsExtra from "fs-extra";

import { getOrCreateClients } from "./utils/test-util";
import signify, { HabState, Signer, SignifyClient } from "signify-ts";
import { resolveEnvironment, TestEnvironment } from "./utils/resolve-env";

let env: TestEnvironment;
let ecrAid: HabState;
let roleClient: SignifyClient;

const failDir = "fail_reports";
let failDirPrefixed: string;
const signedDir = "signed_reports";
let signedDirPrefixed: string;
const tempDir = "temp_reports";

afterAll(async () => {
  deleteReportsDir(tempDir);
});

beforeAll(async () => {
  env = resolveEnvironment();

  const clients = await getOrCreateClients(
    env.secrets.length,
    env.secrets,
    true
  );
  roleClient = clients[clients.length - 1];

  ecrAid = await roleClient.identifiers().get(env.roleName);
  failDirPrefixed = path.join(__dirname, "data", failDir, ecrAid.prefix);
  signedDirPrefixed = path.join(__dirname, "data", signedDir, ecrAid.prefix);
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
  deleteReportsDir(tempDir);
  createReportsDir(tempDir);
  deleteReportsDir(signedDirPrefixed);
  const signedSuccess = await createSignedReports();
  assert.equal(signedSuccess, true);

  if (signedSuccess) {
    deleteReportsDir(tempDir);
    createReportsDir(tempDir);
    deleteReportsDir(failDirPrefixed);
    assert.equal(await createFailReports(), true);
  }
}, 100000);

async function createSignedReports(): Promise<boolean> {
  console.log("Signing reports");

  // Loop over the files in the ./data/orig_reports directory
  const origReportsDir = path.join(__dirname, "data", "orig_reports");
  const reports = fs.readdirSync(origReportsDir);

  // for (const file of reports) {
  const file = reports[0];
  const filePath = path.join(origReportsDir, file);
  const fileName = path.basename(file, path.extname(file));
  if (fs.lstatSync(filePath).isFile()) {
    //   console.log(`Processing file: ${filePath}`);
    const zip = new AdmZip(filePath);
    const fullTemp = path.join(__dirname, tempDir);

    zip.extractAllTo(fullTemp, true);
    //   const tempUnzipDir = path.join(tempDir,fileName);
    //   assert(fs.existsSync(tempUnzipDir), `Failed to extract the zip file to ${tempUnzipDir}`);

    await signReport(fullTemp, roleClient);

    const fileExtension = path.extname(file);
    const shortFileName = `signed_${fileName.substring(Math.max(0, fileName.length - 50), fileName.length)}${fileExtension}`;
    const repPath = path.join(signedDirPrefixed, shortFileName);
    transferTempToZip(fullTemp, repPath);
  }
  // }
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

      for (const failFunc of failFuncs) {
        zip.extractAllTo(fullTemp, true);

        const signedReps = fs.readdirSync(fullTemp);

        for (const signedRepDir of signedReps) {
          const fullTempSigned = path.join(__dirname, tempDir, signedRepDir);
          assert.equal(await failFunc(fullTempSigned), true);
          // Extract the file name and extension
          const fileName = path.basename(file, path.extname(file));
          const fileExtension = path.extname(file);
          const shortFileName = `${failFunc.name}_${fileName.substring(Math.max(0, fileName.length - 50), fileName.length)}${fileExtension}`;
          const repPath = path.join(failDirPrefixed, shortFileName);
          transferTempToZip(fullTemp, repPath);
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
    true
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
    true
  );

  const manifestPath = path.join(repDirPath, "META-INF", "reports.json");

  assert.equal(fs.existsSync(manifestPath), true);
  const data = await fs.promises.readFile(manifestPath, "utf-8");
  let manifest: Manifest = JSON.parse(data);
  const signatures: Signature[] = manifest.documentInfo.signatures;

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
    true
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
  tempDir: string,
  roleClient: SignifyClient
): Promise<boolean> {
  const dirs: string[] = await listDirectories(tempDir);

  for (const dir of dirs) {
    const repDirPath = path.join(tempDir, dir);
    // const repDirEntries = await fs.promises.readdir(repDirPath, { withFileTypes: true });
    const repDirs: string[] = await listDirectories(repDirPath);
    if (repDirs.includes("META-INF") && repDirs.includes("reports")) {
      // const aid = await roleClient.identifiers().get(env.roleName);
      const keeper = roleClient.manager!.get(ecrAid);
      const signer: Signer = keeper.signers[0]; //TODO - how do we support mulitple signers? Should be a for loop to add signatures

      // console.log("Found META-INF and reports directories");
      const manifestPath = path.join(repDirPath, "META-INF", "reports.json");
      let manifest;
      if (fs.existsSync(manifestPath)) {
        const data = await fs.promises.readFile(manifestPath, "utf-8");
        manifest = JSON.parse(data);
      } else {
        manifest = { documentInfo: {} };
      }

      const signatures: Signature[] = manifest.documentInfo.signatures || [];
      const reportsDir = path.join(repDirPath, "reports");
      const reportEntries = await fs.promises.readdir(reportsDir, {
        withFileTypes: true,
      });

      for (const reportEntry of reportEntries) {
        const reportPath = path.join(reportsDir, reportEntry.name);
        // let contents = await fs.promises.readFile(reportPath, "utf-8");
        // remove windows line endings
        // const normContents = contents.replace(/\r\n/g, "\n");
        // Convert the string content to Uint8Array
        // const encoder = new TextEncoder();
        // const ser = encoder.encode(contents);
        const buffer = await fs.promises.readFile(reportPath);
        // Convert the Buffer to a Uint8Array
        const uint8Array = new Uint8Array(buffer);

        const sig = signer.sign(uint8Array, 0);

        const result = signer.verfer.verify(sig.raw, uint8Array);
        assert.equal(result, true);

        signatures.push({
          file: `../reports/${reportEntry.name}`,
          aid: ecrAid.prefix,
          sigs: [sig.qb64],
        });
      }

      manifest.documentInfo.signatures = signatures;
      await fs.promises.writeFile(
        manifestPath,
        JSON.stringify(manifest, null, 2)
      );
      return true;
    } else {
      throw new Error("Missing META-INF and/or reports directory in " + dir);
    }
  }
  throw new Error(`Failed to create signed reports in ${tempDir} ${dirs}`);
}

// Function to create a zip file from a temporary directory
function transferTempToZip(tempDir: string, filePath: string) {
  const zip = new AdmZip();

  // Add the contents of the tempDir to the zip file
  zip.addLocalFolder(tempDir);

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
  fsExtra.removeSync(tempDir);
  //   console.log("Cleaning up temporary directory", tempDir);
}

interface Signature {
  file: string;
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

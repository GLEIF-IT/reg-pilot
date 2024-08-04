import { strict as assert } from "assert";
import * as fs from "fs";
import * as glob from "glob";
import * as path from "path";
import AdmZip from "adm-zip";
import * as fsExtra from "fs-extra";

import { getOrCreateClients } from "./utils/test-util";
import { SignifyClient } from "signify-ts";

const ECR_SCHEMA_SAID = "EEy9PkikFcANV1l7EHukCeXqrzT1hNZjGlUk7wuMO5jw";

let roleClient: SignifyClient;
const roleName = "role";

const failDir = "fail_reports";
const signedDir = "signed_reports";
const tempDir = "temp_reports";

afterAll(async () => {
  deleteTempReportsDir(tempDir);
});

beforeAll(async () => {
  const defaultSecrets =
    // "D_PbQb01zuzQgK-kDWjqy,BTaqgh1eeOjXO5iQJp6mb,Akv4TFoiYeHNqzj3N8gEg,CbII3tno87wn3uGBP12qm";
    "CbII3tno87wn3uGBP12qm";
  if (!process.env.SIGNIFY_SECRETS) {
    process.env.SIGNIFY_SECRETS = defaultSecrets;
  }
  console.log("secrets", process.env.SIGNIFY_SECRETS);

  const defaultEnv = "docker";
  if (!process.env.TEST_ENVIRONMENT) {
    process.env.TEST_ENVIRONMENT = defaultEnv;
  }
  console.log("env", process.env.TEST_ENVIRONMENT);

  // const [gleifClient, qviClient, leClient, roleClientInstance] =
  const [roleClientInstance] = await getOrCreateClients(
    1,
    process.env.SIGNIFY_SECRETS.split(",")
  );
  roleClient = roleClientInstance;

  deleteTempReportsDir(tempDir);
  createTempReportsDir(tempDir);
  deleteTempReportsDir(signedDir);
  const signedSuccess = await createSignedReports();
  assert.equal(signedSuccess, true);

  if (signedSuccess) {
    deleteTempReportsDir(tempDir);
    createTempReportsDir(tempDir);
    deleteTempReportsDir(failDir);
    assert.equal(await createFailReports(),true);
  }
});

// Function to create a directory named 'temp_reports'
function createTempReportsDir(tempDir: string): void {
  const dirPath = path.join(__dirname, tempDir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath);
    console.log("Directory temp_reports created.");
  } else {
    console.log("Directory temp_reports already exists.");
  }
}

// Function to delete a directory named 'temp_reports'
function deleteTempReportsDir(repDir: string): void {
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
test("report-generation-test", async function run() {}, 100000);

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

    const failReportsDir = path.join(__dirname, "data", signedDir);
    // Extract the file name and extension

    const fileExtension = path.extname(file);
    const shortFileName = `signed_${fileName.substring(Math.max(0, fileName.length - 50), fileName.length)}${fileExtension}`;
    const failPath = path.join(failReportsDir, shortFileName);
    transferTempToZip(fullTemp, failPath);
  }
  // }
  return true;
}

async function createFailReports(): Promise<boolean> {
  const failFuncs: Array<(repDirPath: string) => Promise<boolean>> = [
    genMissingSignature,
    // genNoSignature,
    // removeMetaInfReportsJson,
  ];
  console.log("Generating test case: no META-INF/reports.json");

  // Loop over the reports in the ./data/orig_reports directory
  const signedReportsDir = path.join(__dirname, "data", signedDir);
  const reports = fs.readdirSync(signedReportsDir);

  for (const file of reports) {
    const filePath = path.join(signedReportsDir, file);
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
          const failReportsDir = path.join(__dirname, "data", failDir);
          // Extract the file name and extension
          const fileName = path.basename(file, path.extname(file));
          const fileExtension = path.extname(file);
          const shortFileName = `${failFunc.name}_${fileName.substring(Math.max(0, fileName.length - 50), fileName.length)}${fileExtension}`;
          const failPath = path.join(failReportsDir, shortFileName);
          transferTempToZip(fullTemp, failPath);
          return true;
        }
      }
    }
  }

  throw new Error("Failed to create fail reports");
}

async function genMissingSignature(repDirPath: string): Promise<boolean> {
  // const repDirEntries = await fs.promises.readdir(repDirPath, { withFileTypes: true });
  const repDirs: string[] = await listDirectories(repDirPath);
  assert.equal(
    repDirs.includes("META-INF") && repDirs.includes("reports"),
    true
  );
  // console.log("Found META-INF and reports directories");
  const manifestPath = path.join(repDirPath, "META-INF", "reports.json");

  assert.equal(fs.existsSync(manifestPath), true);
  const data = await fs.promises.readFile(manifestPath, "utf-8");
  let manifest = JSON.parse(data);
  const signatures: Signature[] = manifest.documentInfo.signatures;

  // Remove one signature entry from the manifest
  if (manifest.documentInfo && manifest.documentInfo.signatures) {
    const signatures = manifest.documentInfo.signatures;
    if (signatures.length > 0) {
      signatures.shift(); // Remove the first signature
      // Save the modified manifest back to reports.json
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      return true;
    }
  }

  throw new Error("Could not remove signature from " + manifestPath);
}

function genNoSignature(): void {
  // Load the manifest from reports.json
  const repJsonPaths = glob.sync(`${tempDir}/*/META-INF/reports.json`);
  for (const reportsJsonPath of repJsonPaths) {
    if (fs.existsSync(reportsJsonPath)) {
      console.log("Removing signatures from reports.json file");
      const manifest = JSON.parse(fs.readFileSync(reportsJsonPath, "utf-8"));

      // Remove all signature entries from the manifest
      if (manifest.documentInfo && manifest.documentInfo.signatures) {
        const signatures = manifest.documentInfo.signatures;
        if (signatures.length > 0) {
          signatures.length = 0; // Clear the signatures array
        }
      }

      // Save the modified manifest back to reports.json
      fs.writeFileSync(reportsJsonPath, JSON.stringify(manifest, null, 2));
    }
  }
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

function removeMetaInfReportsJson() {
  const repJsonPaths = glob.sync(`${tempDir}/*/META-INF/reports.json`);
  for (const reportsJsonPath of repJsonPaths) {
    if (fs.existsSync(reportsJsonPath)) {
      console.log("Removing reports.json file");
      fs.unlinkSync(reportsJsonPath);
    }
  }
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
        const contents = await fs.promises.readFile(reportPath, "utf-8");

        // Convert the string content to Uint8Array
        const encoder = new TextEncoder();
        const ser = encoder.encode(contents);

        let aid = await roleClient.identifiers().get(roleName);
        const keeper = roleClient.manager!.get(aid);
        const signer = keeper.signers[0];
        const sig = signer.sign(ser);

        signatures.push({
          file: `../reports/${reportEntry.name}`,
          aid: aid.prefix,
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

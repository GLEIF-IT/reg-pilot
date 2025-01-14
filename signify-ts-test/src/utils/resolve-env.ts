import path from "path";

export type TestEnvironmentPreset =
  | "local"
  | "docker"
  | "rootsid_dev"
  | "rootsid_test"
  | "bank_test"
  | "eba_bank_test"
  | "nordlei_dev"
  | "nordlei_demo"
  | "nordlei_dry";

export interface TestEnvironment {
  preset: TestEnvironmentPreset;
  url: string;
  bootUrl: string;
  vleiServerUrl: string;
  witnessUrls: string[];
  witnessIds: string[];
  apiBaseUrl: string;
  filerBaseUrl: string;
  proxyBaseUrl: string;
  verifierBaseUrl: string;
  workflow: string;
  configuration: string;
}

const WAN = "BBilc4-L3tFUnfM_wJr4S4OJanAv_VmF_dJNN6vkf2Ha";
const WIL = "BLskRTInXnMxWaGqcpSyMgo0nYbalW99cGZESrz3zapM";
const WES = "BIKKuvBwpmDVA4Ds-EpL5bt9OqPzWPja2LigFYZN2YfX";

export function resolveEnvironment(
  input?: TestEnvironmentPreset
): TestEnvironment {
  const preset = input ?? process.env.TEST_ENVIRONMENT ?? "docker";
  let env;
  switch (preset) {
    case "docker":
      env = {
        preset: preset,
        url: process.env.KERIA || "http://localhost:3901",
        bootUrl: process.env.KERIA_BOOT || "http://localhost:3903",
        witnessUrls:
          process.env.WITNESS_URLS === ""
            ? []
            : process.env.WITNESS_URLS?.split(",") || [
                "http://witness-demo:5642",
                "http://witness-demo:5643",
                "http://witness-demo:5644",
              ],
        witnessIds:
          process.env.WITNESS_IDS === ""
            ? []
            : process.env.WITNESS_IDS?.split(",") || [WAN, WIL, WES],
        vleiServerUrl: process.env.VLEI_SERVER || "http://vlei-server:7723",
        apiBaseUrl: process.env.REG_PILOT_API || "http://localhost:8000",
        filerBaseUrl: process.env.REG_PILOT_FILER || "http://localhost:7878",
        proxyBaseUrl: process.env.REG_PILOT_PROXY || "http://localhost:3434",
        verifierBaseUrl: process.env.VLEI_VERIFIER || "http://localhost:7676",
        workflow: process.env.WORKFLOW || "singlesig-single-user.yaml",
        configuration:
          process.env.CONFIGURATION ||
          "configuration-singlesig-single-user.json",
      };
      break;
    case "local":
      env = {
        preset: preset,
        url: process.env.KERIA || "http://localhost:3901",
        bootUrl: process.env.KERIA_BOOT || "http://localhost:3903",
        vleiServerUrl: process.env.VLEI_SERVER || "http://localhost:7723",
        witnessUrls:
          process.env.WITNESS_URLS === ""
            ? []
            : process.env.WITNESS_URLS?.split(",") || [
                "http://localhost:5642",
                "http://localhost:5643",
                "http://localhost:5644",
              ],
        witnessIds:
          process.env.WITNESS_IDS === ""
            ? []
            : process.env.WITNESS_IDS?.split(",") || [WAN, WIL, WES],
        apiBaseUrl: process.env.REG_PILOT_API || "http://localhost:8000",
        filerBaseUrl: process.env.REG_PILOT_FILER || "http://localhost:7878",
        proxyBaseUrl: process.env.REG_PILOT_PROXY || "http://localhost:3434",
        verifierBaseUrl: process.env.VLEI_VERIFIER || "http://localhost:7676",
        workflow: process.env.WORKFLOW || "singlesig-single-user.yaml",
        configuration:
          process.env.CONFIGURATION ||
          "configuration-singlesig-single-user.json",
      };
      break;
    case "rootsid_dev":
      env = {
        preset: preset,
        url: process.env.KERIA || "https://keria-dev.rootsid.cloud/admin",
        bootUrl: process.env.KERIA_BOOT || "https://keria-dev.rootsid.cloud",
        witnessUrls:
          process.env.WITNESS_URLS === ""
            ? []
            : process.env.WITNESS_URLS?.split(",") || [
                "https://witness-dev01.rootsid.cloud",
                "https://witness-dev02.rootsid.cloud",
                "https://witness-dev03.rootsid.cloud",
              ],
        witnessIds:
          process.env.WITNESS_IDS === ""
            ? []
            : process.env.WITNESS_IDS?.split(",") || [WAN, WIL, WES],
        vleiServerUrl:
          process.env.VLEI_SERVER || "http://schemas.rootsid.cloud",
        apiBaseUrl:
          process.env.REG_PILOT_API || "https://reg-api-dev.rootsid.cloud",
        filerBaseUrl: process.env.REG_PILOT_FILER || "",
        proxyBaseUrl: process.env.REG_PILOT_PROXY || "No RootsID dev proxy set",
        verifierBaseUrl:
          process.env.VLEI_VERIFIER || "RootsID dev verifier not set",
        workflow: process.env.WORKFLOW || "singlesig-single-user.yaml",
        configuration:
          process.env.CONFIGURATION ||
          "configuration-singlesig-single-user.json",
      };
      break;
    case "rootsid_test":
      env = {
        preset: preset,
        url: process.env.KERIA || "https://keria-test.rootsid.cloud/admin",
        bootUrl: process.env.KERIA_BOOT || "https://keria-test.rootsid.cloud",
        witnessUrls:
          process.env.WITNESS_URLS === ""
            ? []
            : process.env.WITNESS_URLS?.split(",") || [
                "http://wit1.rootsid.cloud:5501",
                "http://wit2.rootsid.cloud:5503",
                "http://wit3.rootsid.cloud:5505",
              ],
        witnessIds:
          process.env.WITNESS_IDS === ""
            ? []
            : process.env.WITNESS_IDS?.split(",") || [
                "BNZBr3xjR0Vtat_HxFJnfBwQcpDj3LGl4h_MCQdmyN-r",
                "BH_XYb3mBmRB1nBVl8XrKjtuQkcIWYKALY4ZWLVOZjKg",
                "BAPWdGXGfiFsi3sMvSCPDnoPnEhPp-ZWxK9RYrqCQTa_",
              ],
        vleiServerUrl:
          process.env.VLEI_SERVER || "http://schemas.rootsid.cloud",
        apiBaseUrl:
          process.env.REG_PILOT_API || "https://reg-api-test.rootsid.cloud",
        filerBaseUrl: process.env.REG_PILOT_FILER || "",
        proxyBaseUrl:
          process.env.REG_PILOT_PROXY || "No RootsID test proxy set",
        verifierBaseUrl:
          process.env.VLEI_VERIFIER || "RootsID demo verifier not set",
        workflow: process.env.WORKFLOW || "singlesig-single-user.yaml",
        configuration:
          process.env.CONFIGURATION ||
          "configuration-singlesig-single-user.json",
      };
      break;
    case "bank_test":
      env = {
        preset: preset,
        url: process.env.KERIA || "http://localhost:3901",
        bootUrl: process.env.KERIA_BOOT || "http://localhost:3903",
        witnessUrls: process.env.WITNESS_URLS?.split(",") || [""],
        witnessIds: process.env.WITNESS_IDS?.split(",") || [],
        vleiServerUrl:
          process.env.VLEI_SERVER || "http://schemas.rootsid.cloud",
        apiBaseUrl: process.env.REG_PILOT_API || "http://localhost:8000",
        filerBaseUrl: process.env.REG_PILOT_FILER || "http://localhost:7878",
        proxyBaseUrl:
          process.env.REG_PILOT_PROXY || "No RootsID test proxy set",
        verifierBaseUrl: process.env.VLEI_VERIFIER || "Demo verifier not set",
        workflow: process.env.WORKFLOW || "",
        configuration: process.env.CONFIGURATION || "config.json",
      };
      break;
    case "eba_bank_test":
      env = {
        preset: preset,
        url: process.env.KERIA || "http://localhost:3901",
        bootUrl: process.env.KERIA_BOOT || "http://localhost:3903",
        witnessUrls: process.env.WITNESS_URLS?.split(",") || [""],
        witnessIds: process.env.WITNESS_IDS?.split(",") || [],
        vleiServerUrl:
          process.env.VLEI_SERVER || "http://schemas.rootsid.cloud",
        apiBaseUrl:
          process.env.REG_PILOT_API ||
          "https://errp.test.eba.europa.eu/api-security",
        filerBaseUrl:
          process.env.REG_PILOT_FILER || "https://errp.test.eba.europa.eu/api",
        proxyBaseUrl: process.env.REG_PILOT_PROXY || "No test proxy set",
        verifierBaseUrl: process.env.VLEI_VERIFIER || "Demo verifier not set",
        workflow: process.env.WORKFLOW || "",
        configuration: process.env.CONFIGURATION || "config.json",
      };
      break;
    case "nordlei_dev":
      env = {
        preset: preset,
        url: process.env.KERIA || "https://demo.wallet.vlei.tech",
        bootUrl: process.env.KERIA_BOOT || "https://demo.wallet.vlei.tech/boot", // must request access
        witnessUrls:
          process.env.WITNESS_URLS === ""
            ? []
            : process.env.WITNESS_URLS?.split(",") || [
                "https://william.witness.vlei.tech/oobi",
                "https://wesley.witness.vlei.tech/oobi",
                "https://whitney.witness.vlei.tech/oobi",
                "https://wilma.witness.vlei.tech/oobi",
                "https://wilbur.witness.vlei.tech/oobi",
              ],
        witnessIds:
          process.env.WITNESS_IDS === ""
            ? []
            : process.env.WITNESS_IDS?.split(",") || [
                "BMn9DacVHdgg66ukO0fYwQx1IV5hCchPd7Gb5zCCQYsv",
                "BGNpoM1a8VMMJEZC8DKgiyEsTTviWkgQ6e4f6rRFkoxV",
                "BLiMaTh2Mr540wD6FynMc3SaAtHhjOTJfO_j-1E7WwC2",
                "BFX3CtauhMYyLOxX44q4yzQfwd4ekmBWF1oteXx8iiWn",
                "BOwl2CUm-5nvVy8krTlSxzHkcQSBAXHYz412Cl-e20xS",
              ],
        vleiServerUrl:
          process.env.VLEI_SERVER || "http://schemas.rootsid.cloud",
        apiBaseUrl:
          process.env.REG_PILOT_API || "NordLEI dev reg-pilot-api not set",
        filerBaseUrl: process.env.REG_PILOT_FILER || "",
        proxyBaseUrl: process.env.REG_PILOT_PROXY || "No NordLEI dev proxy set",
        verifierBaseUrl:
          process.env.VLEI_VERIFIER || "NordLEI dev verifier not set",
        workflow: process.env.WORKFLOW || "singlesig-single-user.yaml",
        configuration:
          process.env.CONFIGURATION ||
          "configuration-singlesig-single-user.json",
      };
      break;
    case "nordlei_demo":
      env = {
        preset: preset,
        url: process.env.KERIA || "https://errp.wallet.vlei.io",
        bootUrl: process.env.KERIA_BOOT || "https://errp.wallet.vlei.io/boot",
        witnessUrls:
          process.env.WITNESS_URLS === ""
            ? []
            : process.env.WITNESS_URLS?.split(",") || [
                "https://william.witness.vlei.io/oobi",
                "https://wesley.witness.vlei.io/oobi",
                "https://whitney.witness.vlei.io/oobi",
                "https://wilma.witness.vlei.io/oobi",
                "https://wilbur.witness.vlei.io/oobi",
              ],
        witnessIds:
          process.env.WITNESS_IDS === ""
            ? []
            : process.env.WITNESS_IDS?.split(",") || [
                "BB6_wAm4rtFPRFg1qJHbC1RWNcRKMth2sFw6MgSqFKg_",
                "BGJvFwob-UV5J1vSbuCroz27k4FGaZE992K4sc79cD54",
                "BMMOAZ4Ujv0jP3VhCAHmx9yTSBoP1sAoDjFXas14JYG-",
                "BIrxc3loHN4kQ2HN8Ev-bisMBZzkdfXQdwl4KKdy2iZh",
                "BDTChgVW3pAxkYCYDVWV9DQYu_FTZ8laD-WhpFHvY9SQ",
              ],
        vleiServerUrl:
          process.env.VLEI_SERVER || "http://schemas.rootsid.cloud",
        apiBaseUrl:
          process.env.REG_PILOT_API || "NordLEI demo reg-pilot-api not set",
        filerBaseUrl: process.env.REG_PILOT_FILER || "",
        proxyBaseUrl:
          process.env.REG_PILOT_PROXY || "No NordLEI demo proxy set",
        verifierBaseUrl:
          process.env.VLEI_VERIFIER || "NordLEI demo verifier not set",
        workflow: process.env.WORKFLOW || "singlesig-single-user.yaml",
        configuration:
          process.env.CONFIGURATION ||
          "configuration-singlesig-single-user.json",
      };
      break;
    case "nordlei_dry":
      env = {
        preset: preset,
        url: process.env.KERIA || "https://testbank.wallet.dryrun.vlei.dev",
        bootUrl:
          process.env.KERIA_BOOT ||
          "https://testbank.wallet.dryrun.vlei.dev/boot",
        witnessUrls:
          process.env.WITNESS_URLS === ""
            ? []
            : process.env.WITNESS_URLS?.split(",") || [
                "https://william.witness.dryrun.vlei.dev/oobi",
              ],
        witnessIds:
          process.env.WITNESS_IDS === ""
            ? []
            : process.env.WITNESS_IDS?.split(",") || [
                "BFEr4VPW1B2oWwlNG3rjwe2c-eyXbtqqJds88bDnFGNk",
              ],
        vleiServerUrl:
          process.env.VLEI_SERVER || "http://schemas.rootsid.cloud",
        apiBaseUrl:
          process.env.REG_PILOT_API || "NordLEI demo reg-pilot-api not set",
        filerBaseUrl: process.env.REG_PILOT_FILER || "",
        proxyBaseUrl:
          process.env.REG_PILOT_PROXY || "No NordLEI demo proxy set",
        verifierBaseUrl:
          process.env.VLEI_VERIFIER || "NordLEI demo verifier not set",
        workflow: process.env.WORKFLOW || "singlesig-single-user.yaml",
        configuration:
          process.env.CONFIGURATION ||
          "configuration-singlesig-single-user.json",
      };
      break;
    default:
      throw new Error(`Unknown test environment preset '${preset}'`);
  }
  console.log("Test environment preset: ", JSON.stringify(env));
  return env;
}

export class TestPaths {
  testDir: string;
  testDataDir: string;
  tmpReportsDir: string;
  testUserConfigFile: string;
  testUsersDir: string;
  testUserDir: string;
  testUserName: string;
  testFailReports: string;
  testSignedReports: string;
  tmpReportUnpackDir: string;
  testTmpFailReports: string;
  testTmpSignedReports: string;
  testOrigReportsDir: string;
  workflowsDir: string;
  // origReportsDir: string;
  // configDir: string;

  constructor() {
    this.testDir = process.env.TEST_DIR
      ? process.env.TEST_DIR
      : path.join(process.cwd(), `test`);
    this.testDataDir = process.env.TEST_DATA_DIR
      ? process.env.TEST_DATA_DIR
      : path.join(this.testDir, `data`);
    this.testOrigReportsDir = process.env.TEST_ORIG_REPORTS_DIR
      ? process.env.TEST_ORIG_REPORTS_DIR
      : path.join(this.testDataDir, `orig_reports`);
    this.tmpReportsDir = process.env.TEST_TEMP_REPORTS_DIR
      ? process.env.TEST_TEMP_REPORTS_DIR
      : path.join(this.testDataDir, `tmp_reports`);
    this.testFailReports = process.env.TEST_FAIL_REPORTS
      ? process.env.TEST_FAIL_REPORTS
      : path.join(this.testDataDir, `fail_reports`);
    this.testSignedReports = process.env.TEST_SIGNED_REPORTS
      ? process.env.TEST_SIGNED_REPORTS
      : path.join(this.testDataDir, `signed_reports`);
    this.testUsersDir = process.env.TEST_USERS_DIR
      ? process.env.TEST_USERS_DIR
      : path.join(this.testDataDir, `600-banks-test-data`);
    this.tmpReportUnpackDir = process.env.TEST_TEMP_REPORTS_UNPACK_DIR
      ? process.env.TEST_TEMP_REPORTS_UNPACK_DIR
      : path.join(this.testUsersDir, `tmp_reports_unpacked`);
    this.testUserName = process.env.TEST_USER_NAME
      ? process.env.TEST_USER_NAME
      : "Bank_1";
    this.testUserDir = process.env.TEST_USER_DIR
      ? process.env.TEST_USER_DIR
      : path.join(this.testUsersDir, this.testUserName);
    this.testUserConfigFile = process.env.TEST_USER_CONFIG_FILE
      ? process.env.TEST_USER_CONFIG_FILE
      : path.join(this.testUserDir, `config.json`);
    this.testTmpFailReports = process.env.TEST_TEMP_FAIL_REPORTS
      ? process.env.TEST_TEMP_FAIL_REPORTS
      : path.join(
          this.tmpReportUnpackDir,
          this.testUserName,
          `/reports/signed_reports`
        );
    this.testTmpSignedReports = process.env.TEST_TEMP_SIGNED_REPORTS
      ? process.env.TEST_TEMP_SIGNED_REPORTS
      : path.join(
          this.tmpReportUnpackDir,
          this.testUserName,
          `/reports/signed_reports`
        );
    this.workflowsDir = process.env.WORKFLOWS_DIR
      ? process.env.WORKFLOWS_DIR
      : path.join(process.cwd(), "src/workflows");
  }
}

/**
 * Replace the URL based on the environment variable and optional hosts
 */
export function convertDockerHost(
  url: string,
  moreHostsToReplace?: string,
  newHost?: string
): string {
  if (newHost) {
    return replaceUrlHost(url, newHost, moreHostsToReplace);
  }
  if (process.env.USE_DOCKER_INTERNAL === "true") {
    url = replaceUrlHost(url, "host.docker.internal", moreHostsToReplace);
    return url;
  }
  if (process.env.DOCKER_HOST) {
    url = replaceUrlHost(url, process.env.DOCKER_HOST, moreHostsToReplace);
    return url;
  }
  return url;
}

/**
 * Replace the URL based on the environment variable and optional hosts
 */
export function replaceUrlHost(
  url: string,
  newHost: string = "host.docker.internal",
  moreHostsToReplace: string = ""
): string {
  const defaultHosts = ["127.0.0.1", "localhost"];
  const hostsToReplace = moreHostsToReplace
    ? defaultHosts.concat(moreHostsToReplace.split(","))
    : defaultHosts;

  for (const host of hostsToReplace) {
    if (url.includes(host)) {
      console.log(`Replacing URL host: ${host} -> ${newHost}`);
      return url.replace(host, newHost);
    }
  }

  throw new Error(`Error appling replacement for URL: ${url}`);
}

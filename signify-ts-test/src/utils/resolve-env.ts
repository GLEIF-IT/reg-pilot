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

const WAN = "BBilc4-L3tFUnfM_wJr4S4OJanAv_VmF_dJNN6vkf2Ha";
const WIL = "BLskRTInXnMxWaGqcpSyMgo0nYbalW99cGZESrz3zapM";
const WES = "BIKKuvBwpmDVA4Ds-EpL5bt9OqPzWPja2LigFYZN2YfX";

export class TestEnvironment {
  private static instance: TestEnvironment;
  preset: TestEnvironmentPreset;
  keriaAdminPort: number;
  keriaHttpPort: number;
  keriaBootPort: number;
  keriaAdminUrl: string;
  keriaBootUrl: string;
  keriaHttpUrl: string;
  vleiServerUrl: string;
  witnessUrls: string[];
  witnessIds: string[];
  apiBaseUrl: string;
  filerBaseUrl: string;
  proxyBaseUrl: string;
  verifierBaseUrl: string;
  workflow: string;
  configuration: string;

  private constructor(
    keriaAdminPort = process.env.KERIA_ADMIN_PORT
      ? parseInt(process.env.KERIA_ADMIN_PORT)
      : 3901,
    keriaHttpPort = process.env.KERIA_HTTP_PORT
      ? parseInt(process.env.KERIA_HTTP_PORT)
      : 3902,
    keriaBootPort = process.env.KERIA_BOOT_PORT
      ? parseInt(process.env.KERIA_BOOT_PORT)
      : 3903
  ) {
    this.preset =
      (process.env.TEST_ENVIRONMENT as TestEnvironmentPreset) ?? "docker";
    this.keriaAdminPort = keriaAdminPort;
    this.keriaHttpPort = keriaHttpPort;
    this.keriaBootPort = keriaBootPort;
    switch (this.preset) {
      case "docker":
        (this.keriaAdminUrl =
          process.env.KERIA_ADMIN_URL || `http://localhost:${keriaAdminPort}`),
          (this.keriaBootUrl =
            process.env.KERIA_BOOT_URL || `http://localhost:${keriaBootPort}`),
          (this.keriaHttpUrl =
            process.env.KERIA_HTTP_URL || `http://localhost:${keriaHttpPort}`),
          (this.witnessUrls =
            process.env.WITNESS_URLS === ""
              ? []
              : process.env.WITNESS_URLS?.split(",") || [
                  "http://witness-demo:5642",
                  "http://witness-demo:5643",
                  "http://witness-demo:5644",
                ]),
          (this.witnessIds =
            process.env.WITNESS_IDS === ""
              ? []
              : process.env.WITNESS_IDS?.split(",") || [WAN, WIL, WES]),
          (this.vleiServerUrl =
            process.env.VLEI_SERVER || "http://vlei-server:7723"),
          (this.apiBaseUrl =
            process.env.REG_PILOT_API || "http://localhost:8000"),
          (this.filerBaseUrl =
            process.env.REG_PILOT_FILER || "http://localhost:7878"),
          (this.proxyBaseUrl =
            process.env.REG_PILOT_PROXY || "http://localhost:3434"),
          (this.verifierBaseUrl =
            process.env.VLEI_VERIFIER || "http://localhost:7676"),
          (this.workflow =
            process.env.WORKFLOW || "singlesig-single-user.yaml"),
          (this.configuration =
            process.env.CONFIGURATION ||
            "configuration-singlesig-single-user.json");
      case "local":
        (this.keriaAdminUrl =
          process.env.KERIA_ADMIN_URL || `http://localhost:${keriaAdminPort}`),
          (this.keriaBootUrl =
            process.env.KERIA_BOOT_URL || `http://localhost:${keriaBootPort}`),
          (this.keriaHttpUrl =
            process.env.KERIA_HTTP_URL || `http://localhost:${keriaHttpPort}`),
          (this.vleiServerUrl =
            process.env.VLEI_SERVER || "http://localhost:7723"),
          (this.witnessUrls =
            process.env.WITNESS_URLS === ""
              ? []
              : process.env.WITNESS_URLS?.split(",") || [
                  "http://localhost:5642",
                  "http://localhost:5643",
                  "http://localhost:5644",
                ]),
          (this.witnessIds =
            process.env.WITNESS_IDS === ""
              ? []
              : process.env.WITNESS_IDS?.split(",") || [WAN, WIL, WES]),
          (this.apiBaseUrl =
            process.env.REG_PILOT_API || "http://localhost:8000"),
          (this.filerBaseUrl =
            process.env.REG_PILOT_FILER || "http://localhost:7878"),
          (this.proxyBaseUrl =
            process.env.REG_PILOT_PROXY || "http://localhost:3434"),
          (this.verifierBaseUrl =
            process.env.VLEI_VERIFIER || "http://localhost:7676"),
          (this.workflow =
            process.env.WORKFLOW || "singlesig-single-user.yaml"),
          (this.configuration =
            process.env.CONFIGURATION ||
            "configuration-singlesig-single-user.json");
        break;
      case "rootsid_dev":
        (this.keriaAdminUrl =
          process.env.KERIA_ADMIN_URL ||
          "https://keria-dev.rootsid.cloud/admin"),
          (this.keriaBootUrl =
            process.env.KERIA_BOOT_URL || "https://keria-dev.rootsid.cloud"),
          (this.keriaHttpUrl =
            process.env.KERIA_HTTP_URL || "https://keria-dev.rootsid.cloud"),
          (this.witnessUrls =
            process.env.WITNESS_URLS === ""
              ? []
              : process.env.WITNESS_URLS?.split(",") || [
                  "https://witness-dev01.rootsid.cloud",
                  "https://witness-dev02.rootsid.cloud",
                  "https://witness-dev03.rootsid.cloud",
                ]),
          (this.witnessIds =
            process.env.WITNESS_IDS === ""
              ? []
              : process.env.WITNESS_IDS?.split(",") || [WAN, WIL, WES]),
          (this.vleiServerUrl =
            process.env.VLEI_SERVER || "http://schemas.rootsid.cloud"),
          (this.apiBaseUrl =
            process.env.REG_PILOT_API || "https://reg-api-dev.rootsid.cloud"),
          (this.filerBaseUrl = process.env.REG_PILOT_FILER || ""),
          (this.proxyBaseUrl =
            process.env.REG_PILOT_PROXY || "No RootsID dev proxy set"),
          (this.verifierBaseUrl =
            process.env.VLEI_VERIFIER || "RootsID dev verifier not set"),
          (this.workflow =
            process.env.WORKFLOW || "singlesig-single-user.yaml"),
          (this.configuration =
            process.env.CONFIGURATION ||
            "configuration-singlesig-single-user.json");
        break;
      case "rootsid_test":
        (this.keriaAdminUrl =
          process.env.KERIA_ADMIN_URL ||
          "https://keria-test.rootsid.cloud/admin"),
          (this.keriaBootUrl =
            process.env.KERIA_BOOT_URL || "https://keria-test.rootsid.cloud"),
          (this.keriaHttpUrl =
            process.env.KERIA_HTTP_URL ||
            `https://keria-test.rootsid.cloud:${keriaHttpPort}`),
          (this.witnessUrls =
            process.env.WITNESS_URLS === ""
              ? []
              : process.env.WITNESS_URLS?.split(",") || [
                  "http://wit1.rootsid.cloud:5501",
                  "http://wit2.rootsid.cloud:5503",
                  "http://wit3.rootsid.cloud:5505",
                ]),
          (this.witnessIds =
            process.env.WITNESS_IDS === ""
              ? []
              : process.env.WITNESS_IDS?.split(",") || [
                  "BNZBr3xjR0Vtat_HxFJnfBwQcpDj3LGl4h_MCQdmyN-r",
                  "BH_XYb3mBmRB1nBVl8XrKjtuQkcIWYKALY4ZWLVOZjKg",
                  "BAPWdGXGfiFsi3sMvSCPDnoPnEhPp-ZWxK9RYrqCQTa_",
                ]),
          (this.vleiServerUrl =
            process.env.VLEI_SERVER || "http://schemas.rootsid.cloud"),
          (this.apiBaseUrl =
            process.env.REG_PILOT_API || "https://reg-api-test.rootsid.cloud"),
          (this.filerBaseUrl = process.env.REG_PILOT_FILER || ""),
          (this.proxyBaseUrl =
            process.env.REG_PILOT_PROXY || "No RootsID test proxy set"),
          (this.verifierBaseUrl =
            process.env.VLEI_VERIFIER || "RootsID demo verifier not set"),
          (this.workflow =
            process.env.WORKFLOW || "singlesig-single-user.yaml"),
          (this.configuration =
            process.env.CONFIGURATION ||
            "configuration-singlesig-single-user.json");
        break;
      case "bank_test":
        (this.keriaAdminUrl =
          process.env.KERIA_ADMIN_URL || `http://localhost:${keriaAdminPort}`),
          (this.keriaBootUrl =
            process.env.KERIA_BOOT_URL || `http://localhost:${keriaBootPort}`),
          (this.keriaHttpUrl =
            process.env.KERIA_HTTP_URL || `http://localhost:${keriaHttpPort}`),
          (this.witnessUrls = process.env.WITNESS_URLS?.split(",") || [""]),
          (this.witnessIds = process.env.WITNESS_IDS?.split(",") || []),
          (this.vleiServerUrl =
            process.env.VLEI_SERVER || "http://schemas.rootsid.cloud"),
          (this.apiBaseUrl =
            process.env.REG_PILOT_API || "http://localhost:8000"),
          (this.filerBaseUrl =
            process.env.REG_PILOT_FILER || "http://localhost:7878"),
          (this.proxyBaseUrl =
            process.env.REG_PILOT_PROXY || "No RootsID test proxy set"),
          (this.verifierBaseUrl =
            process.env.VLEI_VERIFIER || "Demo verifier not set"),
          (this.workflow = process.env.WORKFLOW || ""),
          (this.configuration = process.env.CONFIGURATION || "config.json");
      case "eba_bank_test":
        (this.keriaAdminUrl =
          process.env.KERIA_ADMIN_URL || `http://localhost:${keriaAdminPort}`),
          (this.keriaBootUrl =
            process.env.KERIA_BOOT_URL || `http://localhost:${keriaBootPort}`),
          (this.keriaHttpUrl =
            process.env.KERIA_HTTP_URL || `http://localhost:${keriaHttpPort}`),
          (this.witnessUrls = process.env.WITNESS_URLS?.split(",") || [""]),
          (this.witnessIds = process.env.WITNESS_IDS?.split(",") || []),
          (this.vleiServerUrl =
            process.env.VLEI_SERVER || "http://schemas.rootsid.cloud"),
          (this.apiBaseUrl =
            process.env.REG_PILOT_API ||
            "https://errp.test.eba.europa.eu/api-security"),
          (this.filerBaseUrl =
            process.env.REG_PILOT_FILER ||
            "https://errp.test.eba.europa.eu/api"),
          (this.proxyBaseUrl =
            process.env.REG_PILOT_PROXY || "No test proxy set"),
          (this.verifierBaseUrl =
            process.env.VLEI_VERIFIER || "Demo verifier not set"),
          (this.workflow = process.env.WORKFLOW || ""),
          (this.configuration = process.env.CONFIGURATION || "config.json");
      case "nordlei_dev":
        (this.keriaAdminUrl =
          process.env.KERIA_ADMIN_URL || "https://demo.wallet.vlei.tech"),
          (this.keriaBootUrl =
            process.env.KERIA_BOOT_URL ||
            `https://demo.wallet.vlei.tech:${keriaBootPort}`), // must request access
          (this.keriaHttpUrl =
            process.env.KERIA_HTTP_URL || "https://demo.wallet.vlei.tech"),
          (this.witnessUrls =
            process.env.WITNESS_URLS === ""
              ? []
              : process.env.WITNESS_URLS?.split(",") || [
                  "https://william.witness.vlei.tech/oobi",
                  "https://wesley.witness.vlei.tech/oobi",
                  "https://whitney.witness.vlei.tech/oobi",
                  "https://wilma.witness.vlei.tech/oobi",
                  "https://wilbur.witness.vlei.tech/oobi",
                ]),
          (this.witnessIds =
            process.env.WITNESS_IDS === ""
              ? []
              : process.env.WITNESS_IDS?.split(",") || [
                  "BMn9DacVHdgg66ukO0fYwQx1IV5hCchPd7Gb5zCCQYsv",
                  "BGNpoM1a8VMMJEZC8DKgiyEsTTviWkgQ6e4f6rRFkoxV",
                  "BLiMaTh2Mr540wD6FynMc3SaAtHhjOTJfO_j-1E7WwC2",
                  "BFX3CtauhMYyLOxX44q4yzQfwd4ekmBWF1oteXx8iiWn",
                  "BOwl2CUm-5nvVy8krTlSxzHkcQSBAXHYz412Cl-e20xS",
                ]),
          (this.vleiServerUrl =
            process.env.VLEI_SERVER || "http://schemas.rootsid.cloud"),
          (this.apiBaseUrl =
            process.env.REG_PILOT_API || "NordLEI dev reg-pilot-api not set"),
          (this.filerBaseUrl = process.env.REG_PILOT_FILER || ""),
          (this.proxyBaseUrl =
            process.env.REG_PILOT_PROXY || "No NordLEI dev proxy set"),
          (this.verifierBaseUrl =
            process.env.VLEI_VERIFIER || "NordLEI dev verifier not set"),
          (this.workflow =
            process.env.WORKFLOW || "singlesig-single-user.yaml"),
          (this.configuration =
            process.env.CONFIGURATION ||
            "configuration-singlesig-single-user.json");
      case "nordlei_demo":
        (this.keriaAdminUrl =
          process.env.KERIA_ADMIN_URL || "https://errp.wallet.vlei.io"),
          (this.keriaHttpUrl =
            process.env.KERIA_HTTP_URL ||
            `https://errp.wallet.vlei.io:${keriaBootPort}`),
          (this.keriaBootUrl =
            process.env.KERIA_BOOT_URL || "https://errp.wallet.vlei.io/boot"),
          (this.witnessUrls =
            process.env.WITNESS_URLS === ""
              ? []
              : process.env.WITNESS_URLS?.split(",") || [
                  "https://william.witness.vlei.io/oobi",
                  "https://wesley.witness.vlei.io/oobi",
                  "https://whitney.witness.vlei.io/oobi",
                  "https://wilma.witness.vlei.io/oobi",
                  "https://wilbur.witness.vlei.io/oobi",
                ]),
          (this.witnessIds =
            process.env.WITNESS_IDS === ""
              ? []
              : process.env.WITNESS_IDS?.split(",") || [
                  "BB6_wAm4rtFPRFg1qJHbC1RWNcRKMth2sFw6MgSqFKg_",
                  "BGJvFwob-UV5J1vSbuCroz27k4FGaZE992K4sc79cD54",
                  "BMMOAZ4Ujv0jP3VhCAHmx9yTSBoP1sAoDjFXas14JYG-",
                  "BIrxc3loHN4kQ2HN8Ev-bisMBZzkdfXQdwl4KKdy2iZh",
                  "BDTChgVW3pAxkYCYDVWV9DQYu_FTZ8laD-WhpFHvY9SQ",
                ]),
          (this.vleiServerUrl =
            process.env.VLEI_SERVER || "http://schemas.rootsid.cloud"),
          (this.apiBaseUrl =
            process.env.REG_PILOT_API || "NordLEI demo reg-pilot-api not set"),
          (this.filerBaseUrl = process.env.REG_PILOT_FILER || ""),
          (this.proxyBaseUrl =
            process.env.REG_PILOT_PROXY || "No NordLEI demo proxy set"),
          (this.verifierBaseUrl =
            process.env.VLEI_VERIFIER || "NordLEI demo verifier not set"),
          (this.workflow =
            process.env.WORKFLOW || "singlesig-single-user.yaml"),
          (this.configuration =
            process.env.CONFIGURATION ||
            "configuration-singlesig-single-user.json");
      case "nordlei_dry":
        (this.keriaAdminUrl =
          process.env.KERIA_ADMIN_URL ||
          "https://testbank.wallet.dryrun.vlei.dev"),
          (this.keriaBootUrl =
            process.env.KERIA_BOOT_URL ||
            "https://testbank.wallet.dryrun.vlei.dev/boot"),
          (this.keriaHttpUrl =
            process.env.KERIA_HTTP_URL ||
            "https://testbank.wallet.dryrun.vlei.dev"),
          (this.witnessUrls =
            process.env.WITNESS_URLS === ""
              ? []
              : process.env.WITNESS_URLS?.split(",") || [
                  "https://william.witness.dryrun.vlei.dev/oobi",
                ]),
          (this.witnessIds =
            process.env.WITNESS_IDS === ""
              ? []
              : process.env.WITNESS_IDS?.split(",") || [
                  "BFEr4VPW1B2oWwlNG3rjwe2c-eyXbtqqJds88bDnFGNk",
                ]),
          (this.vleiServerUrl =
            process.env.VLEI_SERVER || "http://schemas.rootsid.cloud"),
          (this.apiBaseUrl =
            process.env.REG_PILOT_API || "NordLEI demo reg-pilot-api not set"),
          (this.filerBaseUrl = process.env.REG_PILOT_FILER || ""),
          (this.proxyBaseUrl =
            process.env.REG_PILOT_PROXY || "No NordLEI demo proxy set"),
          (this.verifierBaseUrl =
            process.env.VLEI_VERIFIER || "NordLEI demo verifier not set"),
          (this.workflow =
            process.env.WORKFLOW || "singlesig-single-user.yaml"),
          (this.configuration =
            process.env.CONFIGURATION ||
            "configuration-singlesig-single-user.json");
      default:
        throw new Error(`Unknown test environment preset '${this.preset}'`);
    }
    console.log("Test environment preset: ", JSON.stringify(this));
  }

  public static getInstance(
    kAdminPort?: number,
    kHttpPort?: number,
    kBootPort?: number
  ): TestEnvironment {
    if (!TestEnvironment.instance) {
      if (
        kAdminPort === undefined ||
        kHttpPort === undefined ||
        kBootPort === undefined
      ) {
        throw new Error(
          "TestEnvironment.getInstance() called without port config means we expected it to be initialized earlier. This must be done with great care to avoid unexpected side effects."
        );
      }
      TestEnvironment.instance = new TestEnvironment(
        kAdminPort,
        kHttpPort,
        kBootPort
      );
    }
    return TestEnvironment.instance;
  }
}

export class TestPaths {
  private static instance: TestPaths;
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

  private constructor(userName = "Bank_1") {
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
      : userName;
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

  public static getInstance(userName = "Bank_1"): TestPaths {
    if (!TestPaths.instance) {
      TestPaths.instance = new TestPaths(userName);
    }
    return TestPaths.instance;
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

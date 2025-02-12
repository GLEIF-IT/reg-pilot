import { TestPaths } from "./resolve-env";

import fs from "fs";
import yaml from "js-yaml";
import crypto from "crypto";

function generateSecret() {
  return crypto
    .randomBytes(16)
    .toString("base64")
    .slice(0, 21)
    .replace(/[^a-zA-Z0-9]/g, "A");
}

const generateLei = () =>
  `${Math.floor(100000 + Math.random() * 900000)}${Array.from({ length: 14 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]).join("")}`;

const gleifSecrets = {
  gleif1: "D_PbQb01zuzQgK-kDWjq1",
};

const qviSecrets = {
  qvi1: "BTaqgh1eeOjXO5iQJp6m1",
};

export function generateBankConfig(bankId: number) {
  const leSecrets = {
    le1: generateSecret(),
  };

  const ecrSecrets = {
    ecr1: generateSecret(),
    ecr2: generateSecret(),
    ecr3: generateSecret(),
  };

  const oorSecrets = {
    oor1: generateSecret(),
    oor2: generateSecret(),
  };

  const LEI = generateLei();

  // Define config structure
  const config = {
    secrets: {
      ...gleifSecrets,
      ...qviSecrets,
      ...leSecrets,
      ...ecrSecrets,
      ...oorSecrets,
    },
    agents: {
      "gleif-agent-1": {
        secret: "gleif1",
      },
      "qvi-agent-1": {
        secret: "qvi1",
      },
      "le-agent-1": {
        secret: "le1",
      },
      "ecr-agent-1": {
        secret: "ecr1",
      },
      "ecr-agent-2": {
        secret: "ecr2",
      },
      "ecr-agent-3": {
        secret: "ecr3",
      },
      "oor-agent-1": {
        secret: "oor1",
      },
      "oor-agent-2": {
        secret: "oor2",
      },
    },
    identifiers: {
      "gleif-aid-1": {
        agent: "gleif-agent-1",
        name: "gleif-aid-1",
      },
      "qvi-aid-1": {
        delegator: "gleif-aid-1",
        agent: "qvi-agent-1",
        name: "qvi-aid-1",
      },
      "le-aid-1": {
        agent: "le-agent-1",
        name: "le-aid-1",
      },
      "ecr-aid-1": {
        agent: "ecr-agent-1",
        name: "ecr-aid-1",
      },
      "ecr-aid-2": {
        agent: "ecr-agent-2",
        name: "ecr-aid-2",
      },
      "ecr-aid-3": {
        agent: "ecr-agent-3",
        name: "ecr-aid-3",
      },
      "oor-aid-1": {
        agent: "oor-agent-1",
        name: "oor-aid-1",
      },
      "oor-aid-2": {
        agent: "oor-agent-2",
        name: "oor-aid-2",
      },
    },
    credentials: {
      gleif_to_qvi_vlei_cred: {
        type: "direct",
        schema: "QVI_SCHEMA_SAID",
        privacy: false,
        attributes: {},
      },
      qvi_to_le_vlei_cred: {
        credSource: {
          type: "qvi",
        },
        type: "direct",
        schema: "LE_SCHEMA_SAID",
        rules: "LE_RULES",
        privacy: false,
        attributes: {},
      },
      le_to_ecr_vlei_cred: {
        credSource: {
          type: "le",
        },
        type: "direct",
        schema: "ECR_SCHEMA_SAID",
        rules: "ECR_RULES",
        privacy: true,
        attributes: {
          engagementContextRole: "EBA Data Submitter",
        },
      },
      le_to_qvi_oor_auth_cred: {
        credSource: {
          type: "le",
        },
        type: "direct",
        schema: "OOR_AUTH_SCHEMA_SAID",
        rules: "OOR_AUTH_RULES",
        privacy: false,
        attributes: {
          officialRole: "HR Manager",
        },
      },
      qvi_to_oor_vlei_cred_from_le_to_qvi_ecr_auth_cred: {
        credSource: {
          type: "auth",
          o: "I2I",
        },
        type: "direct",
        schema: "OOR_SCHEMA_SAID",
        rules: "OOR_RULES",
        privacy: false,
        attributes: {
          officialRole: "HR Manager",
        },
      },
    },
    users: [
      {
        type: "GLEIF",
        alias: "gleif-user-1",
        identifiers: ["gleif-aid-1"],
      },
      {
        type: "QVI",
        alias: "qvi-user-1",
        identifiers: ["qvi-aid-1"],
      },
      {
        type: "LE",
        alias: "le-user-1",
        identifiers: ["le-aid-1"],
      },
      {
        type: "ECR",
        alias: "ecr-user-1",
        identifiers: ["ecr-aid-1"],
      },
      {
        type: "ECR",
        alias: "ecr-user-2",
        identifiers: ["ecr-aid-2"],
      },
      {
        type: "ECR",
        alias: "ecr-user-3",
        identifiers: ["ecr-aid-3"],
      },
      {
        type: "OOR",
        alias: "oor-user-1",
        identifiers: ["oor-aid-1"],
      },
      {
        type: "OOR",
        alias: "oor-user-2",
        identifiers: ["oor-aid-2"],
      },
    ],
  };

  const testPaths = TestPaths.getInstance();
  // Define workflow structure
  let workflow = {
    workflow: {
      steps: {
        qvi_cred: {
          id: "qvi_cred",
          type: "issue_credential",
          attributes: {
            LEI: LEI,
          },
          issuer_aid: "gleif-aid-1",
          issuee_aid: "qvi-aid-1",
          description: "GLEIF issues QVI vLEI credential",
          credential: "gleif_to_qvi_vlei_cred",
        },
        le_cred: {
          id: "le_cred",
          type: "issue_credential",
          attributes: {
            LEI: LEI,
          },
          issuer_aid: "qvi-aid-1",
          issuee_aid: "le-aid-1",
          description: "QVI issues LE vLEI credential",
          credential: "qvi_to_le_vlei_cred",
          credential_source: "qvi_cred",
        },
        ecr_cred_1: {
          id: "ecr_cred_1",
          type: "issue_credential",
          attributes: {
            personLegalName: "John Doe",
            LEI: LEI,
          },
          issuer_aid: "le-aid-1",
          issuee_aid: "ecr-aid-1",
          description: "LE issues ECR vLEI credential",
          credential: "le_to_ecr_vlei_cred",
          credential_source: "le_cred",
        },
        ecr_cred_2: {
          id: "ecr_cred_2",
          type: "issue_credential",
          attributes: {
            personLegalName: "David Mitchell",
            LEI: LEI,
          },
          issuer_aid: "le-aid-1",
          issuee_aid: "ecr-aid-2",
          description: "LE issues ECR vLEI credential",
          credential: "le_to_ecr_vlei_cred",
          credential_source: "le_cred",
        },
        ecr_cred_3: {
          id: "ecr_cred_3",
          type: "issue_credential",
          attributes: {
            personLegalName: "Sam Smith",
            LEI: LEI,
          },
          issuer_aid: "le-aid-1",
          issuee_aid: "ecr-aid-3",
          description: "LE issues ECR vLEI credential",
          credential: "le_to_ecr_vlei_cred",
          credential_source: "le_cred",
        },
        oor_auth_cred_1: {
          id: "oor_auth_cred_1",
          type: "issue_credential",
          attributes: {
            personLegalName: "Jessica Roberts",
            LEI: LEI,
            AID: "oor-aid-1",
          },
          issuer_aid: "le-aid-1",
          issuee_aid: "qvi-aid-1",
          description: "LE issues OOR Auth credential to QVI",
          credential: "le_to_qvi_oor_auth_cred",
          credential_source: "le_cred",
        },
        oor_cred_1: {
          id: "oor_cred_1",
          type: "issue_credential",
          attributes: {
            personLegalName: "Jessica Roberts",
            LEI: LEI,
          },
          issuer_aid: "qvi-aid-1",
          issuee_aid: "oor-aid-1",
          description: "QVI issues OOR credential",
          credential: "qvi_to_oor_vlei_cred_from_le_to_qvi_ecr_auth_cred",
          credential_source: "oor_auth_cred_1",
        },
        oor_auth_cred_2: {
          id: "oor_auth_cred_2",
          type: "issue_credential",
          attributes: {
            personLegalName: "Michael Thompson",
            LEI: LEI,
            AID: "oor-aid-2",
          },
          issuer_aid: "le-aid-1",
          issuee_aid: "qvi-aid-1",
          description: "LE issues OOR Auth credential to QVI",
          credential: "le_to_qvi_oor_auth_cred",
          credential_source: "le_cred",
        },
        oor_cred_2: {
          id: "oor_cred_1",
          type: "issue_credential",
          attributes: {
            personLegalName: "Michael Thompson",
            LEI: LEI,
          },
          issuer_aid: "qvi-aid-1",
          issuee_aid: "oor-aid-2",
          description: "QVI issues OOR credential",
          credential: "qvi_to_oor_vlei_cred_from_le_to_qvi_ecr_auth_cred",
          credential_source: "oor_auth_cred_2",
        },
        gen_report_ecr1: {
          id: "gen_report_ecr1",
          type: "generate_report",
          aid: "ecr-aid-1",
          description: "Generating reports for ecr-aid-1 user",
          copy_folder: `${testPaths.testUserDir}/reports`,
        },
        gen_report_ecr2: {
          id: "gen_report_ecr2",
          type: "generate_report",
          aid: "ecr-aid-2",
          description: "Generating reports for ecr-aid-2 user",
          copy_folder: `${testPaths.testUserDir}/reports`,
        },
        gen_report_ecr3: {
          id: "gen_report_ecr3",
          type: "generate_report",
          aid: "ecr-aid-3",
          description: "Generating reports for ecr-aid-3 user",
          copy_folder: `${testPaths.testUserDir}/reports`,
        },
      },
    },
  };

  if (!fs.existsSync(testPaths.testUserDir)) {
    fs.mkdirSync(testPaths.testUserDir);
  }

  // Write YAML and JSON files
  if (!fs.existsSync(testPaths.testUserDir)) {
    fs.mkdirSync(testPaths.testUserDir);
    let yamlStr = yaml.dump(workflow);
    yamlStr = yamlStr.replace(/: (?!\d|true|false|null)(\S.*)/g, ': "$1"');
    fs.writeFileSync(`${testPaths.testUserDir}/workflow.yaml`, yamlStr, "utf8");
    fs.writeFileSync(
      `${testPaths.testUserDir}/config.json`,
      JSON.stringify(config, null, 2),
      "utf8",
    );
    const metaInf = {
      secrets: {
        ...ecrSecrets,
        ...oorSecrets,
      },
    };
    fs.writeFileSync(
      `${testPaths.testUserDir}/metaInf.json`,
      JSON.stringify(metaInf, null, 2),
      "utf8",
    );
  }
}

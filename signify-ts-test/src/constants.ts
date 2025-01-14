import { Saider } from "signify-ts";
import { resolveEnvironment } from "./utils/resolve-env";

export const { vleiServerUrl, witnessIds } = resolveEnvironment();

export const QVI_SCHEMA_SAID = "EBfdlu8R27Fbx-ehrqwImnK-8Cm79sqbAQ4MmvEAYqao";
export const LE_SCHEMA_SAID = "ENPXp1vQzRF6JwIuS-mp2U8Uf1MoADoP_GqQ62VsDZWY";
export const ECR_AUTH_SCHEMA_SAID =
  "EH6ekLjSr8V32WyFbGe1zXjTzFs9PkTYmupJ9H65O14g";
export const ECR_SCHEMA_SAID = "EEy9PkikFcANV1l7EHukCeXqrzT1hNZjGlUk7wuMO5jw";
export const OOR_AUTH_SCHEMA_SAID =
  "EKA57bKBKxr_kN7iN5i7lMUxpMG-s19dRcmov1iDxz-E";
export const OOR_SCHEMA_SAID = "EBNaNu-M9P5cgrnfl2Fvymy4E_jvxxyjb70PRtiANlJy";

export const vLEIServerHostUrl = `${vleiServerUrl}/oobi`;
export const QVI_SCHEMA_URL = `${vLEIServerHostUrl}/${QVI_SCHEMA_SAID}`;
export const LE_SCHEMA_URL = `${vLEIServerHostUrl}/${LE_SCHEMA_SAID}`;
export const ECR_AUTH_SCHEMA_URL = `${vLEIServerHostUrl}/${ECR_AUTH_SCHEMA_SAID}`;
export const ECR_SCHEMA_URL = `${vLEIServerHostUrl}/${ECR_SCHEMA_SAID}`;
export const OOR_AUTH_SCHEMA_URL = `${vLEIServerHostUrl}/${OOR_AUTH_SCHEMA_SAID}`;
export const OOR_SCHEMA_URL = `${vLEIServerHostUrl}/${OOR_SCHEMA_SAID}`;

export const LE_RULES = Saider.saidify({
  d: "",
  usageDisclaimer: {
    l: "Usage of a valid, unexpired, and non-revoked vLEI Credential, as defined in the associated Ecosystem Governance Framework, does not assert that the Legal Entity is trustworthy, honest, reputable in its business dealings, safe to do business with, or compliant with any laws or that an implied or expressly intended purpose will be fulfilled.",
  },
  issuanceDisclaimer: {
    l: "All information in a valid, unexpired, and non-revoked vLEI Credential, as defined in the associated Ecosystem Governance Framework, is accurate as of the date the validation process was complete. The vLEI Credential has been issued to the legal entity or person named in the vLEI Credential as the subject; and the qualified vLEI Issuer exercised reasonable care to perform the validation process set forth in the vLEI Ecosystem Governance Framework.",
  },
})[1];

export const ECR_RULES = Saider.saidify({
  d: "",
  usageDisclaimer: {
    l: "Usage of a valid, unexpired, and non-revoked vLEI Credential, as defined in the associated Ecosystem Governance Framework, does not assert that the Legal Entity is trustworthy, honest, reputable in its business dealings, safe to do business with, or compliant with any laws or that an implied or expressly intended purpose will be fulfilled.",
  },
  issuanceDisclaimer: {
    l: "All information in a valid, unexpired, and non-revoked vLEI Credential, as defined in the associated Ecosystem Governance Framework, is accurate as of the date the validation process was complete. The vLEI Credential has been issued to the legal entity or person named in the vLEI Credential as the subject; and the qualified vLEI Issuer exercised reasonable care to perform the validation process set forth in the vLEI Ecosystem Governance Framework.",
  },
  privacyDisclaimer: {
    l: "It is the sole responsibility of Holders as Issuees of an ECR vLEI Credential to present that Credential in a privacy-preserving manner using the mechanisms provided in the Issuance and Presentation Exchange (IPEX) protocol specification and the Authentic Chained Data Container (ACDC) specification. https://github.com/WebOfTrust/IETF-IPEX and https://github.com/trustoverip/tswg-acdc-specification.",
  },
})[1];

export const ECR_AUTH_RULES = Saider.saidify({
  d: "",
  usageDisclaimer: {
    l: "Usage of a valid, unexpired, and non-revoked vLEI Credential, as defined in the associated Ecosystem Governance Framework, does not assert that the Legal Entity is trustworthy, honest, reputable in its business dealings, safe to do business with, or compliant with any laws or that an implied or expressly intended purpose will be fulfilled.",
  },
  issuanceDisclaimer: {
    l: "All information in a valid, unexpired, and non-revoked vLEI Credential, as defined in the associated Ecosystem Governance Framework, is accurate as of the date the validation process was complete. The vLEI Credential has been issued to the legal entity or person named in the vLEI Credential as the subject; and the qualified vLEI Issuer exercised reasonable care to perform the validation process set forth in the vLEI Ecosystem Governance Framework.",
  },
  privacyDisclaimer: {
    l: "Privacy Considerations are applicable to QVI ECR AUTH vLEI Credentials.  It is the sole responsibility of QVIs as Issuees of QVI ECR AUTH vLEI Credentials to present these Credentials in a privacy-preserving manner using the mechanisms provided in the Issuance and Presentation Exchange (IPEX) protocol specification and the Authentic Chained Data Container (ACDC) specification.  https://github.com/WebOfTrust/IETF-IPEX and https://github.com/trustoverip/tswg-acdc-specification.",
  },
})[1];
export const OOR_RULES = LE_RULES;
export const OOR_AUTH_RULES = LE_RULES;

export const CRED_RETRY_DEFAULTS = {
  maxSleep: 100000,
  minSleep: 2000,
  maxRetries: undefined,
  timeout: 500000,
};

export const SCHEMAS = {
  QVI_SCHEMA_SAID: QVI_SCHEMA_SAID,
  LE_SCHEMA_SAID: LE_SCHEMA_SAID,
  ECR_AUTH_SCHEMA_SAID: ECR_AUTH_SCHEMA_SAID,
  ECR_SCHEMA_SAID: ECR_SCHEMA_SAID,
  OOR_AUTH_SCHEMA_SAID: OOR_AUTH_SCHEMA_SAID,
  OOR_SCHEMA_SAID: OOR_SCHEMA_SAID,
};

export const RULES = {
  LE_RULES: LE_RULES,
  ECR_RULES: ECR_RULES,
  ECR_AUTH_RULES: ECR_AUTH_RULES,
  OOR_RULES: OOR_RULES,
  OOR_AUTH_RULES: OOR_AUTH_RULES,
};

export const QVI_INTERNAL_NAME = "QVI";
export const LE_INTERNAL_NAME = "LE";

export const unknownPrefix = "EBcIURLpxmVwahksgrsGW6_dUw0zBhyEHYFk17eWrZfk";

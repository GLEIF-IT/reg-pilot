import { VleiIssuance } from "../src/vlei-issuance";
import { resolveEnvironment } from "./utils/resolve-env";
// Set configuration file here
// const secretsJsonPath = "./src/multisig-multiple-aid-secrets.json";
const env = resolveEnvironment();

test("vlei-issuance", async function run() {
  const ve: VleiIssuance = new VleiIssuance(env.secretsJsonConfig);
  await ve.prepareClients();
  await ve.issueCredentials();
}, 3600000);

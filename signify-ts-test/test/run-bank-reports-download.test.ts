import { downloadReports } from "./utils/test-reports";

test("bank-reports-download", async function run() {
  await downloadReports(581)
}, 3600000);

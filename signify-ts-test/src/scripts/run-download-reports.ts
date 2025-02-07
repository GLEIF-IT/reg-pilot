import { downloadConfigWorkflowReports } from "../utils/bank-reports";
import { TestPaths } from "../utils/resolve-env";

async function main(bankNum: number) {
  if (isNaN(bankNum)) {
    throw new Error(
      "A valid bank number is required to run the download reports script.",
    );
  }

  try {
    const bankName = `Bank_${bankNum}`;
    const testPaths = TestPaths.getInstance(bankName);
    await downloadConfigWorkflowReports(bankName);
    console.log("Reports downloaded successfully.");
  } catch (error) {
    console.error("Error downloading reports:", error);
    process.exit(1);
  }
}

// Parse command-line arguments
const args = process.argv.slice(2);
const bankNum = parseInt(args[0], 10);
console.log(`Running download reports for bank number: ${bankNum}`);
await main(bankNum);

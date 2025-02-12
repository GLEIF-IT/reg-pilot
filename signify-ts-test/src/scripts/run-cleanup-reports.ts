import { cleanupReports } from "../utils/bank-reports";

async function main(bankNum: number) {
  if (isNaN(bankNum)) {
    throw new Error(
      "A valid bank number is required to run the cleanup reports script.",
    );
  }

  try {
    await cleanupReports(bankNum);
    console.log("Reports cleanup successfully.");
  } catch (error) {
    console.error("Error cleanup reports:", error);
    process.exit(1);
  }
}

// Parse command-line arguments
const args = process.argv.slice(2);
const bankNum = parseInt(args[0], 10);
console.log(`Running cleanup reports for bank number: ${bankNum}`);
await main(bankNum);

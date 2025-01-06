import { downloadReports } from '../utils/test-reports';

async function main() {
  try {
    await downloadReports();
    console.log('Reports downloaded successfully.');
  } catch (error) {
    console.error('Error downloading reports:', error);
    process.exit(1);
  }
}

main();
import { downloadReports } from '../utils/bank-reports';

async function main() {
  let bankNum;
  if (!process.env.TEST_USER_NAME) {
    throw new Error('TEST_USER_NAME environment variable is required to run the download reports script.')
  } else {
    bankNum = parseInt(process.env.TEST_USER_NAME);
  }

  try {
    await downloadReports();
    console.log('Reports downloaded successfully.');
  } catch (error) {
    console.error('Error downloading reports:', error);
    process.exit(1);
  }
}

main();
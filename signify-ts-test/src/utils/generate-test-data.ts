import fs from "fs";
import path from "path";

const testDataDir = "test_data";

export async function buildTestData(
  testData: EcrTestData,
  testName: string,
  issueName: string,
  fileNamePrefix: string = ""
): Promise<string> {
  let testDataDirPrefixed = path.join(
    process.cwd(),
    "../../test",
    "data",
    testDataDir,
    testName
  );
  if (!fs.existsSync(testDataDirPrefixed)) {
    fs.mkdirSync(testDataDirPrefixed);
  }
  testData.credential["issueName"] = issueName;
  const testDataJson = JSON.stringify(testData);
  const fileName = `${fileNamePrefix}${testData.lei}_${testData.aid}_${testData.engagementContextRole}.json`;
  await fs.writeFile(
    `${testDataDirPrefixed}/${fileName}`,
    testDataJson,
    "utf8",
    (err: NodeJS.ErrnoException | null) => {
      if (err) throw err;
    }
  );
  return testDataDirPrefixed;
}

export interface EcrTestData {
  aid: string;
  credential: any;
  lei: string;
  engagementContextRole: string;
}

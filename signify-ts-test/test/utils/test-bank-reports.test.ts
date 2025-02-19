import fs from "fs";
import { createZipWithCopies } from "../../src/utils/bank-reports";
import { TestPaths } from "../../src/utils/resolve-env";

describe("test bank reports testing", () => {
  test("generate dynamic eba zip for signature", async () => {
    // Example usage
    // const pdfPath =
    //   "test/data/eba_reports/237932ALYUME7DQDC2D7.CON_GR_PILLAR3010000_P3REMDISDOCS_2023-12-31_202401113083647123.pdf";
    const maxSize = 2; // 5 MB
    const userName = "unitTest";
    const testPaths = TestPaths.getInstance(userName);
    const zipFilePath = createZipWithCopies(
      testPaths.testReportUnsigned,
      userName,
      maxSize,
      true,
      1,
    );
    console.log(`Generated zip file during test: ${zipFilePath}`);
    expect(zipFilePath).toContain(".zip");
    expect(zipFilePath).toContain("eba_reports");
    expect(zipFilePath).toContain(userName);
    const stats = fs.statSync(zipFilePath);
    expect(stats.size).toBeGreaterThan(1024 * 1024 * 1.5); // 1.5 MB

    const zipFilePathHalfTheSize = createZipWithCopies(
      testPaths.testReportUnsigned,
      userName,
      maxSize,
      true,
      2,
    );
    console.log(`Generated zip file during test: ${zipFilePathHalfTheSize}`);
    expect(zipFilePathHalfTheSize).toContain(`.zip`);
    expect(zipFilePathHalfTheSize).toContain("eba_reports");

    // Get statistics of the generated ZIP file with name
    const statsHalf = fs.statSync(zipFilePathHalfTheSize);
    expect(statsHalf.size).toBeLessThan(stats.size);
    expect(statsHalf.size).toBeGreaterThan(1024 * 1024 * 0.5); // .5 MB
  });
});

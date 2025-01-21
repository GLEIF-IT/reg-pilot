import { createZipWithCopies } from "../../src/utils/bank-reports";

describe("test bank reports testing", () => {
    test("generate dynamic eba zip for signature", async () => {
      // Example usage
      const pdfPath =
        "test/data/eba_reports/237932ALYUME7DQDC2D7.CON_GR_PILLAR3010000_P3REMDISDOCS_2023-12-31_202401113083647123.pdf";
      const maxSize = 2; // 5 MB
      const zipFilePath = createZipWithCopies(pdfPath, maxSize);
      console.log(`Generated zip file during test: ${zipFilePath}`);
      expect(zipFilePath).toContain(".zip");
      expect(zipFilePath).toContain("eba_reports");
    });
  });
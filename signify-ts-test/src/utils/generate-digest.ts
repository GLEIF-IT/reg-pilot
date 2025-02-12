import { createHash } from "crypto";
import JSZip from "jszip";

export function generateFileDigest(buffer: Buffer): string {
  const algo = "sha256";
  const digest = Buffer.from(hash(buffer, algo));
  const prefixeDigest = `${algo}-${digest}`;
  return prefixeDigest;
}

function hash(data: Buffer, algo: string): string {
  return createHash(algo).update(data).digest("hex");
}

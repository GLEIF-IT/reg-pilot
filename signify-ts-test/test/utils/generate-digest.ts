import { createHash } from 'crypto';
import JSZip from "jszip";


export function generateFileDigest(buffer: Buffer, algo: string): string {
    const digest = Buffer.from(
        hash(buffer, algo),
    );  
    const prefixeDigest = `${algo}_${digest}`;
    return prefixeDigest;
}
  
function hash(data: Buffer, algo: string): string {
    return createHash(algo).update(data).digest('hex');
}
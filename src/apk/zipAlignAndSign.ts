import JSZip from 'jszip';
import forge from 'node-forge';

export interface ApkZipEntry {
  name: string;
  data: Uint8Array;
  store?: boolean;
}

export interface SigningCredentials {
  keyPem: string;
  certPem: string;
}

const textEncoder = new TextEncoder();

// Standard IEEE 802.3 CRC-32 lookup table
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function bytesToBin(u: Uint8Array): string {
  let out = '';
  for (let i = 0; i < u.length; i += 8192) {
    out += String.fromCharCode(...u.subarray(i, i + 8192));
  }
  return out;
}

function binToBytes(s: string): Uint8Array {
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    u[i] = s.charCodeAt(i) & 0xff;
  }
  return u;
}

function sha256Bytes(bytes: Uint8Array): Uint8Array {
  const md = forge.md.sha256.create();
  md.update(bytesToBin(bytes));
  return binToBytes(md.digest().getBytes());
}

function sha256B64(bytes: Uint8Array): string {
  const md = forge.md.sha256.create();
  md.update(bytesToBin(bytes));
  return forge.util.encode64(md.digest().getBytes());
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}

function u64le(n: number): Uint8Array {
  const b = new Uint8Array(8);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, n >>> 0, true);
  dv.setUint32(4, Math.floor(n / 0x100000000) >>> 0, true);
  return b;
}

function wrapManifestLine(line: string): string {
  const out: string[] = [];
  let cur = '';
  let curBytes = 0;
  const limit = 70;
  for (const ch of line) {
    const bl = textEncoder.encode(ch).length;
    if (curBytes + bl > limit) {
      out.push(cur);
      cur = ' ';
      curBytes = 1;
    }
    cur += ch;
    curBytes += bl;
  }
  out.push(cur);
  return `${out.join('\r\n')}\r\n`;
}

/**
 * Generates JAR v1 signature entries (MANIFEST.MF, CERT.SF, CERT.RSA).
 * Includes `X-Android-APK-Signed: 2` so Android 7+ enforces v2 signature verification.
 */
function createV1SignatureFiles(
  entries: ApkZipEntry[],
  creds: SigningCredentials,
): ApkZipEntry[] {
  const sorted = [...entries]
    .filter((e) => !e.name.startsWith('META-INF/'))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const mfMain = 'Manifest-Version: 1.0\r\nCreated-By: 1.0 (Android)\r\n\r\n';
  const sections: string[] = [];

  for (const entry of sorted) {
    const digest = sha256B64(entry.data);
    sections.push(`${wrapManifestLine(`Name: ${entry.name}`)}${wrapManifestLine(`SHA-256-Digest: ${digest}`)}\r\n`);
  }

  const mfBytes = textEncoder.encode(mfMain + sections.join(''));
  const mfDigest = sha256B64(mfBytes);

  let sf =
    'Signature-Version: 1.0\r\n' +
    'Created-By: 1.0 (Android)\r\n' +
    `SHA-256-Digest-Manifest: ${mfDigest}\r\n` +
    'X-Android-APK-Signed: 2\r\n' +
    '\r\n';

  sorted.forEach((entry, i) => {
    const secDigest = sha256B64(textEncoder.encode(sections[i]));
    sf += `${wrapManifestLine(`Name: ${entry.name}`)}${wrapManifestLine(`SHA-256-Digest: ${secDigest}`)}\r\n`;
  });

  const sfBytes = textEncoder.encode(sf);
  const key = forge.pki.privateKeyFromPem(creds.keyPem);
  const cert = forge.pki.certificateFromPem(creds.certPem);

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(bytesToBin(sfBytes));
  p7.addCertificate(cert);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  });
  p7.sign({ detached: true });

  const rsaBytes = binToBytes(forge.asn1.toDer(p7.toAsn1()).getBytes());

  return [
    { name: 'META-INF/MANIFEST.MF', data: mfBytes, store: false },
    { name: 'META-INF/CERT.SF', data: sfBytes, store: false },
    { name: 'META-INF/CERT.RSA', data: rsaBytes, store: false },
  ];
}

interface CompressedPayload {
  method: 0 | 8;
  payload: Uint8Array;
  crc: number;
  uncompressedSize: number;
}

/**
 * Compresses non-STORE entries via JSZip and extracts raw DEFLATE streams so we can assemble
 * a clean, deterministic, 4-byte zipaligned ZIP without Data Descriptors.
 */
async function compressEntries(entries: ApkZipEntry[]): Promise<Map<string, CompressedPayload>> {
  const deflateItems = entries.filter((e) => !e.store);
  const result = new Map<string, CompressedPayload>();

  if (deflateItems.length > 0) {
    const tmpZip = new JSZip();
    for (const item of deflateItems) {
      tmpZip.file(item.name, item.data, {
        createFolders: false,
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
    }
    const rawZip = await tmpZip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
      platform: 'DOS',
    });

    const dv = new DataView(rawZip.buffer, rawZip.byteOffset, rawZip.byteLength);
    // Parse EOCD and Central Directory to reliably locate every compressed payload
    let eocdPos = -1;
    for (let i = rawZip.length - 22; i >= Math.max(0, rawZip.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) {
        eocdPos = i;
        break;
      }
    }
    if (eocdPos !== -1) {
      const cdOffset = dv.getUint32(eocdPos + 16, true);
      const totalEntries = dv.getUint16(eocdPos + 10, true);
      const decoder = new TextDecoder('utf-8');
      let cdPos = cdOffset;
      for (let i = 0; i < totalEntries && cdPos + 46 <= eocdPos; i++) {
        if (dv.getUint32(cdPos, true) !== 0x02014b50) break;
        const method = dv.getUint16(cdPos + 10, true);
        const crc = dv.getUint32(cdPos + 16, true);
        const csize = dv.getUint32(cdPos + 20, true);
        const usize = dv.getUint32(cdPos + 24, true);
        const fnLen = dv.getUint16(cdPos + 28, true);
        const exLen = dv.getUint16(cdPos + 30, true);
        const cmtLen = dv.getUint16(cdPos + 32, true);
        const localOff = dv.getUint32(cdPos + 42, true);
        const name = decoder.decode(rawZip.subarray(cdPos + 46, cdPos + 46 + fnLen));

        const lFnLen = dv.getUint16(localOff + 26, true);
        const lExLen = dv.getUint16(localOff + 28, true);
        const dataStart = localOff + 30 + lFnLen + lExLen;
        const payload = rawZip.subarray(dataStart, dataStart + csize);

        result.set(name, {
          method: method === 8 ? 8 : 0,
          payload,
          crc,
          uncompressedSize: usize,
        });

        cdPos += 46 + fnLen + exLen + cmtLen;
      }
    }
  }

  for (const item of entries) {
    if (item.store || !result.has(item.name)) {
      result.set(item.name, {
        method: 0,
        payload: item.data,
        crc: crc32(item.data),
        uncompressedSize: item.data.length,
      });
    }
  }

  return result;
}

interface ZipParts {
  entriesBytes: Uint8Array;
  centralDirBytes: Uint8Array;
  eocdBytes: Uint8Array;
  alignedStoreCount: number;
}

/**
 * Builds a clean, 4-byte zipaligned ZIP archive (`zipalign -p 4` behavior).
 */
async function buildAlignedZipParts(entries: ApkZipEntry[]): Promise<ZipParts> {
  const compressedMap = await compressEntries(entries);

  const localChunks: Uint8Array[] = [];
  const cdChunks: Uint8Array[] = [];
  let offset = 0;
  let alignedStoreCount = 0;

  // Deterministic DOS timestamp (2024-01-01 00:00:00)
  const dosTime = 0x0000;
  const dosDate = 0x5821; // (2024-1980)<<9 | (1<<5) | 1

  for (const entry of entries) {
    const info = compressedMap.get(entry.name)!;
    const isStore = info.method === 0;
    const nameBytes = textEncoder.encode(entry.name);

    // For STORE entries, pad local header extra field so file data starts on a 4-byte boundary
    const dataOffsetUnpadded = offset + 30 + nameBytes.length;
    const padLen = isStore ? (4 - (dataOffsetUnpadded % 4)) % 4 : 0;
    if (isStore) alignedStoreCount++;

    const localHeader = new Uint8Array(30 + nameBytes.length + padLen);
    const ldv = new DataView(localHeader.buffer);
    ldv.setUint32(0, 0x04034b50, true); // Local file header signature
    ldv.setUint16(4, isStore ? 10 : 20, true); // Version needed
    ldv.setUint16(6, 0x0800, true); // Bit 11: UTF-8 filename (no bit 3 data descriptor)
    ldv.setUint16(8, info.method, true);
    ldv.setUint16(10, dosTime, true);
    ldv.setUint16(12, dosDate, true);
    ldv.setUint32(14, info.crc, true);
    ldv.setUint32(18, info.payload.length, true);
    ldv.setUint32(22, info.uncompressedSize, true);
    ldv.setUint16(26, nameBytes.length, true);
    ldv.setUint16(28, padLen, true);
    localHeader.set(nameBytes, 30);
    // Remaining `padLen` bytes in extra field stay 0x00

    localChunks.push(localHeader, info.payload);

    // Central directory header
    const cdHeader = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(cdHeader.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true); // Version made by
    cdv.setUint16(6, isStore ? 10 : 20, true);
    cdv.setUint16(8, 0x0800, true);
    cdv.setUint16(10, info.method, true);
    cdv.setUint16(12, dosTime, true);
    cdv.setUint16(14, dosDate, true);
    cdv.setUint32(16, info.crc, true);
    cdv.setUint32(20, info.payload.length, true);
    cdv.setUint32(24, info.uncompressedSize, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint16(30, 0, true); // Extra length in CD is 0
    cdv.setUint16(32, 0, true); // Comment length
    cdv.setUint16(34, 0, true); // Disk number start
    cdv.setUint16(36, 0, true); // Internal attributes
    cdv.setUint32(38, 0, true); // External attributes
    cdv.setUint32(42, offset, true); // Relative offset of local header
    cdHeader.set(nameBytes, 46);
    cdChunks.push(cdHeader);

    offset += localHeader.length + info.payload.length;
  }

  const entriesBytes = concatBytes(localChunks);
  const centralDirBytes = concatBytes(cdChunks);

  const eocdBytes = new Uint8Array(22);
  const edv = new DataView(eocdBytes.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(4, 0, true);
  edv.setUint16(6, 0, true);
  edv.setUint16(8, entries.length, true);
  edv.setUint16(10, entries.length, true);
  edv.setUint32(12, centralDirBytes.length, true);
  edv.setUint32(16, entriesBytes.length, true);
  edv.setUint16(20, 0, true);

  return { entriesBytes, centralDirBytes, eocdBytes, alignedStoreCount };
}

/**
 * Computes AOSP APK Signature Scheme v2 1MB-chunked SHA-256 Merkle-like digest.
 */
function computeApkV2Digest(sections: Uint8Array[]): Uint8Array {
  const CHUNK_SIZE = 1024 * 1024; // 1 MB
  const chunkDigests: Uint8Array[] = [];

  for (const section of sections) {
    let pos = 0;
    if (section.length === 0) {
      const buf = new Uint8Array(5);
      buf[0] = 0xa5;
      chunkDigests.push(sha256Bytes(buf));
    } else {
      while (pos < section.length) {
        const end = Math.min(pos + CHUNK_SIZE, section.length);
        const slice = section.subarray(pos, end);
        const chunkBuf = new Uint8Array(5 + slice.length);
        chunkBuf[0] = 0xa5;
        new DataView(chunkBuf.buffer).setUint32(1, slice.length, true);
        chunkBuf.set(slice, 5);
        chunkDigests.push(sha256Bytes(chunkBuf));
        pos = end;
      }
    }
  }

  const rootInput = new Uint8Array(5 + chunkDigests.length * 32);
  rootInput[0] = 0x5a;
  new DataView(rootInput.buffer).setUint32(1, chunkDigests.length, true);
  for (let i = 0; i < chunkDigests.length; i++) {
    rootInput.set(chunkDigests[i], 5 + i * 32);
  }
  return sha256Bytes(rootInput);
}

/**
 * Builds the APK Signature Scheme v2 Signing Block (`APK Sig Block 42`).
 */
function buildApkV2SigningBlock(
  parts: ZipParts,
  creds: SigningCredentials,
): Uint8Array {
  // Compute v2 digest over [ZIP entries, Central Directory, EOCD (with original CD offset)]
  const topDigest = computeApkV2Digest([
    parts.entriesBytes,
    parts.centralDirBytes,
    parts.eocdBytes,
  ]);

  const cert = forge.pki.certificateFromPem(creds.certPem);
  const key = forge.pki.privateKeyFromPem(creds.keyPem);

  const certDer = binToBytes(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
  const pubKeyDer = binToBytes(forge.asn1.toDer(forge.pki.publicKeyToAsn1(cert.publicKey)).getBytes());

  // Signature Algorithm ID 0x0103 = RSASSA-PKCS1-v1_5 with SHA-256
  const ALG_RSA_PKCS1_SHA256 = 0x0103;

  const digestEntry = concatBytes([
    u32le(4 + 4 + topDigest.length),
    u32le(ALG_RSA_PKCS1_SHA256),
    u32le(topDigest.length),
    topDigest,
  ]);
  const digestsList = digestEntry;

  const certEntry = concatBytes([u32le(certDer.length), certDer]);
  const certsList = certEntry;

  const additionalAttrs = new Uint8Array(0);

  const signedData = concatBytes([
    u32le(digestsList.length),
    digestsList,
    u32le(certsList.length),
    certsList,
    u32le(additionalAttrs.length),
    additionalAttrs,
  ]);

  // Sign signedData using RSA PKCS#1 v1.5 + SHA-256
  const md = forge.md.sha256.create();
  md.update(bytesToBin(signedData));
  const signatureBytes = binToBytes(key.sign(md));

  const sigEntry = concatBytes([
    u32le(4 + 4 + signatureBytes.length),
    u32le(ALG_RSA_PKCS1_SHA256),
    u32le(signatureBytes.length),
    signatureBytes,
  ]);
  const signaturesList = sigEntry;

  const signerContent = concatBytes([
    u32le(signedData.length),
    signedData,
    u32le(signaturesList.length),
    signaturesList,
    u32le(pubKeyDer.length),
    pubKeyDer,
  ]);

  const signersList = concatBytes([u32le(signerContent.length), signerContent]);
  const v2BlockValue = concatBytes([u32le(signersList.length), signersList]);

  // ID-value pair: uint64 len (= 4 + v2BlockValue.length), uint32 ID (0x7109871a), value
  const v2Pair = concatBytes([
    u64le(4 + v2BlockValue.length),
    u32le(0x7109871a),
    v2BlockValue,
  ]);

  const magic = textEncoder.encode('APK Sig Block 42');
  // Size of block (excluding the leading 8-byte size field) = pairs + trailing 8-byte size + 16-byte magic
  const blockSizeExclFirst = v2Pair.length + 8 + magic.length;

  return concatBytes([
    u64le(blockSizeExclFirst),
    v2Pair,
    u64le(blockSizeExclFirst),
    magic,
  ]);
}

export interface SignedApkOutput {
  apkBytes: Uint8Array;
  alignedStoreEntries: number;
}

/**
 * Produces a 4-byte zipaligned, dual-signed (v1 JAR + v2 APK Signature Scheme) Android APK.
 */
export async function packageZipAlignAndSignApk(
  rawEntries: ApkZipEntry[],
  creds: SigningCredentials,
): Promise<SignedApkOutput> {
  // Deterministic entry ordering: AndroidManifest.xml first, resources.arsc & icon stored uncompressed
  const baseEntries = rawEntries.filter((e) => !e.name.startsWith('META-INF/'));
  const v1Meta = createV1SignatureFiles(baseEntries, creds);
  const allEntries = [...baseEntries, ...v1Meta];

  const parts = await buildAlignedZipParts(allEntries);
  const signingBlock = buildApkV2SigningBlock(parts, creds);

  // Update EOCD central directory offset to account for inserted APK Signing Block
  const updatedEocd = new Uint8Array(parts.eocdBytes);
  new DataView(updatedEocd.buffer).setUint32(
    16,
    parts.entriesBytes.length + signingBlock.length,
    true,
  );

  const apkBytes = concatBytes([
    parts.entriesBytes,
    signingBlock,
    parts.centralDirBytes,
    updatedEocd,
  ]);

  return {
    apkBytes,
    alignedStoreEntries: parts.alignedStoreCount,
  };
}

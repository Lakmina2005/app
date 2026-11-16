const textEncoder = new TextEncoder();
const textDecoderUtf8 = new TextDecoder('utf-8');

export interface ManifestPatchOptions {
  appName: string;
  packageName: string;
  versionName: string;
  versionCode: number;
  targetSdkVersion: number;
  minSdkVersion?: number;
}

/**
 * Validates an Android applicationId / package name.
 */
export function isValidPackageName(pkg: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(pkg) && pkg.length <= 120;
}

/**
 * Generates a deterministic, valid Android package name from an arbitrary app title.
 */
export function derivePackageName(appName: string): string {
  let h = 5381;
  for (const c of appName) {
    h = (((h << 5) + h) + (c.codePointAt(0) ?? 0)) >>> 0;
  }
  const slug = appName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 14);
  const suffix = slug && /^[a-z]/.test(slug) ? `${slug}_${h.toString(16).padStart(8, '0')}` : `a${h.toString(16).padStart(8, '0')}`;
  return `com.htmlapp.${suffix}`;
}

/**
 * Patches binary AndroidManifest.xml (AXML):
 * - Updates string pool entries for manifest.package, manifest.versionName, application.label
 * - Updates integer attributes manifest.versionCode and uses-sdk.targetSdkVersion
 */
export function patchAndroidManifest(bytes: Uint8Array, opts: ManifestPatchOptions): Uint8Array {
  const work = new Uint8Array(bytes);
  const dv = new DataView(work.buffer, work.byteOffset, work.byteLength);

  const P = 8; // After ResXMLTree_header (8 bytes)
  if (dv.getUint16(P, true) !== 0x0001) {
    throw new Error('Invalid AndroidManifest.xml: missing string pool chunk');
  }

  const hdr = dv.getUint16(P + 2, true);
  const size = dv.getUint32(P + 4, true);
  const count = dv.getUint32(P + 8, true);
  const styleCount = dv.getUint32(P + 12, true);
  const flags = dv.getUint32(P + 16, true);
  const strStart = dv.getUint32(P + 20, true);
  const isUtf8 = (flags & 0x100) !== 0;

  const strings: string[] = [];
  for (let i = 0; i < count; i++) {
    const off = P + strStart + dv.getUint32(P + hdr + 4 * i, true);
    if (isUtf8) {
      let p = off;
      let l = work[p++];
      if (l & 0x80) l = ((l & 0x7f) << 8) | work[p++];
      let bl = work[p++];
      if (bl & 0x80) bl = ((bl & 0x7f) << 8) | work[p++];
      strings.push(textDecoderUtf8.decode(work.subarray(p, p + bl)));
    } else {
      let l = dv.getUint16(off, true);
      let p = off + 2;
      if (l & 0x8000) {
        l = ((l & 0x7fff) << 16) | dv.getUint16(p, true);
        p += 2;
      }
      let s = '';
      for (let k = 0; k < l; k++) {
        s += String.fromCharCode(dv.getUint16(p + 2 * k, true));
      }
      strings.push(s);
    }
  }

  // Walk XML chunks after string pool to locate exact string indices & int attributes
  const indexReplacements = new Map<number, string>();
  let pos = P + size;
  while (pos + 8 <= work.length) {
    const ctype = dv.getUint16(pos, true);
    const csize = dv.getUint32(pos + 4, true);
    if (csize < 8) break;

    if (ctype === 0x0102) {
      // RES_XML_START_ELEMENT_TYPE
      const tagIdx = dv.getUint32(pos + 20, true);
      const tagName = strings[tagIdx] ?? '';
      const attrStart = dv.getUint16(pos + 24, true);
      const attrSize = dv.getUint16(pos + 26, true);
      const attrCount = dv.getUint16(pos + 28, true);

      for (let a = 0; a < attrCount; a++) {
        const ap = pos + 16 + attrStart + a * attrSize;
        const anameIdx = dv.getUint32(ap + 4, true);
        const arawIdx = dv.getUint32(ap + 8, true);
        const atype = work[ap + 15];
        const adata = dv.getUint32(ap + 16, true);
        const attrName = strings[anameIdx] ?? '';

        if (tagName === 'manifest') {
          if (attrName === 'package' && atype === 3) {
            indexReplacements.set(adata, opts.packageName);
            if (arawIdx !== 0xffffffff && arawIdx !== adata) {
              indexReplacements.set(arawIdx, opts.packageName);
            }
          } else if (attrName === 'versionName' && atype === 3) {
            indexReplacements.set(adata, opts.versionName);
            if (arawIdx !== 0xffffffff && arawIdx !== adata) {
              indexReplacements.set(arawIdx, opts.versionName);
            }
          } else if (attrName === 'versionCode' && atype === 16) {
            dv.setUint32(ap + 16, Math.max(1, Math.floor(opts.versionCode)) >>> 0, true);
          }
        } else if (tagName === 'application') {
          if (attrName === 'label' && atype === 3) {
            indexReplacements.set(adata, opts.appName);
            if (arawIdx !== 0xffffffff && arawIdx !== adata) {
              indexReplacements.set(arawIdx, opts.appName);
            }
          }
        } else if (tagName === 'uses-sdk') {
          if (attrName === 'targetSdkVersion' && atype === 16) {
            dv.setUint32(ap + 16, opts.targetSdkVersion >>> 0, true);
          } else if (attrName === 'minSdkVersion' && atype === 16 && opts.minSdkVersion !== undefined) {
            dv.setUint32(ap + 16, opts.minSdkVersion >>> 0, true);
          }
        }
      }
    }

    pos += csize;
  }

  // Fallback by literal string match if XML walk missed any
  const outStrings = strings.map((s, idx) => {
    if (indexReplacements.has(idx)) return indexReplacements.get(idx)!;
    if (s === 'My Gallery') return opts.appName;
    if (s === 'com.htmlapp.gallery') return opts.packageName;
    return s;
  });

  // Re-encode string pool preserving pool encoding flag
  const chunks: Uint8Array[] = [];
  const offs: number[] = [];
  let total = 0;

  for (const s of outStrings) {
    offs.push(total);
    let b: Uint8Array;
    if (isUtf8) {
      const u = textEncoder.encode(s);
      const lenCp = [...s].length;
      const enc = (n: number) => (n > 0x7f ? [(n >> 8) | 0x80, n & 255] : [n]);
      b = Uint8Array.from([...enc(lenCp), ...enc(u.length), ...u, 0]);
    } else {
      const n = s.length;
      const headerLen = n > 0x7fff ? 4 : 2;
      b = new Uint8Array(headerLen + n * 2 + 2);
      const d = new DataView(b.buffer);
      if (n > 0x7fff) {
        d.setUint16(0, ((n >> 16) & 0x7fff) | 0x8000, true);
        d.setUint16(2, n & 0xffff, true);
      } else {
        d.setUint16(0, n, true);
      }
      for (let k = 0; k < n; k++) {
        d.setUint16(headerLen + 2 * k, s.charCodeAt(k), true);
      }
    }
    chunks.push(b);
    total += b.length;
  }

  while (total % 4 !== 0) {
    chunks.push(new Uint8Array(1));
    total++;
  }

  const newStrStart = hdr + 4 * count + 4 * styleCount;
  const newSize = newStrStart + total;
  const pool = new Uint8Array(newSize);
  const pd = new DataView(pool.buffer);
  pool.set(work.subarray(P, P + hdr));
  pd.setUint32(4, newSize, true);
  pd.setUint32(20, newStrStart, true);
  pd.setUint32(24, 0, true);
  for (let i = 0; i < count; i++) {
    pd.setUint32(hdr + 4 * i, offs[i], true);
  }
  let w = newStrStart;
  for (const c of chunks) {
    pool.set(c, w);
    w += c.length;
  }

  const rest = work.subarray(P + size);
  const res = new Uint8Array(P + newSize + rest.length);
  res.set(work.subarray(0, P));
  res.set(pool, P);
  res.set(rest, P + newSize);
  new DataView(res.buffer).setUint32(4, res.length, true);
  return res;
}

/**
 * Patches ResTable_package.name inside binary resources.arsc so it matches AndroidManifest.xml's package.
 */
export function patchResourcesArsc(arscBytes: Uint8Array, packageName: string): Uint8Array {
  const out = new Uint8Array(arscBytes);
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);

  if (out.length < 12 || dv.getUint16(0, true) !== 0x0002) {
    return out;
  }

  const headerSize = dv.getUint16(2, true);
  let pos = headerSize;
  while (pos + 8 <= out.length) {
    const ctype = dv.getUint16(pos, true);
    const csize = dv.getUint32(pos + 4, true);
    if (csize < 8) break;

    if (ctype === 0x0200 && pos + 268 <= out.length) {
      // RES_TABLE_PACKAGE_TYPE: 8-byte header + 4-byte id + 256-byte char16_t[128] name
      const nameOffset = pos + 12;
      out.fill(0, nameOffset, nameOffset + 256);
      const truncated = packageName.slice(0, 127);
      for (let i = 0; i < truncated.length; i++) {
        dv.setUint16(nameOffset + i * 2, truncated.charCodeAt(i), true);
      }
      break;
    }
    pos += csize;
  }

  return out;
}

import JSZip from 'jszip';
import forge from 'node-forge';
import {
  derivePackageName,
  isValidPackageName,
  patchAndroidManifest,
  patchResourcesArsc,
} from './manifestPatcher';
import { DEFAULT_CERT_PEM, DEFAULT_KEY_PEM, TEMPLATE_B64 } from './templateData';
import {
  ApkZipEntry,
  packageZipAlignAndSignApk,
  SigningCredentials,
} from './zipAlignAndSign';

const textEncoder = new TextEncoder();

const STORE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'mp3',
  'mp4',
  'ogg',
  'wav',
  'webm',
  'aac',
  'm4a',
  'woff2',
]);

function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    u[i] = s.charCodeAt(i);
  }
  return u;
}

function sanitizeAssetPath(rawPath: string): string {
  const normalized = rawPath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((seg) => seg !== '' && seg !== '.' && seg !== '..')
    .join('/');
  return normalized;
}

export function normalizeWebsiteUrl(rawUrl: string): string {
  let v = rawUrl.trim();
  if (!v) throw new Error('Please enter a website URL.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) {
    v = `https://${v}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    throw new Error('The website URL format is invalid.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http:// or https:// website URLs are supported.');
  }
  return parsed.href;
}

export function createWebsiteWrapperHtml(url: string, appName: string): string {
  const safeJsonUrl = JSON.stringify(url).replace(/</g, '\\u003c');
  const safeTitle = appName.replace(/[<>&"]/g, '');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${safeTitle || 'Loading'}</title>
<style>
  html,body{height:100%;margin:0;background:#0b0f17;color:#f1f5f9;font-family:system-ui,-apple-system,sans-serif}
  body{display:flex;align-items:center;justify-content:center;text-align:center;padding:24px}
  .box{max-width:320px}
  .spinner{width:34px;height:34px;border:3px solid rgba(255,255,255,.15);border-top-color:#10b981;border-radius:50%;margin:0 auto 14px;animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  p{margin:0;font-size:15px;color:#cbd5e1;line-height:1.5}
  button{margin-top:16px;padding:12px 24px;font-size:15px;font-weight:600;border:0;border-radius:10px;background:#10b981;color:#fff;cursor:pointer}
</style>
</head>
<body>
<div class="box" id="m"><div class="spinner"></div><p>Opening ${safeTitle || 'app'}...</p></div>
<script>
var U=${safeJsonUrl};
function go(){
  if(navigator.onLine===false){
    document.getElementById("m").innerHTML='<p>No internet connection. Please connect and try again.</p><button onclick="go()">Retry</button>';
    return;
  }
  location.replace(U);
}
go();
${'</' + 'script>'}
</body>
</html>`;
}

export interface UploadedInputFile {
  name: string;
  bytes: Uint8Array;
}

export async function collectAssetMap(params: {
  mode: 'code' | 'files' | 'url';
  htmlCode: string;
  files: UploadedInputFile[];
  websiteUrl: string;
  appName: string;
  fullscreen: boolean;
}): Promise<Map<string, Uint8Array>> {
  const assetMap = new Map<string, Uint8Array>();

  if (params.mode === 'url') {
    const validUrl = normalizeWebsiteUrl(params.websiteUrl);
    assetMap.set('index.html', textEncoder.encode(createWebsiteWrapperHtml(validUrl, params.appName)));
  } else if (params.mode === 'code') {
    const trimmed = params.htmlCode.trim();
    if (!trimmed) {
      throw new Error('Please paste HTML code or switch to Files / ZIP or Website URL mode.');
    }
    assetMap.set('index.html', textEncoder.encode(trimmed));
  } else {
    // Files / ZIP mode
    for (const file of params.files) {
      if (/\.zip$/i.test(file.name)) {
        const z = await JSZip.loadAsync(file.bytes);
        const names = Object.keys(z.files).filter(
          (n) =>
            !z.files[n].dir &&
            !n.startsWith('__MACOSX/') &&
            !n.split('/').pop()?.startsWith('._'),
        );
        const depth = (n: string) => n.split('/').length;
        let idx = names
          .filter((n) => /(^|\/)index\.html?$/i.test(n))
          .sort((a, b) => depth(a) - depth(b))[0];
        if (!idx) {
          idx = names
            .filter((n) => /\.html?$/i.test(n))
            .sort((a, b) => depth(a) - depth(b))[0];
        }
        const prefix = idx ? idx.slice(0, idx.length - (idx.split('/').pop()?.length ?? 0)) : '';
        for (const n of names) {
          if (n.startsWith(prefix)) {
            const rel = sanitizeAssetPath(n.slice(prefix.length));
            if (rel) {
              assetMap.set(rel, await z.file(n)!.async('uint8array'));
            }
          }
        }
      } else {
        const rel = sanitizeAssetPath(file.name);
        if (rel) {
          assetMap.set(rel, file.bytes);
        }
      }
    }

    // Optional inline HTML override if provided alongside files
    if (params.htmlCode.trim() && !assetMap.has('index.html')) {
      assetMap.set('index.html', textEncoder.encode(params.htmlCode.trim()));
    }

    if (assetMap.size === 0) {
      throw new Error('Please add HTML, CSS, JS, image, or ZIP files.');
    }

    if (!assetMap.has('index.html')) {
      const indexKey = [...assetMap.keys()].find((k) => /^index\.html?$/i.test(k));
      if (indexKey) {
        assetMap.set('index.html', assetMap.get(indexKey)!);
      } else {
        const anyHtml = [...assetMap.keys()]
          .filter((k) => /\.html?$/i.test(k))
          .sort((a, b) => a.split('/').length - b.split('/').length)[0];
        if (!anyHtml) {
          throw new Error('No HTML entry file found. Please include index.html.');
        }
        assetMap.set(
          'index.html',
          textEncoder.encode(`<!DOCTYPE html><meta http-equiv="refresh" content="0;url=${encodeURI(anyHtml)}">`),
        );
      }
    }
  }

  if (params.fullscreen) {
    assetMap.set('__fullscreen__', textEncoder.encode('1'));
  }

  return assetMap;
}

export function generatePersonalSigningKeypair(): SigningCredentials {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(15));
  cert.validity.notBefore = new Date('2020-01-01T00:00:00Z');
  cert.validity.notAfter = new Date('2055-01-01T00:00:00Z');
  const attrs = [{ name: 'commonName', value: 'HTML2APK Personal Key' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true },
    { name: 'subjectKeyIdentifier' },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
    certPem: forge.pki.certificateToPem(cert),
  };
}

export interface BuildApkOptions {
  mode: 'code' | 'files' | 'url';
  htmlCode: string;
  files: UploadedInputFile[];
  websiteUrl: string;
  appName: string;
  packageName?: string;
  versionName?: string;
  versionCode?: number;
  targetSdkVersion?: number;
  fullscreen: boolean;
  iconPng: Uint8Array;
  signingCreds?: SigningCredentials;
}

export interface BuildApkResult {
  apkBytes: Uint8Array;
  fileName: string;
  appName: string;
  packageName: string;
  versionName: string;
  versionCode: number;
  targetSdkVersion: number;
  assetCount: number;
  alignedStoreEntries: number;
  signatureScheme: string;
}

export async function buildSignedApk(opts: BuildApkOptions): Promise<BuildApkResult> {
  const appName = opts.appName.trim() || 'My App';
  const packageName = (opts.packageName?.trim() || derivePackageName(appName)).toLowerCase();
  if (!isValidPackageName(packageName)) {
    throw new Error(
      'Package ID must have at least two dot-separated segments starting with letters (e.g. com.myapp.demo).',
    );
  }

  const versionName = opts.versionName?.trim() || '1.0.0';
  const versionCode = Math.max(1, Math.floor(opts.versionCode ?? 1));
  const targetSdkVersion = opts.targetSdkVersion ?? 33;

  const assets = await collectAssetMap({
    mode: opts.mode,
    htmlCode: opts.htmlCode,
    files: opts.files,
    websiteUrl: opts.websiteUrl,
    appName,
    fullscreen: opts.fullscreen,
  });

  const baseZip = await JSZip.loadAsync(b64ToBytes(TEMPLATE_B64));
  const rawManifest = await baseZip.file('AndroidManifest.xml')!.async('uint8array');
  const rawArsc = await baseZip.file('resources.arsc')!.async('uint8array');
  const classesDex = await baseZip.file('classes.dex')!.async('uint8array');

  const patchedManifest = patchAndroidManifest(rawManifest, {
    appName,
    packageName,
    versionName,
    versionCode,
    targetSdkVersion,
    minSdkVersion: 21,
  });
  const patchedArsc = patchResourcesArsc(rawArsc, packageName);

  const entries: ApkZipEntry[] = [
    { name: 'AndroidManifest.xml', data: patchedManifest, store: false },
    { name: 'classes.dex', data: classesDex, store: false },
    { name: 'resources.arsc', data: patchedArsc, store: true },
    { name: 'res/mipmap-xxxhdpi-v4/ic_launcher.png', data: opts.iconPng, store: true },
  ];

  for (const [relPath, bytes] of assets.entries()) {
    const ext = relPath.split('.').pop()?.toLowerCase() ?? '';
    entries.push({
      name: `assets/${relPath}`,
      data: bytes,
      store: STORE_EXTENSIONS.has(ext),
    });
  }

  const creds = opts.signingCreds ?? {
    keyPem: DEFAULT_KEY_PEM,
    certPem: DEFAULT_CERT_PEM,
  };

  const { apkBytes, alignedStoreEntries } = await packageZipAlignAndSignApk(entries, creds);

  const slug = appName.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'app';
  const fileName = `${slug}_v${versionName.replace(/[^\w.-]+/g, '_')}.apk`;

  return {
    apkBytes,
    fileName,
    appName,
    packageName,
    versionName,
    versionCode,
    targetSdkVersion,
    assetCount: assets.size,
    alignedStoreEntries,
    signatureScheme: 'v1 JAR + v2 APK Signature Scheme (SHA-256)',
  };
}

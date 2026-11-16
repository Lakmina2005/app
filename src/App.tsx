import {
  AlertCircle,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  FileArchive,
  FileCode2,
  FolderUp,
  Globe,
  KeyRound,
  Languages,
  Loader2,
  Moon,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildSignedApk,
  BuildApkResult,
  generatePersonalSigningKeypair,
  normalizeWebsiteUrl,
  UploadedInputFile,
} from './apk/apkBuilder';
import { derivePackageName, isValidPackageName } from './apk/manifestPatcher';
import { SigningCredentials } from './apk/zipAlignAndSign';
import { IconStudio } from './components/IconStudio';
import { PhonePreview } from './components/PhonePreview';
import { COPY, Lang } from './utils/i18n';
import { SAMPLE_IMAGE_GALLERY_HTML, SAMPLE_NOTES_HTML } from './utils/presets';

const STORAGE_THEME_KEY = 'html2apk_theme_v1';
const STORAGE_LANG_KEY = 'html2apk_lang_v1';
const STORAGE_PERSONAL_KEY = 'html2apk_personal_key_v1';

export default function App() {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_LANG_KEY);
      return saved === 'si' ? 'si' : 'en';
    } catch {
      return 'en';
    }
  });

  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_THEME_KEY);
      return saved ? saved === 'dark' : true;
    } catch {
      return true;
    }
  });

  const copy = COPY[lang];

  // Step 1: Identity & Icon
  const [appName, setAppName] = useState('My App');
  const [customPackageName, setCustomPackageName] = useState('');
  const [packageAuto, setPackageAuto] = useState(true);
  const [versionName, setVersionName] = useState('1.0.0');
  const [versionCode, setVersionCode] = useState(1);
  const [targetSdkVersion, setTargetSdkVersion] = useState(33);

  const [iconDataUrl, setIconDataUrl] = useState('');
  const [iconBytes, setIconBytes] = useState<Uint8Array | null>(null);
  const [isCustomIcon, setIsCustomIcon] = useState(false);

  // Step 2: Content Source
  const [mode, setMode] = useState<'code' | 'files' | 'url'>('code');
  const [htmlCode, setHtmlCode] = useState(SAMPLE_IMAGE_GALLERY_HTML);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedInputFile[]>([]);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Step 3: Display & Signing
  const [fullscreen, setFullscreen] = useState(false);
  const [signingMode, setSigningMode] = useState<'default' | 'personal'>('default');
  const [personalKey, setPersonalKey] = useState<SigningCredentials | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_PERSONAL_KEY);
      return raw ? (JSON.parse(raw) as SigningCredentials) : null;
    } catch {
      return null;
    }
  });

  // Build state
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [buildResult, setBuildResult] = useState<BuildApkResult | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [singleHtmlText, setSingleHtmlText] = useState<string | null>(null);
  const [singleHtmlLoading, setSingleHtmlLoading] = useState(false);
  const [showHtmlModal, setShowHtmlModal] = useState(false);
  const downloadAnchorRef = useRef<HTMLAnchorElement | null>(null);
  const filePickerRef = useRef<HTMLInputElement | null>(null);
  const htmlTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isStandaloneFile =
    typeof window !== 'undefined' &&
    (window.location.protocol === 'file:' ||
      window.location.protocol === 'content:' ||
      window.location.pathname.endsWith('html-to-apk-studio.html'));

  const effectivePackageName = packageAuto
    ? derivePackageName(appName.trim() || 'My App')
    : customPackageName.trim();

  const packageValid = isValidPackageName(effectivePackageName);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', isDark ? '#0b0f17' : '#f8fafc');
    }
    try {
      localStorage.setItem(STORAGE_THEME_KEY, isDark ? 'dark' : 'light');
    } catch {
      // Ignore storage errors
    }
  }, [isDark]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_LANG_KEY, lang);
    } catch {
      // Ignore storage errors
    }
  }, [lang]);

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  useEffect(() => {
    if (isStandaloneFile) return;
    let cancelled = false;
    setSingleHtmlLoading(true);
    fetch('/html-to-apk-studio.html')
      .then((resp) => (resp.ok ? resp.text() : Promise.reject(new Error('Not found'))))
      .then((text) => {
        if (!cancelled) setSingleHtmlText(text);
      })
      .catch(() => {
        // Fallback handled on demand
      })
      .finally(() => {
        if (!cancelled) setSingleHtmlLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isStandaloneFile]);

  const handleIconChange = useCallback(
    (dataUrl: string, pngBytes: Uint8Array, isCustom: boolean) => {
      setIconDataUrl(dataUrl);
      setIconBytes(pngBytes);
      setIsCustomIcon(isCustom);
    },
    [],
  );

  async function ingestFileList(list: FileList | File[]) {
    const incoming: UploadedInputFile[] = [];
    for (const f of Array.from(list)) {
      const buf = new Uint8Array(await f.arrayBuffer());
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      incoming.push({ name: rel, bytes: buf });
    }
    if (incoming.length === 0) return;

    setUploadedFiles((prev) => {
      const merged = [...prev];
      for (const item of incoming) {
        const idx = merged.findIndex((x) => x.name === item.name);
        if (idx >= 0) merged[idx] = item;
        else merged.push(item);
      }
      return merged;
    });

    const firstHtml = incoming.find((f) => /\.html?$/i.test(f.name));
    if (firstHtml && appName === 'My App') {
      const base = firstHtml.name.split('/').pop()?.replace(/\.html?$/i, '') ?? '';
      if (base && base.toLowerCase() !== 'index') {
        setAppName(base);
      }
    }
    setBuildError(null);
  }

  async function loadAssetPreset(preset: 'gallery' | 'notes' | 'lavender' | 'calc') {
    setMode('code');
    setBuildError(null);
    if (preset === 'gallery') {
      setHtmlCode(SAMPLE_IMAGE_GALLERY_HTML);
      if (appName === 'My App') setAppName('Pocket Gallery');
      return;
    }
    if (preset === 'notes') {
      setHtmlCode(SAMPLE_NOTES_HTML);
      if (appName === 'My App' || appName === 'Pocket Gallery') setAppName('Quick Notes');
      return;
    }
    try {
      const path =
        preset === 'lavender'
          ? '/assets/aistudio/Gallery_032da28e.html'
          : '/assets/aistudio/index_cd09e3be.html';
      const resp = await fetch(path);
      if (!resp.ok) throw new Error('Preset not found');
      const text = await resp.text();
      setHtmlCode(text);
      setAppName(preset === 'lavender' ? 'Lavender Gallery' : '3D Calculator');
    } catch {
      setBuildError('Could not load preset file.');
    }
  }

  function handleUrlBlur() {
    if (!websiteUrl.trim()) return;
    try {
      const normalized = normalizeWebsiteUrl(websiteUrl);
      setWebsiteUrl(normalized);
      if (appName === 'My App') {
        const host = new URL(normalized).hostname.replace(/^www\./, '');
        if (host) setAppName(host);
      }
    } catch {
      // Keep user's input for editing; validation catches on build
    }
  }

  function handleGeneratePersonalKey() {
    const creds = generatePersonalSigningKeypair();
    setPersonalKey(creds);
    setSigningMode('personal');
    try {
      localStorage.setItem(STORAGE_PERSONAL_KEY, JSON.stringify(creds));
    } catch {
      // Ignore storage quota issues
    }
  }

  function handleDownloadPersonalKey() {
    if (!personalKey) return;
    const bundle = `${personalKey.certPem}\n${personalKey.keyPem}`;
    const blob = new Blob([bundle], { type: 'application/x-pem-file' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'html2apk-personal-signing-key.pem';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function handleResetWorkspace() {
    setAppName('My App');
    setCustomPackageName('');
    setPackageAuto(true);
    setVersionName('1.0.0');
    setVersionCode(1);
    setTargetSdkVersion(33);
    setIsCustomIcon(false);
    setMode('code');
    setHtmlCode(SAMPLE_IMAGE_GALLERY_HTML);
    setUploadedFiles([]);
    setWebsiteUrl('');
    setFullscreen(false);
    setBuildError(null);
    setBuildResult(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
  }

  function copyTextSynchronously(text: string): boolean {
    let copied = false;
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      copied = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch {
      copied = false;
    }

    if (!copied && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      void navigator.clipboard.writeText(text).catch(() => {});
      copied = true;
    }
    return copied;
  }

  async function ensureSingleHtmlLoaded(): Promise<string> {
    if (singleHtmlText) return singleHtmlText;
    setSingleHtmlLoading(true);
    try {
      const resp = await fetch('/html-to-apk-studio.html');
      if (!resp.ok) throw new Error('HTML bundle not found');
      const text = await resp.text();
      setSingleHtmlText(text);
      return text;
    } finally {
      setSingleHtmlLoading(false);
    }
  }

  async function handleCopySingleHtml() {
    try {
      const htmlText = singleHtmlText ?? (await ensureSingleHtmlLoaded());
      const ok = copyTextSynchronously(htmlText);
      if (!ok) {
        setShowHtmlModal(true);
        return;
      }
      setCopiedHtml(true);
      setTimeout(() => setCopiedHtml(false), 2400);
    } catch {
      setBuildError('Could not copy HTML code. Use View HTML Code or Download Single HTML.');
    }
  }

  async function handleOpenHtmlModal() {
    setShowHtmlModal(true);
    if (!singleHtmlText) {
      try {
        await ensureSingleHtmlLoaded();
      } catch {
        // Error handled inside modal
      }
    }
  }

  async function handleDownloadSingleHtmlFile() {
    try {
      const htmlText = singleHtmlText ?? (await ensureSingleHtmlLoaded());
      const blob = new Blob([htmlText], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'HTML-to-APK-Studio.html';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch {
      setBuildError('Could not download HTML file.');
    }
  }

  async function handleBuildApk() {
    setBuildError(null);
    setBuildResult(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }

    if (!packageValid) {
      setBuildError(
        'Package ID must have at least two dot-separated segments starting with letters (e.g. com.myapp.demo).',
      );
      return;
    }

    if (!iconBytes) {
      setBuildError('App icon is still preparing. Please try again in a moment.');
      return;
    }

    setIsBuilding(true);
    try {
      // Yield a frame so the loading state renders smoothly
      await new Promise((r) => setTimeout(r, 20));

      const creds = signingMode === 'personal' && personalKey ? personalKey : undefined;

      const result = await buildSignedApk({
        mode,
        htmlCode,
        files: uploadedFiles,
        websiteUrl,
        appName,
        packageName: effectivePackageName,
        versionName,
        versionCode,
        targetSdkVersion,
        fullscreen,
        iconPng: iconBytes,
        signingCreds: creds,
      });

      const blobBytes = new Uint8Array(result.apkBytes);
      const blob = new Blob([blobBytes], {
        type: 'application/vnd.android.package-archive',
      });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setBuildResult(result);

      setTimeout(() => {
        downloadAnchorRef.current?.click();
      }, 60);
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : 'Failed to package APK.');
    } finally {
      setIsBuilding(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-slate-50 text-slate-900 dark:bg-[#0b0f17] dark:text-slate-100 transition-colors duration-150">
      {/* 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800/90 bg-white/95 dark:bg-[#0b0f17]/95 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element Brand Wordmark */}
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            {copy.brand}
          </a>

          {/* Zone 2: Clean Single-Line Nav Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a
              href="#identity"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              {copy.navIdentity}
            </a>
            <a
              href="#source"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              {copy.navSource}
            </a>
            <a
              href="#signing"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              {copy.navSigning}
            </a>
            <a
              href="#guide"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              {copy.navGuide}
            </a>
          </nav>

          {/* Zone 3: Primary CTA */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleBuildApk}
              disabled={isBuilding}
              className="min-h-[40px] px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isBuilding ? copy.buildingBtn : copy.navBuildCta}
            </button>
          </div>
        </div>
      </header>

      {/* Main Studio Workspace */}
      <main id="top" className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Hero + Workspace Toolbar */}
        <section className="mb-8 flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-2xl">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white [text-wrap:balance]">
              {copy.heroTitle}
            </h1>
            <p className="mt-2 text-sm sm:text-[15px] text-slate-600 dark:text-slate-400 leading-relaxed">
              {copy.heroSubtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800/90">
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 ${
                  lang === 'en'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Languages className="w-3.5 h-3.5" />
                <span>English</span>
              </button>
              <button
                type="button"
                onClick={() => setLang('si')}
                className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  lang === 'si'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                සිංහල / Singlish
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsDark((d) => !d)}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="min-h-[40px] min-w-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 inline-flex items-center justify-center transition-colors cursor-pointer"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={handleResetWorkspace}
              className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{copy.resetBtn}</span>
            </button>

            {!isStandaloneFile && (
              <>
                <button
                  type="button"
                  onClick={handleOpenHtmlModal}
                  className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FileCode2 className="w-3.5 h-3.5" />
                  <span>{copy.viewHtmlCode}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopySingleHtml}
                  className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedHtml ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedHtml ? copy.copiedHtml : copy.copyHtmlCode}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSingleHtmlFile}
                  className="min-h-[40px] px-3 py-2 rounded-lg border border-emerald-600/30 dark:border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{copy.downloadSingleHtml}</span>
                </button>
              </>
            )}
          </div>
        </section>

        {/* Two-Column Builder Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Configuration Column */}
          <div className="lg:col-span-7 space-y-6">
            {/* Section 1: App Identity & Icon */}
            <section
              id="identity"
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 sm:p-6"
            >
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white mb-4">
                {copy.step1Title}
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="app-name"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                  >
                    {copy.appNameLabel}
                  </label>
                  <input
                    id="app-name"
                    type="text"
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    placeholder="My App"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="package-id"
                      className="text-xs font-medium text-slate-600 dark:text-slate-400"
                    >
                      {copy.packageIdLabel}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (packageAuto) {
                          setCustomPackageName(effectivePackageName);
                          setPackageAuto(false);
                        } else {
                          setPackageAuto(true);
                        }
                      }}
                      className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      {packageAuto ? 'Customize' : copy.packageIdAuto}
                    </button>
                  </div>
                  <input
                    id="package-id"
                    type="text"
                    value={effectivePackageName}
                    readOnly={packageAuto}
                    onChange={(e) => {
                      setPackageAuto(false);
                      setCustomPackageName(e.target.value);
                    }}
                    className={`w-full px-3.5 py-2.5 text-sm font-mono-tabular rounded-xl border bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 ${
                      packageValid
                        ? 'border-slate-200 dark:border-slate-700 focus:ring-emerald-500/40'
                        : 'border-rose-500 focus:ring-rose-500/40'
                    } ${packageAuto ? 'opacity-80' : ''}`}
                  />
                </div>

                <div>
                  <label
                    htmlFor="version-name"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                  >
                    {copy.versionNameLabel}
                  </label>
                  <input
                    id="version-name"
                    type="text"
                    value={versionName}
                    onChange={(e) => setVersionName(e.target.value)}
                    placeholder="1.0.0"
                    className="w-full px-3.5 py-2.5 text-sm font-mono-tabular rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="version-code"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                    >
                      {copy.versionCodeLabel}
                    </label>
                    <input
                      id="version-code"
                      type="number"
                      min={1}
                      value={versionCode}
                      onChange={(e) => setVersionCode(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full px-3.5 py-2.5 text-sm font-mono-tabular rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="target-sdk"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                    >
                      {copy.targetSdkLabel}
                    </label>
                    <select
                      id="target-sdk"
                      value={targetSdkVersion}
                      onChange={(e) => setTargetSdkVersion(Number(e.target.value))}
                      className="w-full px-2.5 py-2.5 text-sm font-mono-tabular rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    >
                      <option value={33}>API 33 (A13)</option>
                      <option value={34}>API 34 (A14)</option>
                      <option value={30}>API 30 (A11)</option>
                      <option value={28}>API 28 (A9)</option>
                    </select>
                  </div>
                </div>
              </div>

              <IconStudio
                appName={appName}
                copy={copy}
                iconDataUrl={iconDataUrl}
                isCustomImage={isCustomIcon}
                onIconChange={handleIconChange}
              />
            </section>

            {/* Section 2: App Source */}
            <section
              id="source"
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  {copy.step2Title}
                </h2>

                <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/90">
                  <button
                    type="button"
                    onClick={() => setMode('code')}
                    className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      mode === 'code'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    <span>{copy.tabCode}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('files')}
                    className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      mode === 'files'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <FileArchive className="w-3.5 h-3.5" />
                    <span>{copy.tabFiles}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('url')}
                    className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      mode === 'url'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>{copy.tabUrl}</span>
                  </button>
                </div>
              </div>

              {mode === 'code' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {copy.presetsLabel}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => loadAssetPreset('gallery')}
                        className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                      >
                        {copy.presetGallery}
                      </button>
                      <button
                        type="button"
                        onClick={() => loadAssetPreset('notes')}
                        className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                      >
                        {copy.presetNotes}
                      </button>
                      {!isStandaloneFile && (
                        <>
                          <button
                            type="button"
                            onClick={() => loadAssetPreset('lavender')}
                            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                          >
                            {copy.presetLavender}
                          </button>
                          <button
                            type="button"
                            onClick={() => loadAssetPreset('calc')}
                            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                          >
                            {copy.presetCalc}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <label htmlFor="html-source" className="sr-only">
                    {copy.codeLabel}
                  </label>
                  <textarea
                    id="html-source"
                    value={htmlCode}
                    onChange={(e) => setHtmlCode(e.target.value)}
                    placeholder={copy.codePlaceholder}
                    spellCheck={false}
                    className="w-full min-h-[240px] p-3.5 text-xs sm:text-[13px] font-mono-tabular leading-relaxed rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-y"
                  />
                  <div className="flex items-center justify-between text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                    <span>index.html</span>
                    <span>{(new TextEncoder().encode(htmlCode).length / 1024).toFixed(1)} KB</span>
                  </div>
                </div>
              )}

              {mode === 'files' && (
                <div className="space-y-4">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      if (e.dataTransfer.files?.length) {
                        void ingestFileList(e.dataTransfer.files);
                      }
                    }}
                    className={`rounded-xl border border-dashed p-6 text-center transition-colors ${
                      isDragging
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/70'
                    }`}
                  >
                    <FolderUp className="w-7 h-7 mx-auto mb-2 text-slate-400 dark:text-slate-500" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                      {copy.dropHint}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                      {copy.filesNote}
                    </p>
                    <button
                      type="button"
                      onClick={() => filePickerRef.current?.click()}
                      className="min-h-[42px] px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white transition-colors cursor-pointer"
                    >
                      {copy.selectFilesBtn}
                    </button>
                    <input
                      ref={filePickerRef}
                      type="file"
                      multiple
                      onChange={(e) => {
                        if (e.target.files?.length) {
                          void ingestFileList(e.target.files);
                        }
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                  </div>

                  {uploadedFiles.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400 font-mono-tabular">
                          {uploadedFiles.length}{' '}
                          {uploadedFiles.length === 1 ? 'file' : 'files'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setUploadedFiles([])}
                          className="text-xs text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                        >
                          {copy.clearFilesBtn}
                        </button>
                      </div>
                      <ul className="divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        {uploadedFiles.map((f) => (
                          <li
                            key={f.name}
                            className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs bg-slate-50/70 dark:bg-slate-950/60"
                          >
                            <span className="font-mono-tabular text-slate-800 dark:text-slate-200 truncate">
                              {f.name}
                            </span>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="font-mono-tabular text-slate-500 dark:text-slate-400">
                                {Math.max(1, Math.round(f.bytes.length / 1024))} KB
                              </span>
                              <button
                                type="button"
                                aria-label={`Remove ${f.name}`}
                                onClick={() =>
                                  setUploadedFiles((prev) => prev.filter((x) => x.name !== f.name))
                                }
                                className="p-1 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {mode === 'url' && (
                <div className="space-y-2">
                  <label
                    htmlFor="website-url"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                  >
                    {copy.urlLabel}
                  </label>
                  <input
                    id="website-url"
                    type="url"
                    inputMode="url"
                    autoCapitalize="off"
                    autoCorrect="off"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    onBlur={handleUrlBlur}
                    placeholder={copy.urlPlaceholder}
                    className="w-full px-3.5 py-3 text-sm font-mono-tabular rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {copy.urlNote}
                  </p>
                </div>
              )}
            </section>

            {/* Section 3: Display & Signing */}
            <section
              id="signing"
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 sm:p-6 space-y-5"
            >
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {copy.step3Title}
              </h2>

              <label className="flex items-start gap-3.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={fullscreen}
                  onChange={(e) => setFullscreen(e.target.checked)}
                  className="mt-0.5 w-5 h-5 rounded accent-emerald-600 cursor-pointer shrink-0"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                    {copy.fullscreenTitle}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    {copy.fullscreenDesc}
                  </span>
                </span>
              </label>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100 inline-flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>{copy.signingModeLabel}</span>
                  </span>

                  <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/90">
                    <button
                      type="button"
                      onClick={() => setSigningMode('default')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        signingMode === 'default'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {copy.signingDefault}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!personalKey) {
                          handleGeneratePersonalKey();
                        } else {
                          setSigningMode('personal');
                        }
                      }}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        signingMode === 'personal'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {copy.signingPersonal}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGeneratePersonalKey}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    {copy.signingNewKeyBtn}
                  </button>
                  {personalKey && (
                    <button
                      type="button"
                      onClick={handleDownloadPersonalKey}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                    >
                      {copy.signingExportBtn}
                    </button>
                  )}
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {copy.signingHint}
                </p>
              </div>
            </section>
          </div>

          {/* Right Preview & Build Column */}
          <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-20">
            <PhonePreview
              mode={mode}
              appName={appName}
              packageName={effectivePackageName}
              htmlCode={htmlCode}
              files={uploadedFiles}
              websiteUrl={websiteUrl}
              fullscreen={fullscreen}
              iconDataUrl={iconDataUrl}
              copy={copy}
            />

            {/* Primary Build & Output Card */}
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-4">
              <button
                type="button"
                onClick={handleBuildApk}
                disabled={isBuilding}
                className="w-full min-h-[52px] px-5 py-3.5 rounded-xl font-display text-base font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white shadow-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {isBuilding ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{copy.buildingBtn}</span>
                  </>
                ) : (
                  <>
                    <Smartphone className="w-5 h-5" />
                    <span>{copy.buildBtn}</span>
                  </>
                )}
              </button>

              {buildError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs sm:text-sm"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{buildError}</span>
                </div>
              )}

              {buildResult && downloadUrl && (
                <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <span className="font-display text-sm font-semibold">{copy.readyTitle}</span>
                  </div>

                  <a
                    ref={downloadAnchorRef}
                    href={downloadUrl}
                    download={buildResult.fileName}
                    className="w-full min-h-[50px] px-5 py-3 rounded-xl font-display text-sm font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>
                      {copy.downloadBtn} ({Math.round(buildResult.apkBytes.length / 1024)} KB)
                    </span>
                  </a>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs pt-1">
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Package ID</dt>
                      <dd className="font-mono-tabular text-slate-900 dark:text-slate-100 truncate">
                        {buildResult.packageName}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Version / SDK</dt>
                      <dd className="font-mono-tabular text-slate-900 dark:text-slate-100">
                        v{buildResult.versionName} ({buildResult.versionCode}) · API{' '}
                        {buildResult.targetSdkVersion}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Signatures</dt>
                      <dd className="text-slate-900 dark:text-slate-100 inline-flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>v1 + v2 SHA-256</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Zipalign</dt>
                      <dd className="font-mono-tabular text-slate-900 dark:text-slate-100">
                        4-byte ({buildResult.alignedStoreEntries} stored)
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </section>

            {/* Phone Install Guide */}
            <section
              id="guide"
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5"
            >
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white mb-3">
                {copy.guideTitle}
              </h2>
              <ol className="space-y-2.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed list-decimal pl-4">
                {copy.guidePoints.map((pt, i) => (
                  <li key={i}>{pt}</li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      </main>

      {showHtmlModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="combined-html-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm"
        >
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-2xl overflow-hidden flex flex-col max-h-[88dvh]">
            <div className="flex items-start justify-between gap-4 p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2
                  id="combined-html-modal-title"
                  className="font-display text-base font-semibold text-slate-900 dark:text-white"
                >
                  {copy.htmlModalTitle}
                </h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {copy.htmlModalDesc}
                </p>
              </div>
              <button
                type="button"
                aria-label={copy.closeBtn}
                onClick={() => setShowHtmlModal(false)}
                className="min-h-[36px] min-w-[36px] rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 inline-flex items-center justify-center cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 flex-1 min-h-0 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-mono-tabular text-slate-500 dark:text-slate-400">
                  {singleHtmlText
                    ? `HTML-to-APK-Studio.html · ${(new TextEncoder().encode(singleHtmlText).length / 1024).toFixed(1)} KB`
                    : 'Loading bundle...'}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!singleHtmlText}
                    onClick={() => {
                      if (!singleHtmlText) return;
                      htmlTextareaRef.current?.focus();
                      htmlTextareaRef.current?.select();
                      const ok = copyTextSynchronously(singleHtmlText);
                      if (ok) {
                        setCopiedHtml(true);
                        setTimeout(() => setCopiedHtml(false), 2400);
                      }
                    }}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {copiedHtml ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedHtml ? copy.copiedHtml : copy.selectAllCopy}</span>
                  </button>
                  <button
                    type="button"
                    disabled={!singleHtmlText}
                    onClick={handleDownloadSingleHtmlFile}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{copy.downloadSingleHtml}</span>
                  </button>
                </div>
              </div>

              {singleHtmlLoading && !singleHtmlText ? (
                <div className="flex-1 min-h-[260px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading combined HTML...</span>
                </div>
              ) : (
                <textarea
                  ref={htmlTextareaRef}
                  readOnly
                  value={singleHtmlText ?? ''}
                  onFocus={(e) => e.currentTarget.select()}
                  spellCheck={false}
                  className="w-full flex-1 min-h-[280px] p-3 text-xs font-mono-tabular rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { Globe, Smartphone } from 'lucide-react';
import { useMemo, useState } from 'react';
import { UploadedInputFile } from '../apk/apkBuilder';
import { CopyBundle } from '../utils/i18n';

interface PhonePreviewProps {
  mode: 'code' | 'files' | 'url';
  appName: string;
  packageName: string;
  htmlCode: string;
  files: UploadedInputFile[];
  websiteUrl: string;
  fullscreen: boolean;
  iconDataUrl: string;
  copy: CopyBundle;
}

const textDecoder = new TextDecoder('utf-8');

export function PhonePreview({
  mode,
  appName,
  packageName,
  htmlCode,
  files,
  websiteUrl,
  fullscreen,
  iconDataUrl,
  copy,
}: PhonePreviewProps) {
  const [view, setView] = useState<'app' | 'launcher'>('app');

  const previewHtml = useMemo(() => {
    if (mode === 'code') {
      return htmlCode.trim();
    }
    if (mode === 'files') {
      const idx = files.find((f) => /(^|\/)index\.html?$/i.test(f.name)) ?? files.find((f) => /\.html?$/i.test(f.name));
      if (idx) {
        return textDecoder.decode(idx.bytes);
      }
      if (htmlCode.trim()) return htmlCode.trim();
    }
    return '';
  }, [mode, htmlCode, files]);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            {copy.previewTitle}
          </h2>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 shrink-0">
          <button
            type="button"
            onClick={() => setView('app')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              view === 'app'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {copy.previewTabApp}
          </button>
          <button
            type="button"
            onClick={() => setView('launcher')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              view === 'launcher'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {copy.previewTabLauncher}
          </button>
        </div>
      </div>

      {/* Realistic Android Phone Shell */}
      <div className="mx-auto w-full max-w-[290px] rounded-[34px] border-[6px] border-slate-800 dark:border-slate-700 bg-slate-950 shadow-lg overflow-hidden">
        {/* Simulated Android Status Bar */}
        {(!fullscreen || view === 'launcher') && (
          <div className="h-6 px-4 flex items-center justify-between text-[10px] font-mono-tabular text-slate-300 bg-slate-950/95">
            <span>9:30</span>
            <div className="w-2.5 h-2.5 rounded-full bg-slate-800 border border-slate-700" />
            <span>5G 98%</span>
          </div>
        )}

        {/* Viewport */}
        <div className="relative h-[430px] bg-slate-900 overflow-hidden">
          {view === 'launcher' ? (
            <div className="h-full w-full flex flex-col justify-between p-6 bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950">
              <div className="text-center pt-4">
                <p className="text-3xl font-display font-semibold text-white/90 tabular-nums">09:30</p>
                <p className="text-xs text-slate-400 mt-1">Android Home Screen</p>
              </div>

              <div className="grid grid-cols-3 gap-4 items-start justify-items-center py-6">
                <div className="flex flex-col items-center gap-1.5 opacity-45">
                  <div className="w-12 h-12 rounded-2xl bg-slate-700" />
                  <span className="text-[10px] text-slate-400">Browser</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  {iconDataUrl && (
                    <img
                      src={iconDataUrl}
                      alt={appName || 'App icon'}
                      className="w-13 h-13 rounded-[15px] object-cover shadow-md ring-1 ring-white/15"
                    />
                  )}
                  <span className="text-[11px] font-medium text-white text-center leading-tight line-clamp-2 max-w-[78px]">
                    {appName.trim() || 'My App'}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1.5 opacity-45">
                  <div className="w-12 h-12 rounded-2xl bg-slate-700" />
                  <span className="text-[10px] text-slate-400">Files</span>
                </div>
              </div>

              <div className="text-center pb-2">
                <p className="font-mono-tabular text-[10px] text-slate-400 truncate">{packageName}</p>
              </div>
            </div>
          ) : mode === 'url' ? (
            <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center bg-slate-900 text-slate-100">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center mb-3">
                <Globe className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-white mb-1">{appName.trim() || 'Web App'}</p>
              <p className="font-mono-tabular text-xs text-slate-400 break-all max-w-full">
                {websiteUrl.trim() || 'https://example.com'}
              </p>
              <p className="text-[11px] text-slate-500 mt-4 leading-relaxed">
                WebView loads this URL natively on launch with offline fallback handling.
              </p>
            </div>
          ) : previewHtml ? (
            <iframe
              title="HTML App Live Preview"
              sandbox="allow-scripts allow-forms"
              srcDoc={previewHtml}
              className="w-full h-full border-0 bg-white"
            />
          ) : (
            <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center text-slate-400">
              <p className="text-xs leading-relaxed">
                Paste HTML code or upload files/ZIP to preview your app here.
              </p>
            </div>
          )}
        </div>

        {/* Simulated Android 3-Button Nav Bar */}
        {(!fullscreen || view === 'launcher') && (
          <div className="h-7 px-10 flex items-center justify-between bg-slate-950 text-slate-500">
            <span className="w-2.5 h-2.5 border-l-2 border-b-2 border-current rotate-45 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full border-2 border-current inline-block" />
            <span className="w-2.5 h-2.5 rounded-xs border-2 border-current inline-block" />
          </div>
        )}
      </div>
    </div>
  );
}

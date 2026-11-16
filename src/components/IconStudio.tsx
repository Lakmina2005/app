import { ImagePlus, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CopyBundle } from '../utils/i18n';

export interface IconPalette {
  id: string;
  label: string;
  from: string;
  to: string;
  fg: string;
}

export const ICON_PALETTES: IconPalette[] = [
  { id: 'emerald', label: 'Emerald', from: '#059669', to: '#10b981', fg: '#ffffff' },
  { id: 'indigo', label: 'Indigo', from: '#4338ca', to: '#6366f1', fg: '#ffffff' },
  { id: 'ocean', label: 'Ocean', from: '#0284c7', to: '#0ea5e9', fg: '#ffffff' },
  { id: 'slate', label: 'Graphite', from: '#1e293b', to: '#334155', fg: '#f8fafc' },
  { id: 'crimson', label: 'Crimson', from: '#be123c', to: '#f43f5e', fg: '#ffffff' },
  { id: 'amber', label: 'Amber', from: '#d97706', to: '#f59e0b', fg: '#ffffff' },
  { id: 'violet', label: 'Violet', from: '#6d28d9', to: '#8b5cf6', fg: '#ffffff' },
  { id: 'ivory', label: 'Ivory', from: '#f1f5f9', to: '#e2e8f0', fg: '#0f172a' },
];

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(',')[1] ?? '';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function renderGeneratedIcon(
  appName: string,
  customGlyph: string,
  palette: IconPalette,
): { dataUrl: string; pngBytes: Uint8Array } {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 192, 192);
  grad.addColorStop(0, palette.from);
  grad.addColorStop(1, palette.to);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 192, 192);

  // Subtle inner highlight ring for depth on Android adaptive masks
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 188, 188);

  const rawGlyph = customGlyph.trim() || [...(appName.trim() || 'A')][0] || 'A';
  const chars = [...rawGlyph];
  const displayGlyph = chars.slice(0, 2).join('').toUpperCase();

  ctx.fillStyle = palette.fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font =
    chars.length > 1
      ? '700 72px system-ui, -apple-system, "Segoe UI", sans-serif'
      : '700 94px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillText(displayGlyph, 96, 101);

  const dataUrl = canvas.toDataURL('image/png');
  return { dataUrl, pngBytes: dataUrlToBytes(dataUrl) };
}

interface IconStudioProps {
  appName: string;
  copy: CopyBundle;
  iconDataUrl: string;
  isCustomImage: boolean;
  onIconChange: (dataUrl: string, pngBytes: Uint8Array, isCustom: boolean) => void;
}

export function IconStudio({
  appName,
  copy,
  iconDataUrl,
  isCustomImage,
  onIconChange,
}: IconStudioProps) {
  const [paletteId, setPaletteId] = useState<string>('emerald');
  const [customGlyph, setCustomGlyph] = useState<string>('');
  const [uploadStatus, setUploadStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activePalette = ICON_PALETTES.find((p) => p.id === paletteId) ?? ICON_PALETTES[0];

  useEffect(() => {
    if (!isCustomImage) {
      const { dataUrl, pngBytes } = renderGeneratedIcon(appName, customGlyph, activePalette);
      onIconChange(dataUrl, pngBytes, false);
    }
  }, [appName, customGlyph, activePalette, isCustomImage, onIconChange]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const drawSource = async (): Promise<CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number }> => {
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('read'));
            reader.onload = () => resolve(String(reader.result));
            reader.readAsDataURL(file);
          });
          return await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('decode'));
            img.src = dataUrl;
          });
        } catch {
          if (typeof createImageBitmap === 'function') {
            return await createImageBitmap(file);
          }
          throw new Error('decode');
        }
      };

      const src = await drawSource();
      const w = src.naturalWidth || src.width || 192;
      const h = src.naturalHeight || src.height || 192;
      const side = Math.min(w, h);

      const canvas = document.createElement('canvas');
      canvas.width = 192;
      canvas.height = 192;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 192, 192);
      ctx.drawImage(src, (w - side) / 2, (h - side) / 2, side, side, 0, 0, 192, 192);

      const outUrl = canvas.toDataURL('image/png');
      onIconChange(outUrl, dataUrlToBytes(outUrl), true);
      setUploadStatus({ kind: 'ok', text: `${file.name} (192×192 PNG)` });
    } catch {
      setUploadStatus({
        kind: 'err',
        text: `Could not decode ${file.name}. Use PNG, JPG, WebP, or SVG.`,
      });
    }
  }

  function handleResetToAuto() {
    setUploadStatus(null);
    const { dataUrl, pngBytes } = renderGeneratedIcon(appName, customGlyph, activePalette);
    onIconChange(dataUrl, pngBytes, false);
  }

  return (
    <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
          {copy.iconStudioTitle}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ImagePlus className="w-3.5 h-3.5" />
            <span>{copy.iconUploadBtn}</span>
          </button>
          {isCustomImage && (
            <button
              type="button"
              onClick={handleResetToAuto}
              className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{copy.iconAutoBtn}</span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="shrink-0 flex items-center gap-3">
          {iconDataUrl ? (
            <img
              src={iconDataUrl}
              alt="App launcher icon preview"
              className="w-20 h-20 rounded-[22px] object-cover border border-slate-200 dark:border-slate-700 shadow-sm bg-slate-100 dark:bg-slate-900"
            />
          ) : (
            <div className="w-20 h-20 rounded-[22px] bg-slate-200 dark:bg-slate-800" />
          )}
        </div>

        <div className="flex-1 min-w-0 w-full space-y-3">
          {!isCustomImage ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="w-32">
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    {copy.iconGlyphLabel}
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    value={customGlyph}
                    onChange={(e) => setCustomGlyph(e.target.value)}
                    placeholder={[...(appName.trim() || 'A')][0]?.toUpperCase() || 'A'}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>
                <div className="flex-1 min-w-[180px]">
                  <span className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                    {copy.iconPaletteLabel}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {ICON_PALETTES.map((p) => {
                      const active = p.id === paletteId;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPaletteId(p.id)}
                          title={p.label}
                          aria-label={p.label}
                          style={{ background: `linear-gradient(135deg, ${p.from}, ${p.to})` }}
                          className={`w-7 h-7 rounded-lg cursor-pointer transition-transform ${
                            active
                              ? 'ring-2 ring-offset-2 ring-emerald-500 dark:ring-offset-[#111827] scale-105'
                              : 'opacity-85 hover:opacity-100'
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-600 dark:text-slate-400">{copy.iconBgNote}</p>
          )}

          {uploadStatus && (
            <p
              className={`text-xs font-medium ${
                uploadStatus.kind === 'ok'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {uploadStatus.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

process.env.NODE_ENV = 'production';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { build } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const tmpOutDir = path.resolve(rootDir, '.singlefile-tmp');
const targetHtmlPath = path.resolve(rootDir, 'public/html-to-apk-studio.html');

async function main() {
  fs.rmSync(tmpOutDir, { recursive: true, force: true });

  await build({
    root: rootDir,
    mode: 'production',
    configFile: false,
    logLevel: 'warn',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': rootDir,
      },
    },
    build: {
      outDir: tmpOutDir,
      emptyOutDir: true,
      copyPublicDir: false,
      assetsInlineLimit: 100000000,
      cssCodeSplit: false,
      rollupOptions: {
        output: {
          format: 'iife',
          entryFileNames: 'bundle.js',
          assetFileNames: 'bundle.[ext]',
        },
      },
    },
  });

  const html = fs.readFileSync(path.join(tmpOutDir, 'index.html'), 'utf8');
  const jsPath = path.join(tmpOutDir, 'bundle.js');
  const cssPath = path.join(tmpOutDir, 'bundle.css');

  const jsCode = fs.existsSync(jsPath)
    ? fs.readFileSync(jsPath, 'utf8').replace(/<\/script/gi, '<\\/script')
    : '';
  const cssCode = fs.existsSync(cssPath)
    ? fs.readFileSync(cssPath, 'utf8').replace(/<\/style/gi, '<\\/style')
    : '';

  let singleHtml = html
    .replace(/<link[^>]*href=["'][^"']*bundle\.css["'][^>]*>/gi, () => `<style>\n${cssCode}\n</style>`)
    .replace(/<script[^>]*src=["'][^"']*bundle\.js["'][^>]*><\/script>/gi, '');

  singleHtml = singleHtml.replace('</body>', () => `<script>\n${jsCode}\n</script>\n</body>`);

  fs.mkdirSync(path.dirname(targetHtmlPath), { recursive: true });
  fs.writeFileSync(targetHtmlPath, singleHtml, 'utf8');
  fs.rmSync(tmpOutDir, { recursive: true, force: true });

  const kb = (Buffer.byteLength(singleHtml, 'utf8') / 1024).toFixed(1);
  console.log(`Built single-file HTML: ${targetHtmlPath} (${kb} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

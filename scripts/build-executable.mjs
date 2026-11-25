import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const outFile = path.join(rootDir, 'NeonRogue-Game.html');

export function buildStandaloneHtml() {
  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error('dist/index.html not found. Run "npm run build" first.');
  }

  let html = fs.readFileSync(indexPath, 'utf8');

  // Inline stylesheet links
  html = html.replace(
    /<link\s+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/gi,
    (_match, href) => {
      const relPath = href.replace(/^\//, '');
      const assetPath = path.join(distDir, relPath);
      if (!fs.existsSync(assetPath)) return '';
      const css = fs.readFileSync(assetPath, 'utf8').replace(/<\/style/gi, '<\\/style');
      return `<style>\n${css}\n</style>`;
    }
  );

  // Inline module scripts safely at end of body
  const inlinedScripts = [];
  html = html.replace(
    /<script\s+type="module"[^>]*src="([^"]+)"[^>]*><\/script>/gi,
    (_match, src) => {
      const relPath = src.replace(/^\//, '');
      const assetPath = path.join(distDir, relPath);
      if (!fs.existsSync(assetPath)) return '';
      const js = fs.readFileSync(assetPath, 'utf8').replace(/<\/script/gi, '<\\/script');
      inlinedScripts.push(`<script type="module">\n${js}\n</script>`);
      return '';
    }
  );

  if (inlinedScripts.length > 0) {
    html = html.replace('</body>', `${inlinedScripts.join('\n')}\n  </body>`);
  }

  fs.writeFileSync(outFile, html, 'utf8');
  const sizeMb = (fs.statSync(outFile).size / (1024 * 1024)).toFixed(2);
  console.log(`Built standalone executable HTML: ${outFile} (${sizeMb} MB)`);
  return outFile;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  buildStandaloneHtml();
}

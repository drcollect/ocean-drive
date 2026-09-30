import { defineConfig, type Plugin } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Dev only: POST a canvas data URL to /__shot?name=x and it lands in .shots/x.png (for automated checks); /__save takes raw bytes. */
function shots(): Plugin {
  return {
    name: 'od-shots',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        const url = new URL(req.url ?? '', 'http://x');
        const name = (url.searchParams.get('name') ?? 'shot').replace(/[^\w.-]/g, '_');
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (c: string) => (body += c));
        req.on('end', () => {
          const dir = join(server.config.root, '.shots');
          mkdirSync(dir, { recursive: true });
          const b64 = body.replace(/^data:image\/\w+;base64,/, '');
          writeFileSync(join(dir, `${name}.png`), Buffer.from(b64, 'base64'));
          res.end('ok');
        });
      });
      // the trailer's frames and sound: POST the raw bytes to /__save?path=shot/0001.jpg → .trailer/shot/0001.jpg
      server.middlewares.use('/__save', (req, res) => {
        const url = new URL(req.url ?? '', 'http://x');
        const rel = (url.searchParams.get('path') ?? 'file').replace(/[^\w./-]/g, '_').replace(/\.{2,}/g, '_');
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const file = join(server.config.root, '.trailer', rel);
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, Buffer.concat(chunks));
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [shots()],
  server: { port: 5193, strictPort: true, host: '127.0.0.1' },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
});

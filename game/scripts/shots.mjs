// Review screenshots of cameras A–H in headless Chrome (GPU via ANGLE/Metal).
//
//   npm run shots -- [cams=ABCDEFGH] [tag=shot] [extra query, e.g. "q=medium&exp=1.2"]
//
// Needs the dev server (npm run dev). PNGs land in ../renders/shots/<tag>_<cam>.png.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', '..', 'renders', 'shots');
mkdirSync(out, { recursive: true });

const cams = (process.argv[2] ?? 'ABCDEFGH').split('');
const tag = process.argv[3] ?? 'shot';
const extra = process.argv[4] ?? '';
const base = process.env.OD_URL ?? 'http://127.0.0.1:5193/';
const W = Number(process.env.OD_W ?? 1600);
const H = Number(process.env.OD_H ?? 900);

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  protocolTimeout: 900000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', `--window-size=${W},${H}`, '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const t0 = Date.now();
await page.goto(`${base}?cam=${process.env.OD_POSES ? 'A' : cams[0]}&t=${process.env.OD_T ?? 20}&hud=${process.env.OD_HUD ?? 0}${extra ? '&' + extra : ''}`, { waitUntil: 'load' });
await page.waitForFunction('window.__od && window.__od.ready', { timeout: 240000 });
const info = await page.evaluate(() => ({ gpu: window.__od.q.gpu, tier: window.__od.q.tier }));
console.log(`ready in ${((Date.now() - t0) / 1000).toFixed(1)} s · ${info.tier} · ${info.gpu}`);

const frames = (n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

const poses = process.env.OD_POSES ? process.env.OD_POSES.split(';') : null;
for (const c of poses ? poses.map((_, i) => String(i)) : cams) {
  if (poses) await page.evaluate((p) => window.__od.look(...p.split(',').map(Number)), poses[Number(c)]);
  else await page.evaluate((c) => window.__od.cam(c), c);
  await frames(Number(process.env.OD_FRAMES ?? 8));
  const file = path.join(out, `${tag}_${c}.png`);
  await page.screenshot({ path: file });
  const st = await page.evaluate(() => {
    const i = window.__od.pipe.renderer.info;
    return { calls: i.render.calls, tris: i.render.triangles, fps: window.__od.pipe.fps };
  });
  console.log(`${c}: ${file}  calls ${st.calls} tris ${(st.tris / 1000).toFixed(0)}k`);
}
if (errors.length) console.log('console:\n' + [...new Set(errors)].slice(0, 30).join('\n'));
await browser.close();

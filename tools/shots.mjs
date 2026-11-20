import { readFileSync, writeFileSync, statSync, unlinkSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
const base = process.env.BASE_URL || 'http://127.0.0.1:8765';
const cdp = process.env.CDP_URL || 'http://127.0.0.1:9222';
const outDir = join(root, 'screenshots');
mkdirSync(outDir, { recursive: true });
const tmpDir = '/tmp/tideline-shots';
mkdirSync(tmpDir, { recursive: true });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function capture(shot) {
  const width = shot.viewport?.width || 1280;
  const height = shot.viewport?.height || 480;
  const url = new URL(shot.path || '/', base).toString();
  const target = await fetch(`${cdp}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' }).then((r) => r.json());
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let id = 0;
  let loaded = false;

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  ws.addEventListener('message', (event) => {
    const data = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
    if (data.method === 'Page.loadEventFired') loaded = true;
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result || {});
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const myId = ++id;
      pending.set(myId, { resolve, reject });
      ws.send(JSON.stringify({ id: myId, method, params }));
    });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  if (Array.isArray(shot.seed)) {
    await send('Page.navigate', { url: new URL('/', base).toString() });
    await delay(450);
    const payload = JSON.stringify({ v: 2, earned: shot.seed, counts: {} });
    await send('Runtime.evaluate', {
      expression: `localStorage.setItem('tideline55.v2', ${JSON.stringify(payload)})`,
    });
    loaded = false;
  }
  await send('Page.navigate', { url });
  const deadline = Date.now() + 6000;
  while (!loaded && Date.now() < deadline) await delay(100);
  await delay(700);
  try {
    await send('Runtime.evaluate', {
      expression: 'document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true',
      awaitPromise: true,
    });
  } catch {
    /* fonts are system fonts; ignore */
  }
  await delay(250);
  const result = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const png = Buffer.from(result.data, 'base64');
  const tmp = join(tmpDir, `${shot.file}.png`);
  writeFileSync(tmp, png);
  ws.close();
  try {
    await fetch(`${cdp}/json/close/${target.id}`);
  } catch {
    /* tab may already close */
  }

  const dest = join(outDir, shot.file);
  let quality = 3;
  for (;;) {
    const res = spawnSync(
      'ffmpeg',
      ['-y', '-i', tmp, '-vf', `scale=${width}:${height}:force_original_aspect_ratio=disable`, '-q:v', String(quality), dest],
      { stdio: 'ignore' },
    );
    if (res.status !== 0) throw new Error(`ffmpeg failed for ${shot.file}`);
    const size = statSync(dest).size;
    if (size <= 262144 || quality >= 12) {
      console.log(`${shot.file}: ${width}x${height} · ${size} bytes · q${quality}`);
      break;
    }
    quality += 1;
  }
  unlinkSync(tmp);
}

for (const shot of shots) await capture(shot);
console.log('shots: captured', shots.length, 'frames');

// Drives headless Chrome in real time over the DevTools protocol (decoding audio needs a real clock) and screenshots the top-bar music player.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = process.argv[2] ?? join(ROOT, 'dev', 'preview');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg' };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = createServer(async (request, response) => {
  const path = normalize(join(ROOT, decodeURIComponent(new URL(request.url, 'http://x').pathname)));
  try {
    const body = await readFile(path);
    response.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body);
  } catch {
    response.writeHead(404).end();
  }
}).listen(0);
const site = `http://127.0.0.1:${server.address().port}`;

const chrome = spawn(CHROME, ['--headless=new', '--no-first-run', '--use-mock-keychain', '--password-store=basic', '--autoplay-policy=no-user-gesture-required', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'player-'))}`, '--window-size=520,420', '--force-device-scale-factor=2', 'about:blank'], { stdio: 'ignore' });

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = pages.find((each) => each.type === 'page');
      if (page) return new WebSocket(page.webSocketDebuggerUrl);
    } catch {}
    await sleep(200);
  }
  throw new Error('Chrome did not start');
}

const socket = await connect();
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
let nextId = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (pending.has(message.id)) {
    pending.get(message.id)(message.result);
    pending.delete(message.id);
  }
});
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++nextId;
  pending.set(id, resolve);
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }))?.result?.value;
const waitFor = async (expression) => {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(expression)) return true;
    await sleep(200);
  }
  return false;
};
const shoot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 520, height: 420, scale: 1 } });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  console.log(name, JSON.stringify(await evaluate('player.state()')));
};

for (const [query, steps] of [
  ['', [['harp', null], ['playing', 'player.open()'], ['paused', "player.press('toggle')"]]],
  ['?animated=off', [['still', null]]],
  ['', [['songs-open', "player.open(); document.querySelector('.osrs-music-picker-toggle').click()"]]],
]) {
  await send('Page.navigate', { url: `${site}/dev/preview/player.html${query}` });
  await waitFor('typeof player !== "undefined"');
  await evaluate('document.fonts.ready.then(() => true)');
  for (const [name, action] of steps) {
    if (name !== 'harp') await waitFor('player.state().playing');
    if (action) await evaluate(action);
    await sleep(400);
    await shoot(name);
  }
}

socket.close();
chrome.kill();
server.close();

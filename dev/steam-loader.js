(function () {
  const fs = require('fs');
  const path = require('path');
  const MOD_DIR = __MOD_DIR__;
  const STATUS_FILE = __STATUS_FILE__;
  const LOG_FILE = STATUS_FILE.replace(/[^/]+$/, 'loader.log');
  const log = (line) => fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`);
  const win = nw.Window.get();
  log('wrapper loaded');

  function buildFrameScript() {
    const read = (file) => fs.readFileSync(path.join(MOD_DIR, file));
    const mapping = JSON.parse(read('mapping.json'));
    const sprites = {};
    for (const entry of Object.values(mapping.entries)) {
      for (const sprite of [entry.s, ...Object.values(entry.a || {})]) if (!sprites[sprite]) sprites[sprite] = read(sprite).toString('base64');
    }
    const setupSource = read('setup.mjs').toString().replace(/^export\s+/gm, '');
    return `(function () {
if (window.__osrsSprites) return;
window.__osrsSprites = true;
${setupSource}
const data = ${JSON.stringify({ mapping, sprites })};
(${frameMain})(setup, data);
})();`;
  }

  function frameMain(setup, data) {
    const blobUrls = new Map();
    const ctx = {
      onInterfaceReady() {},
      loadData: async (file) => (file === 'mapping.json' ? data.mapping : undefined),
      getResourceUrl(file) {
        if (!blobUrls.has(file)) {
          const bytes = Uint8Array.from(atob(data.sprites[file]), (c) => c.charCodeAt(0));
          blobUrls.set(file, URL.createObjectURL(new Blob([bytes], { type: 'image/png' })));
        }
        return blobUrls.get(file);
      },
      patch(cls, method) {
        const original = cls.prototype[method];
        return {
          replace(override) {
            cls.prototype[method] = function (...args) {
              return override.call(this, (...next) => original.apply(this, next), ...args);
            };
          },
          after(hook) {
            cls.prototype[method] = function (...args) {
              const result = original.apply(this, args);
              const replaced = hook.call(this, result, ...args);
              return replaced === undefined ? result : replaced;
            };
          },
        };
      },
      settings: {
        section(name) {
          return {
            add() {},
            get(setting) {
              try {
                return JSON.parse(localStorage.getItem(`osrs-sprites-dev:${name}:${setting}`) ?? 'true');
              } catch (e) {
                return true;
              }
            },
            set() {},
          };
        },
      },
      accountStorage: {
        getItem: (key) => JSON.parse(localStorage.getItem(`osrs-sprites-dev:${key}`) || 'null'),
        setItem: (key, value) => localStorage.setItem(`osrs-sprites-dev:${key}`, JSON.stringify(value)),
      },
    };

    const post = (status) => window.parent.postMessage({ type: 'osrs-sprites-status', ...status }, '*');

    async function selfCheck() {
      for (let i = 0; i < 180 && !(typeof game !== 'undefined' && game.items && game.items.size > 0); i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (typeof game === 'undefined' || !game.items) return post({ ok: false, error: 'game never loaded' });
      const registries = ['items', 'monsters', 'prayers', 'attackSpells', 'curseSpells', 'skills', 'currencies', 'pages'];
      const counts = {};
      for (const name of registries) {
        const objects = game[name] && game[name].allObjects;
        if (!objects) continue;
        counts[name] = { replaced: objects.filter((o) => String(o.media).startsWith('blob:')).length, total: objects.length };
      }
      const samples = {};
      for (const [registry, id] of [['items', 'melvorD:Bronze_Dagger'], ['items', 'melvorD:Normal_Logs'], ['monsters', 'melvorD:Goblin'], ['skills', 'melvorD:Woodcutting'], ['items', 'melvorTotH:Divine_Dagger']]) {
        const object = game[registry] && game[registry].getObjectByID(id);
        if (!object) continue;
        const image = new Image();
        image.src = object.media;
        let decoded = null;
        try {
          await image.decode();
          decoded = `${image.naturalWidth}x${image.naturalHeight}`;
        } catch (e) {
          decoded = `decode failed: ${e}`;
        }
        samples[id] = { media: String(object.media).slice(0, 80), decoded };
      }
      post({ ok: true, counts, samples, at: new Date().toISOString() });
    }

    post({ stage: 'injected' });
    const run = () => {
      post({ stage: 'setup starting' });
      setup(ctx).then(selfCheck).catch((e) => post({ ok: false, error: String(e && e.stack || e) }));
    };
    if (typeof NamespacedObject !== 'undefined') run();
    else document.addEventListener('DOMContentLoaded', run, { once: true });
  }

  function injectIntoMainWorld(source) {
    const inject = () => {
      const script = document.createElement('script');
      script.textContent = source;
      document.documentElement.appendChild(script);
      script.remove();
    };
    if (document.documentElement) inject();
    else new MutationObserver((_, observer) => {
      if (document.documentElement) {
        observer.disconnect();
        inject();
      }
    }).observe(document, { childList: true });
  }

  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'osrs-sprites-status') {
      log(`frame: ${JSON.stringify(event.data).slice(0, 300)}`);
      if (event.data.stage) return;
      fs.writeFileSync(STATUS_FILE, JSON.stringify(event.data, null, 2) + '\n');
    }
  });

  let cachedScript = null;
  let cachedAt = 0;
  const frameScript = () => {
    if (!cachedScript || Date.now() - cachedAt > 10000) {
      cachedScript = `(${injectIntoMainWorld})(${JSON.stringify(buildFrameScript())});`;
      cachedAt = Date.now();
    }
    return cachedScript;
  };

  win.on('document-start', (frame) => {
    const gameFrame = document.getElementById('game');
    log(`document-start ${frame ? Object.prototype.toString.call(frame) : 'window'} sameAsGame=${frame === gameFrame}`);
    if (!frame || !gameFrame) return;
    try {
      win.eval(gameFrame, frameScript());
      log('eval returned');
    } catch (e) {
      log(`eval threw: ${e.stack || e}`);
      fs.writeFileSync(STATUS_FILE, JSON.stringify({ ok: false, error: `loader: ${e.stack || e}` }, null, 2) + '\n');
    }
  });
})();

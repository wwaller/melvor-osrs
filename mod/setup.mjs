const CHECK_MS = 5000;

export async function setup(ctx) {
  const section = ctx.settings.section('General');
  const later = (fn) => () => setTimeout(fn);
  const icon = ctx.getResourceUrl('icon.png');
  let lock = null;
  let appKeepsScreenOn = false;
  let requesting = false;
  let status = 'Waiting for the game to load.';
  let statusTheme = 'info';
  const announced = new Set();

  section.add([
    { type: 'switch', name: 'enabled', label: 'Keep the screen on', hint: 'Stops the screen from dimming or locking while the game is open.', default: true, onChange: later(update) },
    { type: 'switch', name: 'only-active', label: 'Only while something is running', hint: 'Lets the screen lock as usual when no skill or combat is active. Saves battery.', default: false, onChange: later(update) },
    { type: 'button', name: 'status', display: 'Show status', color: 'secondary', onClick: () => notify(status, statusTheme) },
  ]);

  function notify(message, theme) {
    if (typeof imageNotify === 'function') imageNotify(icon, message, theme);
  }

  function setStatus(message, theme, announce) {
    status = message;
    statusTheme = theme;
    if (announce && !announced.has(message)) {
      announced.add(message);
      notify(message, theme);
    }
  }

  function wanted() {
    if (!section.get('enabled') || document.hidden) return false;
    if (!section.get('only-active')) return true;
    return typeof game !== 'undefined' && game.activeAction !== undefined;
  }

  async function acquire(fromTap) {
    if (lock || appKeepsScreenOn || requesting) return;
    const app = appScreen();
    if (app) {
      app.keepScreenOn();
      appKeepsScreenOn = true;
      setStatus('Keeping the screen on (using the Melvor app).', 'success', true);
      return;
    }
    if (!navigator.wakeLock) {
      setStatus('This version of the game cannot keep the screen on (no Wake Lock support).', 'danger', true);
      return;
    }
    requesting = true;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => {
        if (lock === sentinel) lock = null;
      });
      lock = sentinel;
      setStatus('Keeping the screen on.', 'success', true);
      if (!wanted()) release();
    } catch (error) {
      if (error.name === 'NotAllowedError' && !fromTap) setStatus('Waiting for a tap to keep the screen on.', 'info', false);
      else setStatus(`The screen could not be kept on: ${error.message || error.name}`, 'danger', true);
    } finally {
      requesting = false;
    }
  }

  function release() {
    if (!lock && !appKeepsScreenOn) return;
    if (appKeepsScreenOn) appScreen().keepScreenNormal();
    if (lock) lock.release().catch(() => {});
    lock = null;
    appKeepsScreenOn = false;
    setStatus(section.get('enabled') ? 'Paused until something is running.' : 'Off.', 'info', false);
  }

  function update(fromTap = false) {
    if (wanted()) acquire(fromTap);
    else release();
  }

  ['pointerdown', 'touchend', 'keydown'].forEach((type) => document.addEventListener(type, () => {
    if (!lock && !appKeepsScreenOn) update(true);
  }, true));
  document.addEventListener('visibilitychange', () => update());
  ctx.onInterfaceReady(() => {
    update();
    setInterval(() => update(), CHECK_MS);
  });
}

function appScreen() {
  const bridge = window.median || window.gonative;
  const screen = bridge && bridge.screen;
  return screen && typeof screen.keepScreenOn === 'function' && typeof screen.keepScreenNormal === 'function' ? screen : null;
}

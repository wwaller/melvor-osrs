const LOCK_KEY = 'idleGuard:lock';
const LAST_KEY = 'idleGuard:last';
const IGNORE_WAIT_S = 10;
const MAX_HOURS = 72;
const TICK_MS = 1000;

export function setup(ctx) {
  ctx.loadStylesheet('style.css');
  const icon = ctx.getResourceUrl('icon.png');
  const cage = ctx.getResourceUrl('cage.png');
  const storage = globalThis.localStorage;
  let shown = null;

  function openLockMenu() {
    if (typeof SwalLocale === 'undefined') return;
    const form = createLockForm(document, readJson(storage, LAST_KEY), Date.now);
    SwalLocale.fire({
      title: 'Idle Guard',
      html: form.element,
      showCancelButton: true,
      confirmButtonText: 'Lock',
      cancelButtonText: 'Cancel',
      preConfirm: () => {
        if (form.minutes()) return true;
        SwalLocale.showValidationMessage('Set how long to lock the game for first.');
        return false;
      },
    }).then((result) => {
      if (!result.isConfirmed) return;
      writeJson(storage, LAST_KEY, form.values());
      writeJson(storage, LOCK_KEY, { until: Date.now() + form.minutes() * 60000, hard: form.hard() });
      showIfLocked();
    });
  }

  function showIfLocked() {
    const lock = readLock(storage, Date.now());
    if (!lock || shown) return;
    const end = () => {
      clearInterval(timer);
      shown.screen.remove();
      shown = null;
      removeKey(storage, LOCK_KEY);
    };
    shown = createLockScreen(document, lock, cage, Date.now(), end);
    document.body.append(shown.screen);
    shown.update(Date.now());
    const timer = setInterval(() => {
      if (!shown.update(Date.now())) end();
    }, TICK_MS);
  }

  ctx.onInterfaceReady(() => {
    if (typeof sidebar !== 'undefined') sidebar.category('').item('Idle Guard', { name: 'Idle Guard', icon, onClick: openLockMenu });
  });
  showIfLocked();
}

export function createLockForm(doc, last, clock) {
  const node = (tag, className, text) => {
    const element = doc.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  };
  const number = (label, value, max) => {
    const input = node('input', 'form-control');
    input.type = 'number';
    input.min = '0';
    input.max = String(max);
    input.setAttribute('inputmode', 'numeric');
    input.value = String(value);
    const field = node('label', 'idle-guard-field', label);
    field.append(input);
    return { field, input };
  };
  const hours = number('Hours', last?.hours ?? 1, MAX_HOURS);
  const minutes = number('Minutes', last?.minutes ?? 0, 59);
  const fields = node('div', 'idle-guard-fields');
  fields.append(hours.field, minutes.field);
  const hard = node('input', 'custom-control-input');
  hard.type = 'checkbox';
  hard.id = 'idle-guard-hard';
  const hardLabel = node('label', 'custom-control-label', 'Hard mode');
  hardLabel.setAttribute('for', hard.id);
  const hardSwitch = node('div', 'custom-control custom-switch custom-control-lg idle-guard-switch');
  hardSwitch.append(hard, hardLabel);
  const summary = node('div', 'idle-guard-summary');
  const element = node('div', 'idle-guard-form');
  element.append(fields, hardSwitch, summary);

  const form = {
    element,
    minutes: () => lockMinutes(hours.input.value, minutes.input.value),
    hard: () => Boolean(hard.checked),
    values: () => ({ hours: Number(hours.input.value) || 0, minutes: Number(minutes.input.value) || 0 }),
  };
  const describe = () => {
    const length = form.minutes();
    const now = clock();
    const until = endTime(now + length * 60000, now);
    summary.classList.toggle('text-danger', form.hard() && length > 0);
    if (!length) summary.textContent = 'Set how long to lock the game for.';
    else if (form.hard()) summary.textContent = `Locked for ${formatLength(length)}, until ${until}. Hard mode: no way back in until then.`;
    else summary.textContent = `Locked for ${formatLength(length)}, until ${until}. Ignore lets you back in after a ${IGNORE_WAIT_S} second wait.`;
  };
  [hours.input, minutes.input, hard].forEach((input) => {
    input.addEventListener('input', describe);
    input.addEventListener('change', describe);
  });
  describe();
  return form;
}

export function createLockScreen(doc, lock, cage, shownAt, end) {
  const add = (tag, className, text) => {
    const node = doc.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    screen.append(node);
    return node;
  };
  const screen = doc.createElement('div');
  screen.className = 'idle-guard';
  screen.setAttribute('role', 'dialog');
  screen.setAttribute('aria-modal', 'true');
  const image = add('img', 'idle-guard-cage');
  image.src = cage;
  image.alt = '';
  add('h2', 'idle-guard-title', 'Locked out');
  const left = add('div', 'idle-guard-left');
  add('div', 'idle-guard-until', `Back in at ${endTime(lock.until, shownAt)}`);
  let ignore = null;
  if (lock.hard) {
    add('div', 'idle-guard-hard', 'Hard mode: no way back in until then.');
  } else {
    ignore = add('button', 'idle-guard-ignore');
    ignore.type = 'button';
    ignore.addEventListener('click', () => {
      if (!ignore.disabled) end();
    });
  }
  const update = (now) => {
    if (now >= lock.until) return false;
    left.textContent = formatLeft(lock.until - now);
    if (ignore) {
      const wait = IGNORE_WAIT_S - Math.floor((now - shownAt) / 1000);
      ignore.disabled = wait > 0;
      ignore.textContent = wait > 0 ? `Ignore (${wait})` : 'Ignore';
    }
    return true;
  };
  return { screen, update };
}

export function lockMinutes(hours, minutes) {
  const total = Math.round((Number(hours) || 0) * 60 + (Number(minutes) || 0));
  return Math.min(Math.max(total, 0), MAX_HOURS * 60);
}

export function readLock(storage, now) {
  const lock = readJson(storage, LOCK_KEY);
  return lock && lock.until > now ? { until: lock.until, hard: Boolean(lock.hard) } : null;
}

export function formatLeft(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const pad = (value) => String(value).padStart(2, '0');
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatLength(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h && `${h} hour${h === 1 ? '' : 's'}`, m && `${m} minute${m === 1 ? '' : 's'}`].filter(Boolean).join(' ');
}

function endTime(until, now) {
  const end = new Date(until);
  const time = { hour: 'numeric', minute: '2-digit' };
  return end.toDateString() === new Date(now).toDateString() ? end.toLocaleTimeString([], time) : end.toLocaleString([], { weekday: 'long', ...time });
}

function readJson(storage, key) {
  try {
    return JSON.parse(storage.getItem(key));
  } catch {
    return null;
  }
}

function writeJson(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {}
}

function removeKey(storage, key) {
  try {
    storage.removeItem(key);
  } catch {}
}

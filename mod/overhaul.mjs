const OVERHAUL_NAMESPACE = 'osrsOverhaul';
const OVERHAUL_ID = '6443484';
const OVERHAUL_NAME = /old school runescape overhaul/i;
const OPENS_KEY = 'overhaul-offer-opens';
const SEEN_KEY = 'overhaul-offer-seen';
const APP_PREFIX = 'osrsOverhaulOffer:';
const SHOW_ON_OPEN = 3;
const POPUP_WAIT_MS = 500;
const UNKNOWN = Symbol('unknown');
const SOUNDS_ID = 6442568;
const SONG_DATABASE = 'osrs-sounds-songs';
export const SONG_MARKER = 'osrsSoundsSongsDownloaded';
const ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADoAAAA6CAYAAADhu0ooAAADvUlEQVR4nO2bTUhUURTHz9y5zZgmzjTKKGZfEk4RZkaBIElGRBs3RZtyUbQIVyFZBK7ChdWmIlr2QbZokYTUQkTMlVZiLiRKzawJdBp0RMZ05M0YnHOf9V7OODn3DcGdH8i/+56d83h/zj3v3vcESDu2ZfpJ9rgcGCiCLY2p0K0bTWdxdPVWm+HspcJNqLenwuLIstRrY6AItnQ52fmgGUfHz7eYHKPzw33dONpbddR0Xg4MFIGnK1FP/3DC86HAd0vzM1AEnq5E+3zbURvqT6Lef/Lc0DNHRkdRS4AO+1d6qpxaZaAI3LrQ5MjDijIcDX74ghoOz6K2XL6I6nbloganQ9ZdCmQclYcGMdTKoRHUb0cOoC4sTqOOj9Nsm+cqAithoAjc6gTDGmmptoQa6HyHGo2R0/MaaVZsCNVX4Eb1B6mWZcFAEbjVCdwzk6gT+cWoniVy1oyTb0D15uXRgYyj/42jNuyfTeW7cRStFA4NUp+MiNrM5saqmXZkodbUbUVta/0q9aoYKAK3OsHcAPVLnfHwPGp1Ps2uYU0zOG1n1iyRGSgCtzqBndG9LImRczw7y+Ckn4lLEI6+aadVjGwYKAKXPdteq6DZtkg8CU3ojgkKHNQv0w0DReCyA26JkZNLSSbUa/g3VKuyYaAI3OoEdnEv9dXKT6G5nK/6e8VAs3GVm3bu+0JhKXtHDBSBy5pt6wpdOIqKEpsQ99Auak6L47B+q+fEqsb7V83KgYEi8NRDUO10TM2iswtROtol1pON5WXGRKZbGxE7DNWnfagzcwuojsdBkAkDReCyavRYgcvg5KPmE6jvX4wlTKivWuqvv4I/4zhMs3KqMFAELivQTo8nqb2eiJhsnSxxnI+BAMiEgSJwqwKbn2F1J/WadK7RL31eL2pvSP+mITUYKAJPdba94CvFkWifKwy0j6ye0HRr7ZAeGCgCtyqwQ+wsfPpBO/VFm92GZ93OIO3zbtNna0HUIqcZKAJPNcBonH43NElOnjp3EDX0kp6QJk17SPHi7RKzriwYKAJPddXSu7IDQLTu2YHaLWqQrdEvvbFIQmdrxE5Db4o7DQwUgacewvhNn72W3obBs9C63qXEfxLK7BklhU1CCHTyXmMtjvo7PqO2jdH7Tf09qUdbNMy6Ofupf250UsfMyXagNt7tEXEzX3euC5vEUKt+D9/acJj+8dpvcPTOcLy3ZnKd1MnMuv+O2Qly2MGpBrtEX9X3d6+cOYR68+nbOP9fLgwUwZaGFGv8LYu1ToJAGUd/AeK1GdnEUe23AAAAAElFTkSuQmCC';

// Every OSRS mod ships this same file; the shared global makes them count each app open once.
export function offerOverhaul(ctx) {
  const shared = (globalThis.osrsOverhaulOffer ??= { storages: [], counted: false });
  shared.storages.push(ctx.accountStorage);
  ctx.onCharacterSelectionLoaded(() => {
    if (shared.counted) return;
    shared.counted = true;
    countOpen(shared.storages, overhaulState(), showOffer, peek(() => globalThis.localStorage));
  });
}

const HISTORY_TABLE = 'events';
const HISTORY_DAYS = 7;
const HISTORY_MAX_EVENTS = 20000;
const HISTORY_FLUSH_MS = 5000;

export function createHistory(idb, database, { days = HISTORY_DAYS, max = HISTORY_MAX_EVENTS, flushMs = HISTORY_FLUSH_MS } = {}) {
  let opened = null;
  let pending = [];
  let timer = 0;
  const open = () => (opened ??= new Promise((resolve, reject) => {
    const request = idb.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(HISTORY_TABLE, { autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('the history is open in another copy of the game'));
  }).catch((error) => {
    opened = null;
    throw error;
  }));
  const run = (mode, act) => open().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(HISTORY_TABLE, mode);
    const request = act(transaction.objectStore(HISTORY_TABLE));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('writing the history was cancelled'));
  }));
  const flush = () => {
    clearTimeout(timer);
    timer = 0;
    if (!pending.length) return Promise.resolve();
    const batch = pending;
    pending = [];
    return run('readwrite', (table) => batch.forEach((event) => table.add(event))).catch(() => {});
  };
  const prune = () => run('readonly', (table) => table.getAllKeys()).then((keys) => run('readonly', (table) => table.getAll()).then((events) => {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const old = keys.filter((key, index) => events[index].t < cutoff || index < keys.length - max);
    if (old.length) return run('readwrite', (table) => old.forEach((key) => table.delete(key)));
  })).catch(() => {});
  setTimeout(prune, flushMs);
  return {
    days,
    add(text) {
      pending.push({ t: Date.now(), text });
      if (!timer) timer = setTimeout(flush, flushMs);
    },
    flush,
    read: () => flush().then(() => run('readonly', (table) => table.getAll())),
  };
}

export function modChanges(previous, current) {
  if (!previous) return `mods loaded (${current.length}): ${current.join(', ')}`;
  const added = current.filter((name) => !previous.includes(name));
  const removed = previous.filter((name) => !current.includes(name));
  if (!added.length && !removed.length) return null;
  return [added.length && `mods added: ${added.join(', ')}`, removed.length && `mods removed or turned off: ${removed.join(', ')}`].filter(Boolean).join('; ');
}

export function noteModChanges(note, key) {
  try {
    const current = Object.values(mod.manager.getLoadedModList());
    const previous = JSON.parse(globalThis.localStorage.getItem(key) ?? 'null');
    const change = modChanges(previous, current);
    if (change) note(change);
    globalThis.localStorage.setItem(key, JSON.stringify(current));
  } catch (error) {
    note(`could not check the mod list: ${error?.message ?? error}`);
  }
}

const INSIDE_POPUPS = '[data-tippy-root], .swal2-container, .modal';

// Captured so it runs even where the game stops clicks, and on press because iOS sends no click for taps on plain page.
export function closeOnOutsidePress(doc, find) {
  doc.addEventListener('pointerdown', (event) => {
    const { toggle, menu } = find() ?? {};
    if (!toggle || !menu?.classList.contains('show')) return;
    const target = event.target;
    if (!target || toggle.contains(target) || menu.contains(target) || target.closest?.(INSIDE_POPUPS)) return;
    if (typeof $ === 'function') $(toggle).dropdown('hide');
    else toggle.click();
  }, true);
}

// Sounds runs no code when it is uninstalled, so whichever OSRS mod is still installed deletes the songs it downloaded.
export function dropOrphanedSongs(local = peek(() => globalThis.localStorage), databases = peek(() => globalThis.indexedDB)) {
  if (!local || local === UNKNOWN || !databases || databases === UNKNOWN || !isYes(peek(() => local.getItem(SONG_MARKER)))) return false;
  const installed = peek(() => JSON.parse(local.getItem('modLoadOrder')));
  if (!Array.isArray(installed) || installed.map(Number).includes(SOUNDS_ID)) return false;
  peek(() => databases.deleteDatabase(SONG_DATABASE));
  peek(() => local.removeItem(SONG_MARKER));
  return true;
}

export function countOpen(storages, overhaul, show, local) {
  const stores = [appStorage(local), ...storages];
  const values = (key) => stores.map((store) => peek(() => store.getItem(key)));
  const markSeen = () => stores.forEach((store) => peek(() => store.setItem(SEEN_KEY, true)));
  const allSeen = () => values(SEEN_KEY).every(isYes);
  if (overhaul !== false) {
    if (overhaul === true) markSeen();
    return false;
  }
  const seen = values(SEEN_KEY);
  if (seen.includes(UNKNOWN)) return false;
  if (seen.some(isYes)) {
    markSeen();
    return false;
  }
  const counts = values(OPENS_KEY);
  if (counts.includes(UNKNOWN)) return false;
  const opens = Math.max(0, ...counts.map((value) => Number(value) || 0)) + 1;
  stores.forEach((store) => peek(() => store.setItem(OPENS_KEY, opens)));
  if (opens < SHOW_ON_OPEN) return false;
  markSeen();
  if (!allSeen()) return false;
  whenNoPopup(show);
  return true;
}

const isYes = (value) => value === true || value === 'true';

function appStorage(local) {
  return {
    getItem: (key) => local.getItem(APP_PREFIX + key),
    setItem: (key, value) => local.setItem(APP_PREFIX + key, String(value)),
  };
}

export function overhaulState() {
  const signs = [
    peek(() => game.registeredNamespaces.hasNamespace(OVERHAUL_NAMESPACE)),
    peek(() => mod.manager.getLoadedModList().some((name) => OVERHAUL_NAME.test(name))),
    peek(() => (mod.manager.activeProfile?.mods ?? []).some((id) => String(id) === OVERHAUL_ID)),
  ];
  if (signs.includes(true)) return true;
  return signs.every((sign) => sign === false) ? false : undefined;
}

function whenNoPopup(show) {
  if (typeof Swal !== 'undefined' && Swal.isVisible()) setTimeout(() => whenNoPopup(show), POPUP_WAIT_MS);
  else show();
}

export function offerOptions() {
  return {
    imageUrl: ICON,
    imageWidth: 96,
    imageHeight: 96,
    imageAlt: 'OSRS Overhaul',
    title: 'Want the full Old School experience?',
    html: '<p class="mb-2">Check out the <strong>OSRS Overhaul</strong> mod.</p><p class="font-size-sm text-muted mb-0">The OSRS theme, art, sounds and character viewer in a single install.</p>',
    showCancelButton: true,
    confirmButtonText: 'Take me there',
    cancelButtonText: 'No thanks',
    buttonsStyling: false,
    customClass: { container: 'swal-infront', actions: 'flex-column w-100 px-4', confirmButton: 'btn btn-secondary w-100 my-1', cancelButton: 'btn btn-secondary w-100 my-1' },
    footer: '<span class="text-danger font-w700" style="font-size: 1.25rem">You will never see this again</span>',
    didOpen: (popup) => {
      const image = popup.querySelector('.swal2-image');
      if (image) image.style.imageRendering = 'pixelated';
    },
  };
}

function showOffer() {
  const popup = typeof SwalLocale !== 'undefined' ? SwalLocale : Swal;
  popup.fire(offerOptions()).then((result) => {
    if (result.isConfirmed && typeof mod !== 'undefined') mod.manager.open(false, `id:${OVERHAUL_ID}`);
  });
}

function peek(read) {
  try {
    return read();
  } catch {
    return UNKNOWN;
  }
}

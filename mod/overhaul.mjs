const OVERHAUL_NAMESPACE = 'osrsOverhaul';
const OVERHAUL_ID = '6443484';
const OVERHAUL_NAME = /old school runescape overhaul/i;
const OPENS_KEY = 'overhaul-offer-opens';
const SEEN_KEY = 'overhaul-offer-seen';
const APP_PREFIX = 'osrsOverhaulOffer:';
const SHOW_ON_OPEN = 3;
const POPUP_WAIT_MS = 500;
const UNKNOWN = Symbol('unknown');
const ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADoAAAA6CAYAAADhu0ooAAADvUlEQVR4nO2bTUhUURTHz9y5zZgmzjTKKGZfEk4RZkaBIElGRBs3RZtyUbQIVyFZBK7ChdWmIlr2QbZokYTUQkTMlVZiLiRKzawJdBp0RMZ05M0YnHOf9V7OODn3DcGdH8i/+56d83h/zj3v3vcESDu2ZfpJ9rgcGCiCLY2p0K0bTWdxdPVWm+HspcJNqLenwuLIstRrY6AItnQ52fmgGUfHz7eYHKPzw33dONpbddR0Xg4MFIGnK1FP/3DC86HAd0vzM1AEnq5E+3zbURvqT6Lef/Lc0DNHRkdRS4AO+1d6qpxaZaAI3LrQ5MjDijIcDX74ghoOz6K2XL6I6nbloganQ9ZdCmQclYcGMdTKoRHUb0cOoC4sTqOOj9Nsm+cqAithoAjc6gTDGmmptoQa6HyHGo2R0/MaaVZsCNVX4Eb1B6mWZcFAEbjVCdwzk6gT+cWoniVy1oyTb0D15uXRgYyj/42jNuyfTeW7cRStFA4NUp+MiNrM5saqmXZkodbUbUVta/0q9aoYKAK3OsHcAPVLnfHwPGp1Ps2uYU0zOG1n1iyRGSgCtzqBndG9LImRczw7y+Ckn4lLEI6+aadVjGwYKAKXPdteq6DZtkg8CU3ojgkKHNQv0w0DReCyA26JkZNLSSbUa/g3VKuyYaAI3OoEdnEv9dXKT6G5nK/6e8VAs3GVm3bu+0JhKXtHDBSBy5pt6wpdOIqKEpsQ99Auak6L47B+q+fEqsb7V83KgYEi8NRDUO10TM2iswtROtol1pON5WXGRKZbGxE7DNWnfagzcwuojsdBkAkDReCyavRYgcvg5KPmE6jvX4wlTKivWuqvv4I/4zhMs3KqMFAELivQTo8nqb2eiJhsnSxxnI+BAMiEgSJwqwKbn2F1J/WadK7RL31eL2pvSP+mITUYKAJPdba94CvFkWifKwy0j6ye0HRr7ZAeGCgCtyqwQ+wsfPpBO/VFm92GZ93OIO3zbtNna0HUIqcZKAJPNcBonH43NElOnjp3EDX0kp6QJk17SPHi7RKzriwYKAJPddXSu7IDQLTu2YHaLWqQrdEvvbFIQmdrxE5Db4o7DQwUgacewvhNn72W3obBs9C63qXEfxLK7BklhU1CCHTyXmMtjvo7PqO2jdH7Tf09qUdbNMy6Ofupf250UsfMyXagNt7tEXEzX3euC5vEUKt+D9/acJj+8dpvcPTOcLy3ZnKd1MnMuv+O2Qly2MGpBrtEX9X3d6+cOYR68+nbOP9fLgwUwZaGFGv8LYu1ToJAGUd/AeK1GdnEUe23AAAAAElFTkSuQmCC';

// Every OSRS mod ships this same file; the shared global makes them count each app open once
export function offerOverhaul(ctx) {
  const shared = (globalThis.osrsOverhaulOffer ??= { storages: [], counted: false });
  shared.storages.push(ctx.accountStorage);
  ctx.onCharacterSelectionLoaded(() => {
    if (shared.counted) return;
    shared.counted = true;
    countOpen(shared.storages, overhaulState(), showOffer, peek(() => globalThis.localStorage));
  });
}

// Overhaul being loaded counts as seen, so the offer never appears after it is uninstalled
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

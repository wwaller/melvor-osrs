const SEEN_KEY = 'conflicts-seen';
const POPUP_WAIT_MS = 500;
const AUTHOR = 'bonoetmalo';

export const KNOWN_CONFLICTS = [
  {
    mod: 'Clean UI',
    problem: 'is no longer receiving support, so some conflicts with newer mods and with Melvor\'s current layout are expected. On phones it can move the Attack Style buttons and the corruption checkbox into the Equipment box.',
  },
];

export function newConflicts(loaded, seen, conflicts = KNOWN_CONFLICTS) {
  const names = new Set(loaded.map((name) => String(name).toLowerCase()));
  return conflicts.filter((conflict) => names.has(conflict.mod.toLowerCase()) && !seen.includes(conflict.mod));
}

export function warnAboutConflicts(ctx, from, conflicts = KNOWN_CONFLICTS) {
  let loaded;
  let seen;
  try {
    loaded = mod.manager.getLoadedModList();
    seen = ctx.accountStorage.getItem(SEEN_KEY) || [];
  } catch {
    return false;
  }
  const found = newConflicts(loaded, seen, conflicts);
  if (!found.length) return false;
  ctx.accountStorage.setItem(SEEN_KEY, [...seen, ...found.map((conflict) => conflict.mod)]);
  whenNoPopup(() => SwalLocale.fire(conflictOptions(document, from, found, ctx.getResourceUrl('icon.png'))));
  return true;
}

export function conflictOptions(doc, from, found, icon) {
  const paragraph = (className, ...parts) => {
    const node = doc.createElement('p');
    node.className = className;
    node.append(...parts);
    return node;
  };
  const body = doc.createElement('div');
  const plural = found.length === 1 ? 'mod' : 'mods';
  body.append(paragraph('mb-3', `This note is from ${from} by ${AUTHOR}, not from the ${plural} below.`));
  for (const conflict of found) {
    const name = doc.createElement('strong');
    name.textContent = conflict.mod;
    body.append(paragraph('mb-2', name, ` ${conflict.problem}`));
  }
  body.append(paragraph('font-size-sm text-muted mb-0', `If something on screen looks out of place, try turning the ${plural} above off.`));
  return {
    imageUrl: icon,
    imageWidth: 64,
    imageHeight: 64,
    imageAlt: from,
    title: 'Mod Conflict',
    html: body,
    confirmButtonText: 'OK',
    buttonsStyling: false,
    customClass: { container: 'swal-infront', actions: 'flex-column w-100 px-4', confirmButton: 'btn btn-secondary w-100 my-1' },
  };
}

function whenNoPopup(show) {
  if (typeof Swal !== 'undefined' && Swal.isVisible()) setTimeout(() => whenNoPopup(show), POPUP_WAIT_MS);
  else show();
}

const OVERHAUL_ID = 6443484;
const ORDER_KEY = 'modLoadOrder';
const PROMPTED_KEY = 'osrsOverhaulReloadPromptedAt';
const OFF_KEY = 'osrsOverhaulLoadOrderOff';
const QUIET_MS = 24 * 60 * 60 * 1000;

export function movedToEnd(order, id = OVERHAUL_ID) {
  if (!Array.isArray(order)) return null;
  const mine = order.find((each) => Number(each) === id);
  if (mine === undefined || Number(order.at(-1)) === id) return null;
  return [...order.filter((each) => Number(each) !== id), mine];
}

// Melvor loads the order from PlayFab user data, falling back to localStorage only when that fails, so both get written.
export function saveOrder(order, local = globalThis.localStorage, playFab = globalThis.PlayFab) {
  const text = JSON.stringify(order);
  local.setItem(ORDER_KEY, text);
  const api = playFab?.ClientApi;
  if (!api?.IsClientLoggedIn?.()) return Promise.resolve(true);
  const call = (method, request) => new Promise((resolve) => api[method](request, (result, error) => resolve(error ? null : result)));
  return call('UpdateUserData', { Data: { [ORDER_KEY]: text } })
    .then((written) => written && call('GetUserData', { Keys: [ORDER_KEY] }))
    .then((read) => read?.data?.Data?.[ORDER_KEY]?.Value === text);
}

export function setup(ctx) {
  let order = null;
  try {
    if (localStorage.getItem(OFF_KEY) === 'true') return;
    order = movedToEnd(JSON.parse(localStorage.getItem(ORDER_KEY)));
  } catch {
    return;
  }
  if (!order) return;
  ctx.onCharacterSelectionLoaded(async () => {
    const saved = await saveOrder(order).catch(() => false);
    if (!saved || Date.now() - Number(localStorage.getItem(PROMPTED_KEY) ?? 0) < QUIET_MS) return;
    localStorage.setItem(PROMPTED_KEY, String(Date.now()));
    SwalLocale.fire({
      title: 'OSRS Overhaul',
      text: 'OSRS Overhaul moved itself to the bottom of your mod load order, so every other mod loads before it. Reload the game to finish.',
      imageUrl: ctx.getResourceUrl('icon.png'),
      imageWidth: 64,
      imageHeight: 64,
      confirmButtonText: 'Reload',
      showCancelButton: true,
      cancelButtonText: 'Do not show this again',
      allowOutsideClick: false,
      allowEscapeKey: false,
      customClass: { container: 'swal-infront' },
    }).then((result) => {
      if (result.isConfirmed) window.location.reload();
      else localStorage.setItem(OFF_KEY, 'true');
    });
  });
}

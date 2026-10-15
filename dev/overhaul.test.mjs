import assert from 'node:assert';
import { test } from 'node:test';
import { countOpen, offerOptions, offerOverhaul, overhaulState } from '../mod/overhaul.mjs';

const storage = (values = {}) => ({ values, getItem: (key) => values[key], setItem: (key, value) => (values[key] = value) });
const device = (values = {}) => ({ values, getItem: (key) => (key in values ? values[key] : null), setItem: (key, value) => (values[key] = String(value)) });
const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function launch(storages, app, { overhaul = false, profile = [], popupOpen = false, choice = 'confirm', noGame = false } = {}) {
  delete globalThis.osrsOverhaulOffer;
  const shown = [];
  const opened = [];
  let visible = popupOpen;
  Object.defineProperty(globalThis, 'localStorage', { value: app, configurable: true, writable: true });
  globalThis.game = noGame ? undefined : { registeredNamespaces: { hasNamespace: (namespace) => overhaul && namespace === 'osrsOverhaul' } };
  globalThis.mod = { manager: { getLoadedModList: () => (overhaul ? ['Old School Runescape Overhaul'] : ['SEMI Core']), activeProfile: { mods: profile }, open: (...args) => opened.push(args) } };
  globalThis.Swal = { isVisible: () => visible };
  globalThis.SwalLocale = { fire: (options) => { shown.push(options); return Promise.resolve({ isConfirmed: choice === 'confirm', isDismissed: choice !== 'confirm' }); } };
  const hooks = storages.map((accountStorage) => {
    let hook;
    offerOverhaul({ accountStorage, onCharacterSelectionLoaded: (fn) => (hook = fn) });
    return () => hook();
  });
  hooks.forEach((hook) => hook());
  return { shown, opened, closePopup: () => (visible = false) };
}

test('with several OSRS mods, each app open counts once, and the offer shows on the third open, then never again', async () => {
  const mods = [storage(), storage(), storage()];
  const app = device();
  assert.strictEqual(launch(mods, app).shown.length, 0, 'first open');
  assert.strictEqual(launch(mods, app).shown.length, 0, 'second open');
  const third = launch(mods, app);
  await settle();
  assert.strictEqual(third.shown.length, 1, 'third open shows it once, not once per mod');
  assert.deepStrictEqual(third.opened, [[false, 'id:6443484']], 'Take me there opens Mod Manager on OSRS Overhaul');
  for (const mod of mods) assert.deepStrictEqual(mod.values, { 'overhaul-offer-opens': 3, 'overhaul-offer-seen': true });
  assert.deepStrictEqual(app.values, { 'osrsOverhaulOffer:overhaul-offer-opens': '3', 'osrsOverhaulOffer:overhaul-offer-seen': 'true' }, 'kept in the app storage too');
  for (let i = 0; i < 3; i++) assert.strictEqual(launch(mods, app).shown.length, 0, 'never again');
});

test('No thanks closes it for good and opens nothing', async () => {
  const mods = [storage({ 'overhaul-offer-opens': 2 })];
  const app = device();
  const run = launch(mods, app, { choice: 'cancel' });
  await settle();
  assert.strictEqual(run.shown.length, 1);
  assert.deepStrictEqual(run.opened, []);
  assert.strictEqual(launch(mods, app).shown.length, 0);
});

test('either record alone is enough to never show it again: a new account on the same device, or the same account on a new device', () => {
  assert.strictEqual(launch([storage({ 'overhaul-offer-opens': 9 })], device({ 'osrsOverhaulOffer:overhaul-offer-seen': 'true' })).shown.length, 0, 'the device remembers');
  assert.strictEqual(launch([storage({ 'overhaul-offer-opens': 9, 'overhaul-offer-seen': true })], device()).shown.length, 0, 'the account remembers');
  const fresh = storage({ 'overhaul-offer-opens': 5 });
  assert.strictEqual(launch([fresh, storage({ 'overhaul-offer-seen': true })], device()).shown.length, 0, 'another OSRS mod remembers');
  assert.strictEqual(fresh.values['overhaul-offer-seen'], true, 'and passes it on');
});

test('never shows while OSRS Overhaul is loaded, nor after it is uninstalled', async () => {
  const mods = [storage({ 'overhaul-offer-opens': 2 })];
  const app = device();
  assert.strictEqual(launch(mods, app, { overhaul: true }).shown.length, 0);
  assert.strictEqual(mods[0].values['overhaul-offer-seen'], true, 'having Overhaul counts as seen');
  assert.strictEqual(app.values['osrsOverhaulOffer:overhaul-offer-seen'], 'true');
  const later = launch(mods, app);
  await settle();
  assert.strictEqual(later.shown.length, 0, 'still nothing once Overhaul is gone');
});

test('OSRS Overhaul in the mod profile counts too, even when it is not loaded', () => {
  const mods = [storage({ 'overhaul-offer-opens': 2 })];
  assert.strictEqual(launch(mods, device(), { profile: [6443484] }).shown.length, 0);
  assert.strictEqual(mods[0].values['overhaul-offer-seen'], true);
});

test('when it cannot tell whether OSRS Overhaul is there, it does not show', async () => {
  launch([], device(), { noGame: true });
  assert.strictEqual(overhaulState(), undefined);
  const mods = [storage({ 'overhaul-offer-opens': 7 })];
  const run = launch(mods, device(), { noGame: true });
  await settle();
  assert.strictEqual(run.shown.length, 0);
});

test('when any record cannot be read or cannot save that it was seen, it does not show', async () => {
  const broken = { getItem: () => { throw new Error('locked'); }, setItem: () => { throw new Error('locked'); } };
  const cannotSave = storage({ 'overhaul-offer-opens': 2 });
  cannotSave.setItem = (key, value) => { if (key === 'overhaul-offer-seen') throw new Error('full'); cannotSave.values[key] = value; };
  const cases = [
    launch([storage({ 'overhaul-offer-opens': 2 })], broken),
    launch([storage({ 'overhaul-offer-opens': 2 }), broken], device()),
    launch([storage({ 'overhaul-offer-opens': 2 })], undefined),
    launch([undefined], device({ 'osrsOverhaulOffer:overhaul-offer-opens': '2' })),
    launch([cannotSave], device()),
  ];
  await settle();
  for (const run of cases) assert.strictEqual(run.shown.length, 0);
  assert.strictEqual(countOpen([], false, () => assert.fail('no app storage'), undefined), false);
});

test('waits for any popup already open on the login screen', async () => {
  const run = launch([storage({ 'overhaul-offer-opens': 2 })], device(), { popupOpen: true });
  await settle(10);
  assert.strictEqual(run.shown.length, 0, 'not over another popup');
  run.closePopup();
  await settle(600);
  assert.strictEqual(run.shown.length, 1);
});

test('the offer: the question, the mod, two identical stacked buttons with Take me there first, and the red warning at the bottom', () => {
  const options = offerOptions();
  assert.strictEqual(options.title, 'Want the full Old School experience?');
  assert.match(options.html, /Check out the <strong>OSRS Overhaul<\/strong> mod\./);
  assert.strictEqual(options.confirmButtonText, 'Take me there');
  assert.strictEqual(options.cancelButtonText, 'No thanks');
  assert.ok(!options.reverseButtons, 'Take me there comes first');
  assert.strictEqual(options.customClass.confirmButton, options.customClass.cancelButton, 'both buttons look the same');
  assert.match(options.customClass.actions, /flex-column/);
  assert.match(options.footer, /class="text-danger[^"]*"[^>]*>You will never see this again</);
  assert.match(options.imageUrl, /^data:image\/png;base64,/);
});

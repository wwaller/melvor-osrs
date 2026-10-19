import assert from 'node:assert';
import { test } from 'node:test';
import { movedToEnd, saveOrder, setup } from '../mod/setup.mjs';

const storage = (values = {}) => ({ values, getItem: (key) => values[key] ?? null, setItem: (key, value) => (values[key] = value) });

function playFab({ loggedIn = true, failWrite = false, keepsOld = false } = {}) {
  const cloud = {};
  return {
    cloud,
    ClientApi: {
      IsClientLoggedIn: () => loggedIn,
      UpdateUserData: ({ Data }, done) => setTimeout(() => {
        if (failWrite) return done(null, { error: 'nope' });
        if (!keepsOld) Object.assign(cloud, Data);
        done({ data: {} }, null);
      }),
      GetUserData: ({ Keys }, done) => setTimeout(() => done({ data: { Data: Object.fromEntries(Keys.filter((key) => key in cloud).map((key) => [key, { Value: cloud[key] }])) } }, null)),
    },
  };
}

function boot(order, { cloud = playFab(), prompted, choice = 'confirm', values = {} } = {}) {
  globalThis.localStorage = storage({ modLoadOrder: JSON.stringify(order), ...(prompted ? { osrsOverhaulReloadPromptedAt: String(prompted) } : {}), ...values });
  globalThis.PlayFab = cloud;
  const shown = [];
  let reloaded = false;
  globalThis.SwalLocale = { fire: async (options) => (shown.push(options), choice === 'confirm' ? { isConfirmed: true } : { isConfirmed: false, dismiss: 'cancel' }) };
  globalThis.window = { location: { reload: () => (reloaded = true) } };
  let selection = null;
  setup({ onCharacterSelectionLoaded: (fn) => (selection = fn), getResourceUrl: (path) => `blob:${path}` });
  return { shown, cloud, local: globalThis.localStorage, select: async () => { await selection?.(); await new Promise((resolve) => setTimeout(resolve, 5)); }, selection: () => selection, reloaded: () => reloaded };
}

test('Overhaul moves itself to the end of the load order, keeping everything else in order', () => {
  assert.deepStrictEqual(movedToEnd([6442829, 6443484, 6442568, 2253323]), [6442829, 6442568, 2253323, 6443484]);
  assert.strictEqual(movedToEnd([6442829, 6442568, 6443484]), null, 'already last');
  assert.strictEqual(movedToEnd([6442829, 6442568]), null, 'not in the list');
  assert.strictEqual(movedToEnd(null), null, 'no list');
  assert.deepStrictEqual(movedToEnd(['6443484', '1']), ['1', '6443484'], 'keeps the ids as Melvor stored them');
});

test('the new order goes to PlayFab, where Melvor loads it from, and to localStorage, its offline fallback', async () => {
  const local = storage();
  const cloud = playFab();
  assert.strictEqual(await saveOrder([1, 6443484], local, cloud), true);
  assert.strictEqual(cloud.cloud.modLoadOrder, '[1,6443484]');
  assert.strictEqual(local.values.modLoadOrder, '[1,6443484]');
  assert.strictEqual(await saveOrder([1, 6443484], storage(), playFab({ failWrite: true })), false, 'a failed write is not reported as saved');
  assert.strictEqual(await saveOrder([1, 6443484], storage(), playFab({ keepsOld: true })), false, 'a write that does not stick is not reported as saved');
  assert.strictEqual(await saveOrder([1, 6443484], storage(), playFab({ loggedIn: false })), true, 'offline, localStorage is what Melvor reads');
});

test('once the move is confirmed saved, character select asks for a reload that cannot be skipped', async () => {
  const run = boot([6443484, 6442829]);
  await run.select();
  assert.strictEqual(run.cloud.cloud.modLoadOrder, '[6442829,6443484]');
  assert.strictEqual(run.shown.length, 1);
  assert.strictEqual(run.shown[0].confirmButtonText, 'Reload');
  assert.strictEqual(run.shown[0].allowOutsideClick, false);
  assert.strictEqual(run.shown[0].allowEscapeKey, false);
  assert.ok(run.reloaded());
});

test('it never nags: no popup when the save did not stick, or when it already asked in the last day', async () => {
  const failed = boot([6443484, 6442829], { cloud: playFab({ keepsOld: true }) });
  await failed.select();
  assert.strictEqual(failed.shown.length, 0);
  const recent = boot([6443484, 6442829], { prompted: Date.now() - 60 * 60 * 1000 });
  await recent.select();
  assert.strictEqual(recent.shown.length, 0, 'asked an hour ago');
  assert.strictEqual(recent.cloud.cloud.modLoadOrder, '[6442829,6443484]', 'but still saved the order');
  const last = boot([6442829, 6443484]);
  assert.strictEqual(last.selection(), null, 'already last: nothing to do');
});

test('Do not show this again turns the whole thing off on this device: no popup and no moving, so a bug can never trap anyone', async () => {
  const run = boot([6443484, 6442829], { choice: 'cancel' });
  await run.select();
  assert.strictEqual(run.shown[0].cancelButtonText, 'Do not show this again');
  assert.ok(!run.reloaded(), 'no reload');
  assert.strictEqual(run.local.values.osrsOverhaulLoadOrderOff, 'true');
  const next = boot([6443484, 6442829], { values: { osrsOverhaulLoadOrderOff: 'true' } });
  assert.strictEqual(next.selection(), null, 'nothing runs');
  assert.strictEqual(next.local.values.modLoadOrder, JSON.stringify([6443484, 6442829]), 'order left alone');
});


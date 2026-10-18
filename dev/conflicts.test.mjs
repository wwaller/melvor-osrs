import assert from 'node:assert';
import { test } from 'node:test';
import { conflictOptions, newConflicts, warnAboutConflicts } from '../mod/conflicts.mjs';

const fakeDocument = {
  createElement: (tag) => ({
    tag,
    className: '',
    textContent: '',
    children: [],
    append(...parts) { this.children.push(...parts); },
  }),
};
const text = (node) => (typeof node === 'string' ? node : node.textContent + node.children.map(text).join(''));

const conflicts = [
  { mod: 'Clean UI', problem: 'is no longer receiving support.' },
  { mod: 'Other Mod', problem: 'moves the bank.' },
];

function boot(loaded, stored = {}) {
  const fired = [];
  globalThis.mod = { manager: { getLoadedModList: () => loaded } };
  globalThis.SwalLocale = { fire: (options) => fired.push(options) };
  globalThis.Swal = { isVisible: () => false };
  globalThis.document = fakeDocument;
  const ctx = {
    accountStorage: { getItem: (key) => stored[key], setItem: (key, value) => (stored[key] = value) },
    getResourceUrl: (path) => `blob:${path}`,
  };
  return { ctx, fired, stored };
}

test('only conflicting mods that are loaded and not yet warned about count, whatever their case', () => {
  assert.deepStrictEqual(newConflicts(['clean ui', 'Sounds'], [], conflicts).map((each) => each.mod), ['Clean UI']);
  assert.deepStrictEqual(newConflicts(['Clean UI', 'Other Mod'], ['Clean UI'], conflicts).map((each) => each.mod), ['Other Mod']);
  assert.deepStrictEqual(newConflicts(['Sounds'], [], conflicts), []);
});

test('each conflict is warned about once, and a conflict added later still gets its warning', () => {
  const { ctx, fired, stored } = boot(['Clean UI']);
  assert.strictEqual(warnAboutConflicts(ctx, 'Better Mobile Combat UI', conflicts), true);
  assert.strictEqual(fired.length, 1);
  assert.deepStrictEqual(stored['conflicts-seen'], ['Clean UI']);
  assert.strictEqual(warnAboutConflicts(ctx, 'Better Mobile Combat UI', conflicts), false);
  assert.strictEqual(fired.length, 1, 'not shown twice');
  globalThis.mod.manager.getLoadedModList = () => ['Clean UI', 'Other Mod'];
  warnAboutConflicts(ctx, 'Better Mobile Combat UI', conflicts);
  assert.strictEqual(fired.length, 2);
  assert.ok(!text(fired[1].html).includes('Clean UI'), 'only the new conflict is listed');
  assert.deepStrictEqual(stored['conflicts-seen'], ['Clean UI', 'Other Mod']);
});

test('the modal is titled Mod Conflict, says it comes from this mod and its author, and has no never-again footer', () => {
  const options = conflictOptions(fakeDocument, 'Better Mobile Combat UI', [conflicts[0]], 'blob:icon.png');
  assert.strictEqual(options.title, 'Mod Conflict');
  assert.strictEqual(options.imageUrl, 'blob:icon.png');
  assert.strictEqual(options.footer, undefined);
  const body = text(options.html);
  assert.match(body, /This note is from Better Mobile Combat UI by bonoetmalo, not from the mod below\./);
  assert.match(body, /Clean UI is no longer receiving support\./);
});

test('no mod list or storage means no warning', () => {
  const { ctx, fired } = boot(['Clean UI']);
  globalThis.mod = undefined;
  assert.strictEqual(warnAboutConflicts(ctx, 'Better Mobile Combat UI', conflicts), false);
  assert.strictEqual(fired.length, 0);
});

const API_VERSION = 1;
const DUE_KEY = 'next-event';
const HOUR_MS = 60 * 60 * 1000;
const MIN_GAP_HOURS = 12;
const MAX_GAP_HOURS = 36;
const MIN_START_DELAY_MS = 60 * 1000;
const MAX_START_DELAY_MS = 5 * 60 * 1000;
const CHECK_MS = 60 * 1000;
const PREVIEW_DELAY_MS = 10 * 1000;
const FONTS = {
  OsrsPlain: 'fonts/RuneScape-Plain-12.ttf',
  OsrsBold: 'fonts/RuneScape-Bold-12.ttf',
};
const CORE = ['core/overhaul.mjs', 'core/dialog.mjs', 'core/registry.mjs', 'core/api.mjs', 'core/fonts.mjs'];
const HELPERS = ['lamp.mjs', 'loot.mjs', 'outfits.mjs'];
const EVENTS = ['sandwich-lady.mjs', 'genie.mjs', 'frog.mjs', 'certer.mjs', 'pinball.mjs', 'drill-demon.mjs', 'quiz-master.mjs', 'pillory.mjs'];
const NAMESPACE = 'osrsRandomEvents';

export function nextDue(now, random = Math.random) {
  return now + (MIN_GAP_HOURS + random() * (MAX_GAP_HOURS - MIN_GAP_HOURS)) * HOUR_MS;
}

export function startDelay(random = Math.random) {
  return MIN_START_DELAY_MS + random() * (MAX_START_DELAY_MS - MIN_START_DELAY_MS);
}

export function weightedPick(events, random = Math.random) {
  const total = events.reduce((sum, event) => sum + (event.weight ?? 1), 0);
  let left = random() * total;
  for (const event of events) {
    left -= event.weight ?? 1;
    if (left < 0) return event;
  }
  return events[events.length - 1];
}

const settingName = (id) => `preview-${id.startsWith(`${NAMESPACE}:`) ? id.slice(NAMESPACE.length + 1) : id.replace(':', '-')}`;

export async function setup(ctx) {
  const [shared, dialog, registry, api, fonts, lamp, loot, outfits, ...builtIn] = await Promise.all([...CORE, ...HELPERS, ...EVENTS].map((path) => ctx.loadModule(path)));
  shared.offerOverhaul(ctx);
  shared.dropOrphanedSongs();
  ctx.loadStylesheet('core/dialog.css');
  ctx.loadStylesheet('style.css');
  fonts.loadFonts(ctx, FONTS);
  await outfits.register(ctx);
  const events = registry.createRegistry('random event', { shape: { title: 'string', available: 'function', show: 'function', weight: 'number?' } });
  for (const event of builtIn) events.register({ id: `${NAMESPACE}:${event.id}`, title: event.title, available: event.available, show: event.show });
  const media = (path) => ctx.getResourceUrl(path);
  const kit = (preview) => ({ game, dialog, lamp, loot, outfits, media, preview });
  const show = (event, preview) => event.show(kit(preview));
  const debug = ctx.settings.section('Debug');
  const previewButton = (event) => ({
    type: 'button',
    name: settingName(event.id),
    display: `Preview ${event.title} in 10 seconds`,
    color: 'secondary',
    hint: 'Shows the event 10 seconds from now, so you can go back to the game first. A preview never gives a reward.',
    onClick: () => setTimeout(() => show(event, true), PREVIEW_DELAY_MS),
  });
  let due;

  debug.add(events.list().map(previewButton));

  api.publish(ctx, API_VERSION, {
    registerEvent: (definition) => events.register(definition),
    events: () => events.list().map(({ id, title, weight }) => ({ id, title, weight: weight ?? 1 })),
    trigger(id, { preview = true } = {}) {
      const event = events.get(id);
      if (!event) throw new Error(`osrsRandomEvents: no event "${id}" is registered`);
      if (!dialog.popupOpen()) show(event, preview);
    },
    kit,
    dialog,
    on: events.on,
  });

  function check() {
    if (due === undefined || Date.now() < due || dialog.popupOpen()) return;
    due = nextDue(Date.now());
    ctx.characterStorage.setItem(DUE_KEY, due);
    const ready = events.list().filter((event) => event.available(kit(false)));
    if (ready.length) show(weightedPick(ready), false);
  }

  ctx.onModsLoaded(() => {
    const added = events.list().filter((event) => !event.id.startsWith(`${NAMESPACE}:`));
    if (added.length) debug.add(added.map(previewButton));
  });
  ctx.onCharacterLoaded(() => {
    due = ctx.characterStorage.getItem(DUE_KEY);
    if (typeof due !== 'number') {
      due = nextDue(Date.now());
      ctx.characterStorage.setItem(DUE_KEY, due);
    }
    due = Math.max(due, Date.now() + startDelay());
  });
  ctx.onInterfaceReady(() => setInterval(check, CHECK_MS));
}

const DUE_KEY = 'next-event';
const HOUR_MS = 60 * 60 * 1000;
const MIN_GAP_HOURS = 12;
const MAX_GAP_HOURS = 36;
const MIN_START_DELAY_MS = 60 * 1000;
const MAX_START_DELAY_MS = 5 * 60 * 1000;
const CHECK_MS = 60 * 1000;
const PREVIEW_DELAY_MS = 10 * 1000;
const FONTS = {
  RandomEventsPlain: 'fonts/RuneScape-Plain-12.ttf',
  RandomEventsBold: 'fonts/RuneScape-Bold-12.ttf',
};
const HELPERS = ['dialog.mjs', 'lamp.mjs', 'loot.mjs', 'outfits.mjs'];
const EVENTS = ['sandwich-lady.mjs', 'genie.mjs', 'frog.mjs', 'certer.mjs', 'pinball.mjs', 'drill-demon.mjs', 'quiz-master.mjs', 'pillory.mjs'];

export function nextDue(now, random = Math.random) {
  return now + (MIN_GAP_HOURS + random() * (MAX_GAP_HOURS - MIN_GAP_HOURS)) * HOUR_MS;
}

export function startDelay(random = Math.random) {
  return MIN_START_DELAY_MS + random() * (MAX_START_DELAY_MS - MIN_START_DELAY_MS);
}

export async function setup(ctx) {
  const shared = await ctx.loadModule('overhaul.mjs');
  shared.offerOverhaul(ctx);
  shared.dropOrphanedSongs();
  ctx.loadStylesheet('style.css');
  loadFonts(ctx);
  const [dialog, lamp, loot, outfits, ...events] = await Promise.all([...HELPERS, ...EVENTS].map((path) => ctx.loadModule(path)));
  await outfits.register(ctx);
  const media = (path) => ctx.getResourceUrl(path);
  const kit = (preview) => ({ game, dialog, lamp, loot, outfits, media, preview });
  const show = (event, preview) => event.show(kit(preview));
  let due;

  ctx.settings.section('Debug').add(events.map((event) => ({
    type: 'button',
    name: `preview-${event.id}`,
    display: `Preview ${event.title} in 10 seconds`,
    color: 'secondary',
    hint: 'Shows the event 10 seconds from now, so you can go back to the game first. A preview never gives a reward.',
    onClick: () => setTimeout(() => show(event, true), PREVIEW_DELAY_MS),
  })));

  function check() {
    if (due === undefined || Date.now() < due || dialog.popupOpen()) return;
    due = nextDue(Date.now());
    ctx.characterStorage.setItem(DUE_KEY, due);
    const ready = events.filter((event) => event.available(kit(false)));
    if (ready.length) show(ready[Math.floor(Math.random() * ready.length)], false);
  }

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

async function loadFonts(ctx) {
  for (const [family, path] of Object.entries(FONTS)) {
    try {
      const face = new FontFace(family, await ctx.getResourceBlob(path).arrayBuffer());
      document.fonts.add(await face.load());
    } catch (error) {
      console.error(`[OSRS Random Events] font ${family}`, error);
    }
  }
}

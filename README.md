# Melvor OSRS

Melvor Idle mods that bring Old School RuneScape into Melvor, plus a handful of quality-of-life mods. The OSRS mods share a set of core modules and each one publishes an API, so other mods can add their own quests, random events, sounds, art, talking heads and animations.

## The mods

| Folder | Mod | Namespace | What it does |
| --- | --- | --- | --- |
| `theme` | Old School Runescape UI Theme | `osrsTheme` | OSRS stone interface, fonts, skill stones in the sidebar, hitsplats |
| `art` | Old School Runescape Art | `osrsSprites` | OSRS sprites for items, monsters, prayers, spells and skills |
| `character` | Old School Runescape Character Viewer | `osrsCharacter` | Your character as an OSRS 3D model, with skilling and combat animations, and OSRS monsters in combat |
| `sounds` | Old School Runescape Sounds | `osrsSounds` | OSRS music and sound effects |
| `quests` | Old School Runescape Quests | `osrsQuests` | OSRS quests, talking heads and a quest scripting framework |
| `random-events` | Old School Runescape Random Events | `osrsRandomEvents` | The Genie, the Sandwich lady and other OSRS random events |
| `overhaul` | Old School Runescape Overhaul | `osrsOverhaul` | Installs the OSRS mods together and keeps itself last in the load order |
| `active-first` | Active Skill Card First | `activeFirst` | The skill card in use moves to the front of its list |
| `better-mobile-combat-ui` | Better Mobile Combat UI | `betterMobileCombatUI` | Start Last Target and Jump To Last buttons, and tidier combat area cards on phones |
| `idle-guard` | Idle Guard | `idleGuard` | Locks you out of the game for a set time, from the sidebar |
| `keep-screen-on` | Keep Screen On | `keepScreenOn` | Stops the screen dimming while a skill or combat is running |
| `mobile-shop` | Better Mobile Shop UI | `mobileShop` | Tap a shop card to open it, with a remembered grid of category buttons |
| `quick-equip-all` | Quick Equip All | `quickEquipAll` | Lists every bank item that fits an equipment slot |
| `skill-switcher` | Quick Skill Switcher | `skillSwitcher` | A bottom bar for switching between your active skills |
| `unlearned-skills` | Hide Unlearned Skills | `unlearnedSkills` | Locked skills move to their own sidebar section |

## Layout

```
core/          shared modules, copied into each mod that lists them
core/test/     tests for the core modules, and the fake DOM the mods' tests share
tools/         core.py (copies core modules), osrs.py (build helpers), test.sh (runs every test)
<mod>/mod/     what ships to mod.io: manifest.json, setup.mjs and the mod's files
<mod>/build/   build.py, which fetches assets and zips mod/ into <mod>/dist/
<mod>/dev/     tests and preview tools
<mod>/core.json  the core modules this mod bundles
```

## Building and testing

```sh
python3 <mod>/build/build.py   # builds one mod into <mod>/dist/
python3 tools/core.py          # copies core modules into every mod (builds do this themselves)
tools/test.sh                  # runs the core tests and every mod's tests
```

Builds cache what they download under `<mod>/build/.cache/`. The Character Viewer and Sounds builds read the Art mod's build output, so build `art` first on a fresh checkout.

## Core modules

Melvor serves each file of a mod separately, so a mod's modules cannot import one another. The core modules are written to stand alone, each mod lists the ones it uses in `core.json`, and `tools/core.py` copies them into `<mod>/mod/core/` at build time. Every zip stays self-contained and players never install a library mod. The copies are generated, so edit `core/`, never `<mod>/mod/core/`.

| Module | Provides |
| --- | --- |
| `dialog.mjs`, `dialog.css` | The OSRS chat box and a scripted conversation engine: NPC and player lines, item boxes, option menus, branches, jumps and custom widgets |
| `registry.mjs` | Registries keyed by `namespace:name` ids that check definitions, plus a small event emitter |
| `api.mjs` | `publish` for a mod's public API, and `find` and `whenLoaded` for using another mod's |
| `fonts.mjs` | Loads the RuneScape fonts as `OsrsPlain`, `OsrsBold` and `OsrsQuill` |
| `overhaul.mjs` | The Overhaul offer, cleanup of downloaded songs, the 7-day debug history and close-on-outside-click |

## Extending the mods

Every OSRS mod publishes an API on `mod.api.<namespace>`. They follow the same rules:

- Use them from `ctx.onModsLoaded`, once every mod has run its setup, and check they exist, since players choose which mods to install.
- Each API has a `version`. New calls raise it; nothing is removed without raising it.
- Anything you add has an id of the form `yourNamespace:name`.
- Every `register` or `set` call returns a function that undoes it.
- Definitions are checked when you add them, and a mistake throws an error that names the problem.

```js
export function setup(ctx) {
  ctx.onModsLoaded(() => {
    const quests = mod.api.osrsQuests;
    const events = mod.api.osrsRandomEvents;
    if (quests) quests.registerNpc({ id: 'myMod:sheep', name: 'Sheep', chathead: ctx.getResourceUrl('img/sheep.png') });
    if (events) events.registerEvent({ id: 'myMod:sheep', title: 'the Sheep', weight: 0.5, available: () => true, show: (kit) => { /* ... */ } });
  });
}
```

### Quests: `mod.api.osrsQuests`

Register whole quests with stages, a journal, talking heads, dialogue scripts with options and branches, game triggers, requirements and rewards, and get the Quest Complete scroll for free. Eighty-seven OSRS talking heads and forty-two quest items come built in. [quests/README.md](quests/README.md) has the full scripting reference and a complete example quest.

```js
quests.talk([
  { npc: 'osrsQuests:wise_old_man', say: 'Hello, {player}. Lovely day for it.' },
  { options: { 'It is.': [{ player: 'It is.' }], 'Goodbye.': [] } },
]);
```

### Random events: `mod.api.osrsRandomEvents`

`registerEvent({ id, title, available(kit), show(kit), weight })` adds an event to the roughly-daily draw and a Debug preview button. `weight` makes it more or less likely (default 1). `kit` holds `game`, `preview` (true for previews, which must not give rewards), `dialog` (the core dialogue module), `loot` (`grant`, `gift`, `gems`, `foods`) and `lamp`. `trigger(id)` shows one now, `events()` lists them.

### Sounds: `mod.api.osrsSounds`

`playEffect(url, { category })` and `playJingle(url)` play through the player's OSRS Sounds volume and switches. `category` is one of `categories`, such as `combat` or `skilling`; leave it out to follow only the main switch. `setSound(kind, id, url)` gives your own content a sound, where `kind` is `monsterDeath`, `enemyAttack`, `spell`, `skill`, `recipeCategory` or `prayer`. Enemy special attacks play their sound once, on the first hit.

### Art: `mod.api.osrsSprites`

`setArt(target, url)` gives anything OSRS art while the mod's art is on. `target` is a Melvor media path such as `assets/media/bank/egg.png`, or your own object's id such as `myMod:Strange_Egg`. `artFor(object)` returns the art in use for a Melvor object, or null.

### Character Viewer: `mod.api.osrsCharacter`

`chathead()` resolves to a PNG of the player's own 3D head, in their current gear and looks, framed like an OSRS chathead; the Quests mod uses it for the player's lines. `registerSkillPose(skillId, pose)` picks the OSRS animation shown while your skill is active, either a pose id or a function of the skill; `poses` names common ones and `availablePoses()` lists every bundled one. `hasMonsterModel(monsterId)` says whether a monster fights as a 3D model.

### Theme: `mod.api.osrsTheme`

The theme's textures are CSS variables on the page root, so your own CSS can use them directly: `background: var(--osrs-stone)`. `textures()` returns the same URLs to scripts, `fonts` lists the RuneScape font families it loads, and `features()` lists the `osrs-` classes for the theme options that are on.

### Dialogue in any mod

The chat box is also usable on its own. With OSRS Quests installed, `mod.api.osrsQuests.talk(script)` plays a script with all the talking heads. Without it, bundle `core/dialog.mjs` and `core/dialog.css` in your own mod and call `dialog.converse(script, { speakers, player })`.

## Testing in Melvor

Upload a built zip from `<mod>/dist/` in Melvor's Creator Toolkit (Local Mods, then Add), and reload the game. A local mod cannot share a namespace with the same mod installed from mod.io, so test a changed copy of an installed mod with the mod.io copy turned off in the Mod Manager.

The sprites, models, sounds and fonts are Jagex's and RuneStar's, fetched from the OSRS Wiki and GitHub at build time, so keep built zips private.

# Melvor OSRS Sprites

Melvor Idle mod that swaps item, monster, prayer, spell, skill, and GP art for Old School RuneScape sprites from the OSRS wiki. Anything without a real OSRS counterpart keeps its Melvor art.

## How it works

- `build/build.py` reads Melvor's data packages, matches names against the OSRS wiki's infobox tables (`naming.py` rewrites plus `overrides.json`), downloads the sprites, and writes `mod/sprites/`, `mod/mapping.json`, `build/report.md`, and `dist/melvor-osrs-sprites.zip`.
- `mod/setup.mjs` patches `NamespacedObject.getMediaURL`, which every base-game object uses to resolve its image, so mapped paths return the bundled sprite.
- Item, prayer, spell, and skill sprites are nearest-neighbor upscaled to stay crisp. Monsters use the infobox render, fit to 256px.

## Usage

```sh
python3 build/build.py              # build sprites + mapping (cached; --refresh to refetch)
python3 dev/install.py              # hook into the Steam client for local testing
python3 dev/install.py --uninstall  # restore the original Steam files
```

Restart Melvor after building or installing. `dev/install.py` adds a loader to the Steam wrapper's `index.html` that injects `mod/setup.mjs` into the game on every load, reading sprites from this repo. Steam updates or "verify integrity" undo it; re-run the install. Each load writes a self-check to `dev/last-run.json` and a trace to `dev/loader.log`.

`dist/melvor-osrs-sprites.zip` is the regular mod package for Creator Toolkit or a private mod.io upload. Keep it private, since the sprites are Jagex art.

## Tuning matches

`build/report.md` lists every match and every unmatched base-game entity. To fix one, add its Melvor id to `build/overrides.json` under its kind: an OSRS item/monster/spell name, a `File:...png` title, or `null` to keep the Melvor art.

## Guessing pass and review

Base-game images with no real OSRS counterpart went through a reviewed guessing pass. `build/todo.py` exports what is still unmatched, `build/review_page.py` builds the review page from the guesses, and `build/apply_review.py <decisions.json>` writes approved picks to `build/guesses.json`. Hand edits in `overrides.json` win over `guesses.json`.

Override values can also describe composite art built from OSRS sprites:
- `{"base": "File:A.png", "label": "II"}` stamps a tier numeral in the OSRS stack-count style (tier families sharing one image get this automatically)
- `{"base": "File:Fire.png", "badge": "File:Oak logs.png"}` badges an item sprite onto a render
- `{"row": ["File:Oak tree.png", "File:Willow tree.png"]}` lines renders up side by side
- `{"base": "File:Stone tablet (The Dig Site).png", "inset": "File:Wolf.png"}` sets a creature onto a tablet

## Tests

```sh
python3 -m unittest discover -s build
node --test dev/loader.test.js
```

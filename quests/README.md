# Old School Runescape Quests

Melvor Idle mod that adds OSRS-style quests: talking heads, "Select an Option" menus, a quest journal that strikes through what you have done, a quest list with quest points, and the parchment Quest Complete scroll with its jingle. It ships with one quest, Imp Catcher, and a scripting framework any mod can use to add more.

Namespace `osrsQuests`. Optional partners: with the OSRS Character Viewer installed, your own 3D head appears next to your lines of dialogue; with OSRS Sounds installed, the quest jingle plays through its volume settings.

## Playing

The Quests section in the sidebar opens the quest list. Names are red before you start, yellow in progress and green when done, with your quest points at the top. Pick a quest to read its journal, and use the Talk buttons there to speak to the people involved. In a conversation, click or press Space to continue, and click an option or press its number to choose it.

Imp Catcher: Wizard Mizgog's rival, Wizard Grayzag, set imps loose in the Wizard Tower and they took Mizgog's four magical beads. Start it by talking to Mizgog, then fight anything in the Wizard Tower combat area; fleeing imps drop the beads. Bring all four back for an amulet of accuracy, 875 Magic XP and a quest point.

## Writing a quest

Another mod registers a quest once every mod has loaded. This is a complete, working quest:

```js
export function setup(ctx) {
  ctx.onModsLoaded(() => {
    const quests = mod.api.osrsQuests;
    if (!quests) return;
    quests.registerQuest({
      id: 'myMod:cooks_assistant',
      name: 'Cook\'s Assistant',
      difficulty: 'Novice',
      length: 'Short',
      questPoints: 1,
      cast: { cook: 'osrsQuests:cook' },
      requirements: [{ skill: 'melvorD:Cooking', level: 5 }],
      rewards: { xp: [['melvorD:Cooking', 300]], gp: 500, lines: ['Permission to use the range'] },
      stages: {
        start: {
          journal: ['I can start this quest by speaking to the *Cook*.'],
          talk: {
            cook: [
              { npc: 'cook', say: 'What am I to do?' },
              {
                options: {
                  'What\'s wrong?': [
                    { player: 'What\'s wrong?' },
                    { npc: 'cook', say: 'I need an egg for the Duke\'s cake, and I haven\'t got one!' },
                    { do: (q) => q.setStage('egg') },
                  ],
                  'Nothing, goodbye.': [{ player: 'Nothing, goodbye.' }],
                },
              },
            ],
          },
        },
        egg: {
          journal: (q) => [
            'The *Cook* needs an *egg* for the Duke\'s birthday cake.',
            { text: 'Find an egg', done: q.has('osrsQuests:Egg') },
          ],
          talk: {
            cook: (q) => q.has('osrsQuests:Egg')
              ? [
                { player: 'I have an egg for you.' },
                { item: 'osrsQuests:Egg', say: 'You hand over the egg.' },
                { do: (q) => { q.take('osrsQuests:Egg'); q.complete(); } },
              ]
              : [{ npc: 'cook', say: 'Have you found an egg yet, {player}?' }],
          },
          on: {
            skillAction({ skill }, q) {
              if (skill.id === 'melvorD:Thieving' && !q.has('osrsQuests:Egg') && q.random() < 0.1) {
                q.give('osrsQuests:Egg');
                q.notify('You find an egg!', 'cook');
              }
            },
          },
        },
      },
    });
  });
}
```

### Quest fields

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | `yourNamespace:name`, unique across all mods |
| `name` | yes | Shown in the quest list, journal and Quest Complete scroll |
| `stages` | yes | Stage name to stage. Must include `start`; `done` is reserved |
| `difficulty`, `length` | no | Shown under the journal title, for example `Novice` and `Short` |
| `questPoints` | no | Added to the player's total when the quest is completed |
| `series` | no | Quests with a series are grouped under that heading in the quest list |
| `cast` | no | Short names for the talking heads in this quest, for example `{ cook: 'osrsQuests:cook' }` |
| `requirements` | no | Needed before the `start` stage's talk buttons unlock |
| `rewards` | no | Given by `q.complete()` and listed on the Quest Complete scroll |

### Stages

A quest is always in one stage. It begins in `start` and ends in `done` once `q.complete()` runs. Move between stages with `q.setStage(name)`. Each stage can have:

- `journal`: lines for the journal, as an array or a function of the quest handle. A line is a string or `{ text, done }`. Text between asterisks is highlighted the way OSRS highlights names and items: `*Wizard Mizgog*`. The `start` journal shows only before the quest begins; after that, the journal shows every stage reached so far in the order they are written, with earlier stages struck through.
- `talk`: cast name to dialogue script, or to a function of the quest handle that returns a script. Each one becomes a "Talk to" button in the journal.
- `on`: triggers that run while the quest is in this stage (see below).

### Dialogue scripts

A script is an array of steps. Text can use `{player}` for the player's name, and any value can be a function of the quest handle instead.

| Step | Shows |
| --- | --- |
| `{ npc: 'cook', say: 'Hello.' }` | The NPC's chathead and name on the left. `say` may be an array, one page per entry |
| `{ player: 'Hi.' }` | The player's name, and 3D chathead with the Character Viewer, on the right |
| `{ item: 'melvorD:Egg', say: 'You hand over the egg.' }` | The item's picture instead of a chathead |
| `{ text: 'Nothing interesting happens.' }` | A message with no speaker |
| `{ options: { 'Yes.': [...], 'No.': [...] }, title: 'Select an Option' }` | An OSRS options menu. Use the array form `[{ label, then, if }]` to hide an option until `if` is true |
| `{ if: (q) => ..., then: [...], else: [...] }` | Branches |
| `{ label: 'menu' }` and `{ goto: 'menu' }` | Jumps, for menus that come back round |
| `{ do: (q) => ... }` | Runs code, such as `q.setStage`, `q.give` or `q.complete` |
| `{ call: (q) => [...] }` | Runs a script built at that moment |
| `{ widget: (q, done) => element }` | Shows your own element in place of the chat box until you call `done()` |
| `{ poof: true }` | The current speaker vanishes in a puff of smoke |
| `{ wait: 500 }` | Pauses for that many milliseconds |
| `{ end: value }` | Ends the conversation |

Scripts are checked when they run: a `goto` to a missing label, a step the engine does not know, or a label used twice fails with a message naming the problem.

### The quest handle

Every function in a quest receives the quest handle, `q`:

| Member | Does |
| --- | --- |
| `q.stage`, `q.status` | The current stage name, and `not-started`, `in-progress` or `completed` |
| `q.setStage(name)` | Moves to another stage. Leaving `start` counts as starting the quest |
| `q.complete()` | Gives the rewards and shows the Quest Complete scroll once any conversation closes |
| `q.get(key)`, `q.set(key, value)`, `q.data` | Small saved values for this quest and character |
| `q.has(id, n)`, `q.count(id)`, `q.give(id, n)`, `q.take(id, n)` | The bank |
| `q.level(skillId)`, `q.xp(skillId, amount)`, `q.gp(amount)` | Skills and gold |
| `q.notify(text, castName or url)` | A toast with a chathead or picture |
| `q.talk(castName)`, `q.say(script)` | Start a conversation from code |
| `q.random()`, `q.pick(list)` | Randomness, replaceable in tests |
| `q.player.name`, `q.game` | The player's name and Melvor's `game` |

### Triggers

| Trigger | Receives |
| --- | --- |
| `monsterKilled` | `{ monster, area }` |
| `monsterSpawned` | `{ monster, area }` |
| `skillAction` | `{ skill, event }` |
| `levelUp` | `{ skill, level, previousLevel }` |
| `itemAdded` | `{ item, quantity }` |

A trigger that throws is logged and does not stop other quests hearing the event. An unknown trigger name is rejected when the quest is registered.

### Requirements and rewards

Requirements are any of `{ skill, level }`, `{ quest }` (completed), `{ questPoints }` or `{ label, check: (game) => boolean }`. The journal lists them, struck through once met.

Rewards are `{ xp: [[skillId, amount]], items: [[itemId, quantity]], gp, lines: ['extra text'], image: itemId or url, grant: (q) => {} }`. Quest points come from the quest's `questPoints`.

## Talking heads and items

Every talking head below is registered as `osrsQuests:<name>`, for any quest or conversation to use:

`wizard_mizgog`, `wizard_grayzag`, `wizard_traiborn`, `archmage_sedridor`, `aubury`, `duke_horacio`, `cook`, `fred_the_farmer`, `romeo`, `juliet`, `father_lawrence`, `apothecary`, `father_aereck`, `father_urhney`, `restless_ghost`, `doric`, `veronica`, `professor_oddenstein`, `ernest`, `lady_keli`, `prince_ali`, `leela`, `osman`, `ned`, `aggie`, `morgan`, `dr_harlow`, `sir_prysin`, `captain_rovin`, `aris`, `reldo`, `thurgo`, `squire`, `sir_vyvin`, `redbeard_frank`, `wydin`, `luthas`, `oziach`, `guildmaster`, `hetty`, `bob`, `hans`, `gertrude`, `shilop`, `wilough`, `sir_amik_varze`, `king_roald`, `imp`, `general_bentnoze`, `general_wartface`, `man`, `woman`, `guard`, `monk`, `gnome`, `gnome_child`, `dwarf`, `drunken_dwarf`, `tramp`, `charlie_the_tramp`, `katrine`, `straven`, `weaponsmaster`, `turael`, `vannaka`, `mazchna`, `chaeldar`, `nieve`, `duradel`, `mysterious_old_man`, `lumbridge_guide`, `wise_old_man`, `sir_tiffy_cashien`, `postie_pete`, `evil_bob`, `party_pete`, `diango`, `thessalia`, `horvik`, `zaff`, `lowe`, `gerrant`, `wayne`, `valaine`, `scavvo`, `zeke`, `ranael`

Add your own with `registerNpc({ id: 'myMod:sheep', name: 'Sheep', chathead: ctx.getResourceUrl('sheep.png') })`.

Every quest item below is a real Melvor item, `osrsQuests:<name>`, with its OSRS picture and examine text. They stay out of completion and the item log:

`Red_bead`, `Yellow_bead`, `Black_bead`, `White_bead`, `Egg`, `Bucket_of_milk`, `Pot_of_flour`, `Ball_of_wool`, `Rope`, `Ghostspeak_amulet`, `Ghosts_skull`, `Cadava_berries`, `Fish_food`, `Pressure_gauge`, `Rubber_tube`, `Oil_can`, `Bronze_wire`, `Soft_clay`, `Pink_skirt`, `Wig`, `Paste`, `Beer`, `Yellow_dye`, `Blue_dye`, `Red_dye`, `Silverlight`, `Map_part_Thalzar`, `Map_part_Lozar`, `Map_part_Melzar`, `Redberry_pie`, `Unblessed_symbol`, `Holy_symbol`, `Dwarven_stout`, `Eye_of_newt`, `Wizards_mind_bomb`, `Rat_poison`, `Research_package`, `Air_talisman`, `Strange_potion`, `Cake`, `Ashes`, `Clue_scroll_beginner`

Items for your own quests go in your mod's own game data package, like any Melvor item.

## API

`mod.api.osrsQuests`, version 1:

| Call | Does |
| --- | --- |
| `registerQuest(definition)` | Adds a quest. Returns a function that removes it again |
| `registerNpc({ id, name, chathead })` | Adds a talking head |
| `npc(id)`, `npcs()` | Looks up talking heads |
| `quest(id)`, `quests()` | Status of quests: `{ id, name, status, stage, questPoints, difficulty, length, series }` |
| `questPoints()` | The player's quest points |
| `talk(script, { speakers })` | Plays any dialogue script, outside a quest too |
| `startQuestConversation(questId, castName)` | Same as pressing a Talk button |
| `openQuestList()`, `openJournal(questId)` | Opens the quest screens |
| `libraryItems()` | The ids of the built-in quest items |
| `on(event, listener)` | `questStarted`, `stageChanged`, `questCompleted` and `questReset`. Returns a function that stops listening |
| `triggers` | The trigger names quests can use |
| `dialog` | The shared dialogue module, for your own chat boxes |

## Building

```sh
python3 build/build.py
```

It fetches the chatheads, item sprites, quest icons, jingles and RuneScape fonts from the OSRS Wiki into `mod/`, writes `mod/library.json` and packages `dist/melvor-osrs-quests.zip`. The NPCs and items come from `build/catalog.py`; one missing from the wiki is skipped and named in the build output. Tests: `node --test dev/quests.test.mjs`, or `tools/test.sh` from the repository root.

const SHIELD = 'osrsQuests:Anti_dragon_shield';
const PIECES = [
  ['osrsQuests:Map_part_Melzar', 'Melzar the Mad\'s maze, where the undead of the *Graveyard* guard it', ['melvorD:Graveyard', 'melvorD:Undead_Graveyard'], null],
  ['osrsQuests:Map_part_Thalzar', 'the frozen wastes of the *Icy Hills*', ['melvorD:Icy_Hills'], null],
  ['osrsQuests:Map_part_Lozar', 'a goblin called Wormbrain, hiding in the *Golbin Village*', ['melvorD:Goblin_Village'], 'melvorD:Golbin'],
];
const DRAGONS = ['melvorD:Dragon_Valley', 'melvorF:Dragons_Den'];
const PIECE_CHANCE = 0.15;

const pieces = (q) => PIECES.filter(([item]) => q.has(item)).length;

export const quest = {
  id: 'osrsQuests:dragon_slayer',
  name: 'Dragon Slayer I',
  difficulty: 'Experienced',
  length: 'Long',
  questPoints: 2,
  requirements: [{ questPoints: 15 }],
  cast: { guildmaster: 'osrsQuests:guildmaster', oziach: 'osrsQuests:oziach', duke: 'osrsQuests:duke_horacio', ned: 'osrsQuests:ned' },
  rewards: { xp: [['melvorD:Strength', 18650], ['melvorD:Defence', 18650]], items: [['melvorD:Rune_Platebody', 1]], lines: ['The right to wear a rune platebody'], image: 'melvorD:Rune_Platebody' },
  stages: {
    start: {
      journal: ['I can start this quest by speaking to the *Guildmaster* in the *Champions\' Guild*.'],
      talk: {
        guildmaster: [
          { npc: 'guildmaster', say: 'Greetings!' },
          { player: 'Can I have a quest?' },
          { npc: 'guildmaster', say: ['Aha! Yes! A mighty and perilous quest fit only for the most powerful champions!', 'You will want a rune platebody to survive it, and only one man sells them: Oziach, in Edgeville. Go and speak to him.'] },
          { do: (q) => q.setStage('oziach') },
        ],
      },
    },
    oziach: {
      journal: ['The *Guildmaster* told me to speak to *Oziach* in *Edgeville* about buying a *rune platebody*.'],
      talk: {
        oziach: [
          { npc: 'oziach', say: 'Aye, \'tis a fair day my friend.' },
          { player: 'Can you sell me a rune platebody?' },
          { npc: 'oziach', say: ['So, how does thee know Oziach has rune platebodies? Prove thyself worthy first.', 'Slay the dragon Elvarg, who rules the isle of Crandor, and I\'ll sell thee one.'] },
          { do: (q) => q.setStage('map') },
        ],
      },
    },
    map: {
      journal: (q) => [
        '*Oziach* will only sell me a *rune platebody* if I slay *Elvarg*, the dragon of *Crandor*.',
        'The *Guildmaster* says the map to Crandor was split into three pieces:',
        ...PIECES.map(([item, where]) => ({ text: `One held by ${where}`, done: q.has(item) })),
        { text: 'Ask *Duke Horacio* for an *anti-dragon shield*', done: q.has(SHIELD) },
        pieces(q) === PIECES.length ? 'I have the whole map. *Ned* in *Draynor* might sail me to Crandor.' : null,
      ],
      talk: {
        guildmaster: [
          { player: 'Where can I find the map to Crandor?' },
          { npc: 'guildmaster', say: ['The map was torn into three pieces, held by the three adventurers who fled Crandor: Melzar the Mad, Thalzar and Lozar.', 'Melzar\'s piece is in his maze, where the undead roam. Thalzar hid his in the frozen north. And Lozar\'s was stolen by a goblin called Wormbrain.', 'And speak to the Duke of Lumbridge. He keeps shields that protect against dragonfire.'] },
        ],
        duke: [
          { npc: 'duke', say: 'Greetings. Welcome to my castle.' },
          {
            if: (q) => q.has(SHIELD),
            then: [{ player: 'Thanks for the shield.' }, { npc: 'duke', say: 'Take care with that dragon, adventurer.' }],
            else: [
              { player: 'I seek a shield that will protect me from dragonbreath.' },
              { npc: 'duke', say: 'A knight going on a dragon quest, hmm? What dragon do you intend to slay? Elvarg! Brave soul. Here, take this shield.' },
              { do: (q) => q.give(SHIELD) },
              { item: SHIELD, say: 'The Duke hands you an anti-dragon shield.' },
            ],
          },
        ],
        ned: [
          { npc: 'ned', say: 'Why, hello there, lad. Me friends call me Ned. I was a man of the sea, but it\'s past me now.' },
          {
            if: (q) => pieces(q) === PIECES.length,
            then: [
              { player: 'Will you take me to Crandor? I have the whole map.' },
              { npc: 'ned', say: 'Crandor? Why, that\'d be one last great adventure for me! Give me the map and we\'ll set sail.' },
              { do: (q) => PIECES.forEach(([item]) => q.take(item)) },
              { text: 'You hand Ned the three pieces of the map. Before long, the isle of Crandor rises out of the mist, and a green dragon circles overhead.' },
              { do: (q) => q.setStage('elvarg') },
            ],
            else: [{ player: 'I\'m looking for a ship to Crandor.' }, { npc: 'ned', say: 'Without a map, lad? You\'ll never find it. Come back when you know the way.' }],
          },
        ],
      },
      on: {
        monsterKilled({ monster, area }, q) {
          for (const [item, , areas, only] of PIECES) {
            if (!areas.includes(area?.id) || (only && monster?.id !== only) || q.has(item) || q.random() >= PIECE_CHANCE) continue;
            q.give(item);
            q.notify(`You find a piece of the map to Crandor! (${pieces(q)}/${PIECES.length})`, item);
          }
        },
      },
    },
    elvarg: {
      journal: (q) => [
        '*Ned* sailed me to *Crandor*. Somewhere on the isle, *Elvarg* awaits.',
        { text: 'Slay *Elvarg*, who nests with the green dragons of *Dragon Valley*, with an *anti-dragon shield* in my bank', done: q.has(SHIELD) },
      ],
      on: {
        monsterKilled({ monster, area }, q) {
          if (monster?.id !== 'melvorD:GreenDragon' || !DRAGONS.includes(area?.id)) return;
          if (!q.has(SHIELD)) {
            q.notify('Elvarg\'s fiery breath drives you back! You need an anti-dragon shield.', 'oziach');
            return;
          }
          q.notify('With a final blow, Elvarg crashes to the ground. The dragon of Crandor is slain!', 'oziach');
          q.setStage('return');
        },
      },
    },
    return: {
      journal: ['I have slain *Elvarg*! I should tell *Oziach* in *Edgeville*.'],
      talk: {
        oziach: [
          { player: 'I have slain the dragon Elvarg!' },
          { npc: 'oziach', say: ['Thou hast slain Elvarg? Then thou art truly a champion!', 'I\'ll sell thee a rune platebody, as promised. Wear it with pride, friend.'] },
          { do: (q) => q.complete() },
        ],
      },
    },
  },
};

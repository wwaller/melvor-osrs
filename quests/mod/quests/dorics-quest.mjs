const ORES = [['melvorD:Tin_Ore', 6, 'tin ore'], ['melvorD:Copper_Ore', 4, 'copper ore'], ['melvorD:Iron_Ore', 2, 'iron ore']];

const short = (q) => ORES.filter(([item, count]) => !q.has(item, count));
const list = (words) => (words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : words[0]);

export const quest = {
  id: 'osrsQuests:dorics_quest',
  name: 'Doric\'s Quest',
  difficulty: 'Novice',
  length: 'Short',
  questPoints: 1,
  cast: { doric: 'osrsQuests:doric' },
  rewards: { xp: [['melvorD:Mining', 1300]], gp: 180, lines: ['Use of Doric\'s anvils'], image: 'melvorD:Iron_Ore' },
  stages: {
    start: {
      journal: ['I can start this quest by speaking to *Doric*, who is *north of Falador*.', 'There are no requirements for this quest.'],
      talk: {
        doric: [
          { npc: 'doric', say: 'Hello traveller, what brings you to my humble smithy?' },
          {
            options: [
              {
                label: 'I wanted to use your anvils.',
                then: [
                  { player: 'I wanted to use your anvils.' },
                  { npc: 'doric', say: ['My anvils get enough work with my own use. I make pickaxes, and it takes a lot of hard work.', 'If you could get me some more materials, then I could let you use them. I need 6 tin ore, 4 copper ore and 2 iron ore.'] },
                  {
                    options: {
                      'Yes, I will get you the materials.': [
                        { player: 'Yes, I will get you the materials.' },
                        { npc: 'doric', say: 'Clay is what I use more than anything... but tin will do nicely these days. Bring it all to me.' },
                        { do: (q) => q.setStage('ores') },
                      ],
                      'No, hitting rocks is for the boring people, sorry.': [{ player: 'No, hitting rocks is for the boring people, sorry.' }, { npc: 'doric', say: 'That is your choice. Nice to meet you anyway.' }],
                    },
                  },
                ],
              },
              { label: 'Mind your own business, shortstuff!', then: [{ player: 'Mind your own business, shortstuff!' }, { npc: 'doric', say: 'How nice to meet someone with such pleasant manners. Do come again when you need to shout at someone smaller than you!' }] },
            ],
          },
        ],
      },
    },
    ores: {
      journal: (q) => [
        '*Doric* will let me use his anvils if I bring him these materials:',
        ...ORES.map(([item, count, name]) => ({ text: `${count} *${name}*`, done: q.has(item, count) })),
        short(q).length ? null : 'I have everything. I should take it to *Doric*.',
      ],
      talk: {
        doric: [
          { npc: 'doric', say: 'Have you got my materials yet, traveller?' },
          {
            if: (q) => short(q).length === 0,
            then: [
              { player: 'I have everything you need.' },
              { do: (q) => ORES.forEach(([item, count]) => q.take(item, count)) },
              { text: 'You hand over the ore.' },
              { npc: 'doric', say: 'Many thanks. Pass me your bag and I\'ll put in a bit extra for your trouble. Use my anvils whenever you like.' },
              { do: (q) => q.complete() },
            ],
            else: [
              { player: 'Not yet.' },
              { npc: 'doric', say: (q) => `Well, hurry up! I still need the ${list(short(q).map(([, count, name]) => `${count} ${name}`))}.` },
            ],
          },
        ],
      },
    },
  },
};

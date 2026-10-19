const GAUGE = 'osrsQuests:Pressure_gauge';
const TUBE = 'osrsQuests:Rubber_tube';
const OIL = 'osrsQuests:Oil_can';
const PARTS = [[GAUGE, 'pressure gauge'], [TUBE, 'rubber tube'], [OIL, 'oil can']];
const GRAVEYARDS = ['melvorD:Graveyard', 'melvorD:Undead_Graveyard'];
const PART_CHANCE = 0.12;
const TUBE_CHANCE = 0.25;

const missing = (q) => PARTS.filter(([item]) => !q.has(item));
const list = (words) => (words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : words[0]);

function find(q, item, chance, text) {
  if (q.has(item) || q.random() >= chance) return;
  q.give(item);
  q.notify(text, item);
}

export const quest = {
  id: 'osrsQuests:ernest_the_chicken',
  name: 'Ernest the Chicken',
  difficulty: 'Novice',
  length: 'Short',
  questPoints: 4,
  cast: { veronica: 'osrsQuests:veronica', oddenstein: 'osrsQuests:professor_oddenstein', ernest: 'osrsQuests:ernest' },
  rewards: { items: [['melvorD:Feathers', 300]], gp: 300, image: 'melvorD:Feathers' },
  stages: {
    start: {
      journal: ['I can start this quest by speaking to *Veronica* outside *Draynor Manor*.', 'There are no requirements for this quest.'],
      talk: {
        veronica: [
          { npc: 'veronica', say: 'Can you please help me? I\'m in a terrible spot of trouble.' },
          {
            options: {
              'Aha, sounds like a quest. I\'ll help.': [
                { player: 'Aha, sounds like a quest. I\'ll help.' },
                { npc: 'veronica', say: ['Yes yes, I suppose it is a quest. My fiance Ernest and I came upon this house.', 'He went in to ask for directions, and that was an hour ago. That house looks spooky. Can you go and see if you can find him?'] },
                { player: 'I\'ll have a look.' },
                { do: (q) => q.setStage('manor') },
              ],
              'No, I\'m looking for something to kill.': [{ player: 'No, I\'m looking for something to kill.' }, { npc: 'veronica', say: 'Oooh, you violent person you.' }],
            },
          },
        ],
      },
    },
    manor: {
      journal: ['*Veronica\'s* fiance *Ernest* went into *Draynor Manor* and has not come back out.', 'I should look for him inside the manor.'],
      talk: {
        oddenstein: [
          { npc: 'oddenstein', say: 'Be careful in here, there\'s lots of dangerous equipment.' },
          { player: 'I\'m looking for a guy called Ernest.' },
          { npc: 'oddenstein', say: ['Ah, Ernest. Top notch fellow. He was helping me test my new machine, you see, which turns things into chickens.', 'Ernest is now a chicken. I\'d change him back, only some gremlins have taken parts of my machine.'] },
          { player: 'Change him back this instant!' },
          { npc: 'oddenstein', say: 'I need a pressure gauge, a rubber tube and an oil can. They must be somewhere about the manor.' },
          { do: (q) => q.setStage('parts') },
        ],
      },
    },
    parts: {
      journal: (q) => [
        '*Professor Oddenstein* turned *Ernest* into a chicken with his machine, and the parts he needs to change him back are missing.',
        { text: 'A *pressure gauge*, from the manor\'s fountain (go *Fishing*)', done: q.has(GAUGE) },
        { text: 'A *rubber tube*, guarded by the *skeleton* in the *Graveyard*', done: q.has(TUBE) },
        { text: 'An *oil can*, buried in the manor\'s cellar (go *Mining*)', done: q.has(OIL) },
        missing(q).length ? null : 'I have all three parts. I should take them to *Professor Oddenstein*.',
      ],
      talk: {
        oddenstein: [
          { npc: 'oddenstein', say: 'Have you found anything yet?' },
          {
            if: (q) => missing(q).length === 0,
            then: [
              { player: 'I have everything!' },
              { do: (q) => PARTS.forEach(([item]) => q.take(item)) },
              { npc: 'oddenstein', say: 'Give them here then. Now, where was I... ah yes. Stand back!' },
              { text: 'The professor fiddles with the machine. There is a flash and a loud bang!' },
              { poof: true },
              { npc: 'ernest', say: ['Thank you sir, it was dreadfully irritating being a chicken.', 'How can I ever thank you? Here, take some cash, and a few feathers I seem to have left behind.'] },
              { do: (q) => q.complete() },
            ],
            else: [
              { player: 'I\'m afraid I don\'t have them all yet.' },
              { npc: 'oddenstein', say: (q) => `I still need the ${list(missing(q).map(([, name]) => name))}.` },
            ],
          },
        ],
      },
      on: {
        skillAction({ skill }, q) {
          if (skill?.id === 'melvorD:Fishing') find(q, GAUGE, PART_CHANCE, 'You fish a pressure gauge out of the water!');
          if (skill?.id === 'melvorD:Mining') find(q, OIL, PART_CHANCE, 'You uncover an old oil can.');
        },
        monsterKilled({ monster, area }, q) {
          if (monster?.id === 'melvorD:Skeleton' && GRAVEYARDS.includes(area?.id)) find(q, TUBE, TUBE_CHANCE, 'The skeleton drops a rubber tube.');
        },
      },
    },
  },
};

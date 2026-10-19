const AREA = 'melvorD:Wizard_Tower';
const DROP_CHANCE = 0.25;
const BEADS = [
  ['osrsQuests:Red_bead', 'red'],
  ['osrsQuests:Yellow_bead', 'yellow'],
  ['osrsQuests:Black_bead', 'black'],
  ['osrsQuests:White_bead', 'white'],
];

const missing = (q) => BEADS.filter(([bead]) => !q.has(bead));
const found = (q) => BEADS.length - missing(q).length;
const list = (words) => (words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : words[0]);

const start = [
  { npc: 'mizgog', say: 'Hello there.' },
  { label: 'menu' },
  {
    options: [
      {
        label: 'Give me a quest please.',
        then: [
          { player: 'Give me a quest please.' },
          { npc: 'mizgog', say: ['I could do with a hand, as it happens.', 'The wizard Grayzag down the hall has taken against me. He summoned a horde of imps and set them loose in my study.'] },
          { npc: 'mizgog', say: ['Most of what they took I can live without. Eggs, balls of string, that sort of thing.', 'But they also made off with my four magical beads: a red one, a yellow one, a black one and a white one.'] },
          { npc: 'mizgog', say: 'The little pests are hiding all over the Wizard Tower now. Could you get my beads back for me?' },
          {
            options: [
              {
                label: 'I\'ll try.',
                then: [
                  { player: 'I\'ll try.' },
                  { npc: 'mizgog', say: 'That\'s great, thank you. Rough up anything you find in the Wizard Tower and the imps should drop them as they flee.' },
                  { do: (q) => q.setStage('beads') },
                ],
              },
              {
                label: 'I\'ve better things to do than chase imps.',
                then: [
                  { player: 'I\'ve better things to do than chase imps.' },
                  { npc: 'mizgog', say: 'Well, if you\'re not interested in helping me, I\'ll find someone who is.' },
                ],
              },
            ],
          },
        ],
      },
      {
        label: 'Most of your friends are pretty quiet, aren\'t they?',
        then: [
          { player: 'Most of your friends are pretty quiet, aren\'t they?' },
          { npc: 'mizgog', say: 'Yes, they\'ve mostly got their heads in the clouds, thinking about magic.' },
          { goto: 'menu' },
        ],
      },
      { label: 'Goodbye.', then: [{ player: 'Goodbye.' }] },
    ],
  },
];

const checkIn = [
  { npc: 'mizgog', say: 'So how are you doing finding my beads?' },
  {
    if: (q) => found(q) === BEADS.length,
    then: [
      { player: 'I\'ve got all four beads. It was hard work, I can tell you.' },
      { npc: 'mizgog', say: 'Give them here and I\'ll sort out a reward.' },
      { text: 'You give four coloured beads to Wizard Mizgog.' },
      { do: (q) => BEADS.forEach(([bead]) => q.take(bead)) },
      { npc: 'mizgog', say: 'Here\'s your reward then: an amulet of accuracy. It\'ll steady your hand in a fight.' },
      { item: 'melvorD:Amulet_of_Accuracy', say: 'The wizard hands you an amulet.' },
      { do: (q) => q.complete() },
    ],
    else: [
      {
        if: (q) => found(q) > 0,
        then: [
          { player: 'I\'ve found some of them.' },
          { npc: 'mizgog', say: (q) => `Come back when you have them all. You've still to find the ${list(missing(q).map(([, colour]) => colour))} bead${missing(q).length === 1 ? '' : 's'}.` },
        ],
        else: [
          { player: 'I\'ve not found any yet.' },
          { npc: 'mizgog', say: ['Well, get on with it! The imps are hiding in the Wizard Tower.', 'I\'ve lost a red bead, a yellow bead, a black bead and a white bead.'] },
        ],
      },
    ],
  },
];

export const quest = {
  id: 'osrsQuests:imp_catcher',
  name: 'Imp Catcher',
  difficulty: 'Novice',
  length: 'Short',
  questPoints: 1,
  cast: { mizgog: 'osrsQuests:wizard_mizgog', grayzag: 'osrsQuests:wizard_grayzag', imp: 'osrsQuests:imp' },
  rewards: {
    items: [['melvorD:Amulet_of_Accuracy', 1]],
    xp: [['melvorD:Magic', 875]],
    image: 'melvorD:Amulet_of_Accuracy',
  },
  stages: {
    start: {
      journal: ['I can start this quest by speaking to *Wizard Mizgog* in the *Wizard Tower*.', 'There are no requirements for this quest.'],
      talk: { mizgog: start },
    },
    beads: {
      journal: (q) => [
        'I have spoken to *Wizard Mizgog*. His rival *Wizard Grayzag* summoned imps that stole Mizgog\'s four magical beads.',
        'The imps are hiding in the *Wizard Tower*. Fighting there should shake the beads loose.',
        ...BEADS.map(([bead, colour]) => ({ text: `The *${colour} bead*`, done: q.has(bead) })),
        found(q) === BEADS.length ? 'I have all four beads. I should take them back to *Wizard Mizgog*.' : null,
      ],
      talk: { mizgog: checkIn },
      on: {
        monsterKilled({ area }, q) {
          if (area?.id !== AREA) return;
          const left = missing(q);
          if (!left.length || q.random() >= DROP_CHANCE) return;
          const [bead, colour] = q.pick(left);
          q.give(bead);
          q.notify(`An imp darts out of hiding and drops a ${colour} bead!`, 'imp');
          if (!q.get('taunted')) {
            q.set('taunted', true);
            q.notify('Wizard Grayzag: Leave my imps alone, you meddling adventurer!', 'grayzag');
          }
          if (left.length === 1) q.notify('That\'s all four beads. Time to see Wizard Mizgog.', 'mizgog');
        },
      },
    },
  },
};

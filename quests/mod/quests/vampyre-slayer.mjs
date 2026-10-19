const BEER = 'osrsQuests:Beer';
const GARLIC = 'osrsQuests:Garlic';
const STAKE = 'osrsQuests:Stake';
const HAMMER = 'osrsQuests:Hammer';
const COUNT = 'melvorF:ElderVampire';
const BEER_CHANCE = 0.25;

export const quest = {
  id: 'osrsQuests:vampyre_slayer',
  name: 'Vampyre Slayer',
  difficulty: 'Novice',
  length: 'Short',
  questPoints: 3,
  cast: { morgan: 'osrsQuests:morgan', harlow: 'osrsQuests:dr_harlow' },
  rewards: { xp: [['melvorD:Attack', 4825]], image: STAKE },
  stages: {
    start: {
      journal: ['I can start this quest by speaking to *Morgan* in *Draynor Village*.', 'I must be able to defeat a powerful vampyre.'],
      talk: {
        morgan: [
          { npc: 'morgan', say: 'Please please help us, bold adventurer!' },
          { player: 'What\'s the problem?' },
          { npc: 'morgan', say: ['Our little village has been dreadfully ravaged by an evil vampyre! He lives in the basement of the manor to the north, and comes out at night to drink our blood.', 'My great-great-grandfather slew him once, but he rose again. Will you help us?'] },
          {
            options: {
              'Okay, I\'m up for an adventure.': [
                { player: 'Okay, I\'m up for an adventure.' },
                { npc: 'morgan', say: ['I think first you should seek help. I have a friend who is a retired vampyre hunter, called Dr. Harlow. He drinks in the Blue Moon Inn in Varrock.', 'Take this garlic too. Vampyres hate the stuff.'] },
                { do: (q) => q.give(GARLIC) },
                { item: GARLIC, say: 'Morgan hands you a clove of garlic.' },
                { do: (q) => q.setStage('harlow') },
              ],
              'No. Vampyres are scary!': [{ player: 'No. Vampyres are scary!' }, { npc: 'morgan', say: 'I don\'t blame you.' }],
            },
          },
        ],
      },
    },
    harlow: {
      journal: (q) => [
        '*Morgan* told me a *vampyre* is terrorising *Draynor Village*. He gave me some *garlic*.',
        'He told me to find his friend *Dr. Harlow*, a retired vampyre hunter who drinks in the *Blue Moon Inn*.',
        { text: 'Dr. Harlow looks thirsty. A *beer* might loosen his tongue.', done: q.has(BEER) },
      ],
      talk: {
        harlow: [
          { npc: 'harlow', say: 'Buy me a drrink pleassh...' },
          {
            if: (q) => q.has(BEER),
            then: [
              { player: 'Here you go.' },
              { do: (q) => q.take(BEER) },
              { text: 'You give a beer to Dr. Harlow.' },
              { npc: 'harlow', say: ['Cheersh matey...', 'Vampyre, you shay? Ach, I wash the besht hunter of them all, once. Here, take my shtake and hammer.', 'Shtrike him through the heart with the shtake, and keep the garlic about you. Now leave me to my drink.'] },
              { do: (q) => { q.give(STAKE); q.give(HAMMER); } },
              { item: STAKE, say: 'Dr. Harlow hands you a stake and a hammer.' },
              { do: (q) => q.setStage('draynor') },
            ],
            else: [{ player: 'I don\'t have a drink for you right now.' }, { text: 'Perhaps one of the men about town would give up a beer, if you checked his pockets.' }],
          },
        ],
      },
      on: {
        skillAction({ event }, q) {
          if (event?.npc?.id !== 'melvorF:MAN' || q.has(BEER) || q.random() >= BEER_CHANCE) return;
          q.give(BEER);
          q.notify('You find a frothy beer in the man\'s coat.', BEER);
        },
      },
    },
    draynor: {
      journal: (q) => [
        '*Dr. Harlow* gave me a *stake* and *hammer* to kill the vampyre.',
        'Count Draynor is the eldest vampyre of all. He lurks in the *Shrouded Badlands*.',
        { text: 'Keep the *stake*, *hammer* and *garlic*', done: q.has(STAKE) && q.has(HAMMER) && q.has(GARLIC) },
      ],
      on: {
        monsterKilled({ monster }, q) {
          if (monster?.id !== COUNT) return;
          if (!q.has(STAKE) || !q.has(HAMMER)) {
            q.notify('Count Draynor rises again! You need a stake and hammer to finish him.', 'harlow');
            return;
          }
          q.take(STAKE);
          q.notify('You hammer the stake through Count Draynor\'s heart. He crumbles to dust!', 'morgan');
          q.complete();
        },
      },
    },
  },
};

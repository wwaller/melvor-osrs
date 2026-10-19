const TALISMAN = 'osrsQuests:Air_talisman';
const PACKAGE = 'osrsQuests:Research_package';

export const quest = {
  id: 'osrsQuests:rune_mysteries',
  name: 'Rune Mysteries',
  difficulty: 'Novice',
  length: 'Short',
  questPoints: 1,
  cast: { duke: 'osrsQuests:duke_horacio', sedridor: 'osrsQuests:archmage_sedridor', aubury: 'osrsQuests:aubury' },
  rewards: { items: [[TALISMAN, 1], ['melvorD:Rune_Essence', 100]], lines: ['Access to the Rune essence mine'], image: TALISMAN },
  stages: {
    start: {
      journal: ['I can start this quest by speaking to *Duke Horacio* in *Lumbridge Castle*.', 'There are no requirements for this quest.'],
      talk: {
        duke: [
          { npc: 'duke', say: 'Greetings. Welcome to my castle.' },
          {
            options: [
              {
                label: 'Have you any quests for me?',
                then: [
                  { player: 'Have you any quests for me?' },
                  { npc: 'duke', say: ['Well, there is something. While cleaning out my cellar, I found this curious talisman. It is warm to the touch, and it hums.', 'The head wizard at the Wizard Tower might know what it is. Would you take it to him?'] },
                  {
                    options: {
                      'Sure, no problem.': [
                        { player: 'Sure, no problem.' },
                        { do: (q) => q.give(TALISMAN) },
                        { item: TALISMAN, say: 'The Duke hands you an air talisman.' },
                        { npc: 'duke', say: 'Thank you very much, stranger. I am sure the head wizard will reward you for such an interesting find.' },
                        { do: (q) => q.setStage('sedridor') },
                      ],
                      'Not right now.': [{ player: 'Not right now.' }, { npc: 'duke', say: 'As you wish, stranger.' }],
                    },
                  },
                ],
              },
              { label: 'Where can I find money?', then: [{ player: 'Where can I find money?' }, { npc: 'duke', say: 'I hear many of the local people earn money by learning a skill. Many people get by in life by becoming accomplished smiths, cooks, miners and woodcutters.' }] },
            ],
          },
        ],
      },
    },
    sedridor: {
      journal: ['*Duke Horacio* gave me an *air talisman* he found in his cellar.', 'He asked me to take it to the head wizard, *Archmage Sedridor*, at the *Wizard Tower*.'],
      talk: {
        sedridor: [
          { npc: 'sedridor', say: 'Welcome, adventurer, to the world renowned Wizard Tower. How may I help you?' },
          { player: 'The Duke of Lumbridge sent me with this talisman.' },
          { do: (q) => q.take(TALISMAN) },
          { text: 'You hand the talisman to the Archmage.' },
          { npc: 'sedridor', say: ['By Saradomin! This could be the key to the lost art of Runecrafting!', 'In the past, wizards could teleport to a mine of rune essence and craft their own runes. That knowledge was lost. With this talisman, we may find the way again.', 'Take this package of my research to Aubury, who keeps a rune shop in Varrock. He has been studying the same problem.'] },
          { do: (q) => q.give(PACKAGE) },
          { item: PACKAGE, say: 'The Archmage hands you a research package.' },
          { do: (q) => q.setStage('aubury') },
        ],
      },
    },
    aubury: {
      journal: ['*Archmage Sedridor* believes the talisman could unlock the lost art of *Runecrafting*.', 'He asked me to deliver his *research package* to *Aubury* in *Varrock*.'],
      talk: {
        aubury: [
          { npc: 'aubury', say: 'Do you want to buy some runes?' },
          {
            if: (q) => q.has(PACKAGE),
            then: [
              { player: 'I\'ve been sent here with a package for you.' },
              { do: (q) => q.take(PACKAGE) },
              { npc: 'aubury', say: ['From Sedridor? At last! This is exactly what I needed.', 'Give me a moment... yes, yes. Here, take these notes back to him. They hold the last piece of the puzzle.'] },
              { text: 'Aubury hands you some research notes.' },
              { do: (q) => q.setStage('notes') },
            ],
            else: [{ player: 'Not right now, thanks.' }],
          },
        ],
      },
    },
    notes: {
      journal: ['*Aubury* gave me his research *notes*.', 'I should take them back to *Archmage Sedridor* at the *Wizard Tower*.'],
      talk: {
        sedridor: [
          { npc: 'sedridor', say: 'Ah, you\'re back. Did Aubury have anything for me?' },
          { player: 'He sent you these notes.' },
          { text: 'You hand the notes to the Archmage.' },
          { npc: 'sedridor', say: ['Marvellous! With these I can teleport anyone to the rune essence mine. The art of Runecrafting is ours again!', 'Keep the talisman, and take some essence to start you off. You have done the world of magic a great service.'] },
          { do: (q) => q.complete() },
        ],
      },
    },
  },
};

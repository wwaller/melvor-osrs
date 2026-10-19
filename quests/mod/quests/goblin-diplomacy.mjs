const MAIL = 'osrsQuests:Goblin_mail';
const RED = 'osrsQuests:Red_dye';
const YELLOW = 'osrsQuests:Yellow_dye';
const BLUE = 'osrsQuests:Blue_dye';
const VILLAGE = 'melvorD:Goblin_Village';
const MAIL_NEEDED = 3;
const MAIL_CHANCE = 0.3;

const mail = (q) => q.count(MAIL);

export const quest = {
  id: 'osrsQuests:goblin_diplomacy',
  name: 'Goblin Diplomacy',
  difficulty: 'Novice',
  length: 'Short',
  questPoints: 5,
  cast: { bentnoze: 'osrsQuests:general_bentnoze', wartface: 'osrsQuests:general_wartface', aggie: 'osrsQuests:aggie' },
  rewards: { xp: [['melvorD:Crafting', 200]], items: [['melvorD:Gold_Bar', 1]], image: MAIL },
  stages: {
    start: {
      journal: ['I can start this quest by speaking to *General Wartface* or *General Bentnoze* in the *Golbin Village*.', 'There are no requirements for this quest.'],
      talk: {
        wartface: [
          { npc: 'wartface', say: 'Green armour best.' },
          { npc: 'bentnoze', say: 'No no Red every time.' },
          { player: 'Why are you arguing about the colour of your armour?' },
          { npc: 'wartface', say: ['We decide to celebrate goblin new century by changing colour of our armour. Light blue get boring after a bit.', 'But Bentnoze want red, and Bentnoze is stupid.'] },
          { npc: 'bentnoze', say: 'Wartface is stupid!' },
          {
            options: {
              'Do you want me to pick an armour colour for you?': [
                { player: 'Do you want me to pick an armour colour for you?' },
                { npc: 'wartface', say: 'Yes! Bring us goblin armour in the colour you pick. Some goblins in the village have spare mail.' },
                { npc: 'bentnoze', say: 'Witch called Aggie make dyes, maybe.' },
                { do: (q) => q.setStage('mail') },
              ],
              'I\'ll leave you to it.': [{ player: 'I\'ll leave you to it.' }],
            },
          },
        ],
      },
    },
    mail: {
      journal: (q) => [
        'The goblin *Generals* can\'t agree on a new colour for their armour. I offered to pick one for them.',
        { text: `Collect ${MAIL_NEEDED} *goblin mail* from goblins in the *Golbin Village* (${Math.min(mail(q), MAIL_NEEDED)}/${MAIL_NEEDED})`, done: mail(q) >= MAIL_NEEDED },
        { text: 'Get *dyes* from *Aggie* the witch', done: q.has(RED) && q.has(YELLOW) && q.has(BLUE) },
        q.get('orange') ? { text: 'They hated *orange* armour', done: true } : null,
        q.get('blue') ? { text: 'They hated *blue* armour', done: true } : null,
      ],
      talk: {
        aggie: [
          { npc: 'aggie', say: 'What can I help you with?' },
          { player: 'Can you make dyes for me please?' },
          { npc: 'aggie', say: 'What colours, dearie? I\'ve red from redberries, yellow from onions and blue from woad leaves. Here, have one of each.' },
          { do: (q) => [RED, YELLOW, BLUE].forEach((dye) => !q.has(dye) && q.give(dye)) },
          { text: 'Aggie hands you red, yellow and blue dye.' },
        ],
        wartface: [
          { npc: 'wartface', say: 'Have you got armour for us yet?' },
          { label: 'menu' },
          {
            title: 'Which armour will you show them?',
            options: [
              {
                label: 'I have some orange armour here.',
                if: (q) => !q.get('orange') && mail(q) > 0 && q.has(RED) && q.has(YELLOW),
                then: [
                  { text: 'You mix red and yellow dye and dye a goblin mail orange.' },
                  { do: (q) => { q.take(MAIL); q.take(RED); q.take(YELLOW); q.set('orange', true); } },
                  { npc: 'bentnoze', say: 'No, I don\'t like that much.' },
                  { npc: 'wartface', say: 'It make me look silly. Bring something else.' },
                  { goto: 'menu' },
                ],
              },
              {
                label: 'I have some blue armour here.',
                if: (q) => !q.get('blue') && mail(q) > 0 && q.has(BLUE),
                then: [
                  { text: 'You dye a goblin mail blue.' },
                  { do: (q) => { q.take(MAIL); q.take(BLUE); q.set('blue', true); } },
                  { npc: 'wartface', say: 'Too dark. We want something different.' },
                  { goto: 'menu' },
                ],
              },
              {
                label: 'I have some brown armour here.',
                if: (q) => q.get('orange') && q.get('blue') && mail(q) > 0,
                then: [
                  { do: (q) => q.take(MAIL) },
                  { npc: 'bentnoze', say: 'Ooh, brown. That good colour.' },
                  { npc: 'wartface', say: ['Brown is nice and plain. Brown it is!', 'Thank you, human. Take this gold for your trouble.'] },
                  { do: (q) => q.complete() },
                ],
              },
              { label: 'Not yet.', then: [{ player: 'Not yet. I\'ll be back.' }] },
            ],
          },
        ],
      },
      on: {
        monsterKilled({ monster, area }, q) {
          if (monster?.id !== 'melvorD:Golbin' || area?.id !== VILLAGE || mail(q) >= MAIL_NEEDED || q.random() >= MAIL_CHANCE) return;
          q.give(MAIL);
          q.notify('The golbin drops a set of goblin mail.', MAIL);
        },
      },
    },
  },
};

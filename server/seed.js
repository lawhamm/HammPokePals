// Seeds a small amount of SAMPLE data so the app isn't empty on first launch.
// This is placeholder content meant to be replaced by your real PTE pokedex,
// rules, and lore. Run `npm run seed` (only seeds when a table is empty) or
// `npm run seed -- --force` to add the samples again.

import db from './db.js';

const force = process.argv.includes('--force');

const SAMPLE_POKEMON = [
  {
    dex_no: 1,
    name: 'Bulbasaur',
    category: 'Seed Pokemon',
    types: ['Grass', 'Poison'],
    description: 'A strange seed was planted on its back at birth. It grows with this Pokemon.',
    habitat: 'Grassland',
    rarity: 'Uncommon',
    stats: { hp: 45, atk: 49, def: 49, spatk: 65, spdef: 65, speed: 45 },
    abilities: ['Overgrow'],
    moves: ['Tackle', 'Growl', 'Vine Whip'],
    capture_rules: 'Encountered rarely in starter groves. Capture DC 12.',
    gm_notes: 'SAMPLE entry — replace with your PTE pokedex data.',
    visibility: 'public',
  },
  {
    dex_no: 4,
    name: 'Charmander',
    category: 'Lizard Pokemon',
    types: ['Fire'],
    description: 'The flame on its tail shows the strength of its life force.',
    habitat: 'Mountain',
    rarity: 'Uncommon',
    stats: { hp: 39, atk: 52, def: 43, spatk: 60, spdef: 50, speed: 65 },
    abilities: ['Blaze'],
    moves: ['Scratch', 'Growl', 'Ember'],
    capture_rules: 'Found near volcanic trails. Capture DC 12.',
    visibility: 'public',
  },
  {
    dex_no: 7,
    name: 'Squirtle',
    category: 'Tiny Turtle Pokemon',
    types: ['Water'],
    description: 'Shoots water at prey while in the water. Withdraws into its shell when in danger.',
    habitat: 'Waters-edge',
    rarity: 'Uncommon',
    stats: { hp: 44, atk: 48, def: 65, spatk: 50, spdef: 64, speed: 43 },
    abilities: ['Torrent'],
    moves: ['Tackle', 'Tail Whip', 'Water Gun'],
    capture_rules: 'Lives by calm lakeshores. Capture DC 12.',
    visibility: 'public',
  },
  {
    dex_no: 25,
    name: 'Pikachu',
    category: 'Mouse Pokemon',
    types: ['Electric'],
    description: 'When several gather, their electricity can build and cause lightning storms.',
    habitat: 'Forest',
    rarity: 'Rare',
    stats: { hp: 35, atk: 55, def: 40, spatk: 50, spdef: 50, speed: 90 },
    abilities: ['Static'],
    moves: ['Thunder Shock', 'Growl', 'Quick Attack'],
    capture_rules: 'Skittish; flees on a failed approach check. Capture DC 14.',
    visibility: 'public',
  },
  {
    dex_no: 150,
    name: 'Mewtwo',
    category: 'Genetic Pokemon',
    types: ['Psychic'],
    description: 'A Pokemon created by recombining genes. Said to have the most savage heart.',
    habitat: 'Unknown',
    rarity: 'Legendary',
    stats: { hp: 106, atk: 110, def: 90, spatk: 154, spdef: 90, speed: 130 },
    abilities: ['Pressure'],
    moves: ['Confusion', 'Psychic', 'Recover', 'Aura Sphere'],
    capture_rules: 'Plot-gated legendary. Cannot be captured by normal means.',
    gm_notes: 'SECRET (GM-only): tied to the Cinnabar lab subplot. Reveal in Act III only.',
    visibility: 'gm',
  },
];

const SAMPLE_STORY = [
  {
    title: 'Welcome to the Hammlands',
    chapter: 'Prologue',
    body:
      'The campaign begins in the seaside town of Tidewatch. (SAMPLE lore — replace with your storybook.)',
    order_index: 0,
    visibility: 'public',
  },
  {
    title: "GM Secret: The Rocket Cell",
    chapter: 'Prologue',
    body: 'A hidden Team Rocket cell operates beneath the Tidewatch market. Trigger in session 2.',
    order_index: 1,
    visibility: 'gm',
  },
];

function seedTable(table, rows, insert) {
  const count = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  if (count > 0 && !force) {
    console.log(`  ${table}: already has ${count} rows — skipping (use -- --force to add samples).`);
    return;
  }
  const tx = db.transaction(() => rows.forEach(insert));
  tx();
  console.log(`  ${table}: inserted ${rows.length} sample rows.`);
}

console.log('\nSeeding sample data...');

seedTable('pokemon', SAMPLE_POKEMON, (p) => {
  db.prepare(
    `INSERT INTO pokemon (dex_no, name, category, types, description, habitat, rarity, stats, abilities, moves, capture_rules, gm_notes, visibility)
     VALUES (@dex_no, @name, @category, @types, @description, @habitat, @rarity, @stats, @abilities, @moves, @capture_rules, @gm_notes, @visibility)`
  ).run({
    ...p,
    types: JSON.stringify(p.types),
    stats: JSON.stringify(p.stats),
    abilities: JSON.stringify(p.abilities),
    moves: JSON.stringify(p.moves),
    gm_notes: p.gm_notes ?? null,
  });
});

seedTable('story_entries', SAMPLE_STORY, (s) => {
  db.prepare(
    `INSERT INTO story_entries (title, chapter, body, order_index, visibility)
     VALUES (@title, @chapter, @body, @order_index, @visibility)`
  ).run(s);
});

console.log('Done.\n');

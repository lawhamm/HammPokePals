// Bulk Pokedex importer. Loads Pokemon entries from a JSON or CSV file into the
// compendium. Useful for loading a full PTE dex in one shot instead of
// hand-entering every species.
//
//   node server/import-pokedex.js path/to/pokedex.json [--replace]
//   node server/import-pokedex.js path/to/pokedex.csv  [--replace]
//
// JSON shape: an array of objects, each with at least { "name": "..." }.
// CSV shape : a header row whose column names loosely match the fields below
//             (a plain spreadsheet export works). List columns (types,
//             abilities, moves) may separate values with | ; or commas.
// Recognized fields: name, dex_no, category, types, description, habitat,
// rarity, stats {hp,atk,def,spatk,spdef,speed} (as columns in CSV), abilities,
// moves, capture_rules, gm_notes, image, visibility.
//
//   --replace   wipe the existing compendium before importing.

import db from './db.js';
import { parsePokedexFile, entryToParams, buildInsert } from './pokedex-source.js';

const args = process.argv.slice(2);
if (args.includes('--help') || args.length === 0) {
  console.log(`
Usage: node server/import-pokedex.js <file.json|file.csv> [--replace]

  <file>       A JSON array or CSV of Pokemon entries (see README).
  --replace    Delete all existing compendium entries first.
`);
  process.exit(0);
}

const file = args.find((a) => !a.startsWith('--'));
const replace = args.includes('--replace');

let list;
try {
  list = parsePokedexFile(file);
} catch (e) {
  console.error(`Could not read/parse ${file}: ${e.message}`);
  process.exit(1);
}

const insert = buildInsert(db);

let imported = 0;
let skipped = 0;

const tx = db.transaction(() => {
  if (replace) {
    const n = db.prepare('DELETE FROM pokemon').run().changes;
    console.log(`Cleared ${n} existing entries (--replace).`);
  }
  for (const p of list) {
    const params = entryToParams(p);
    if (!params) {
      skipped++;
      continue;
    }
    insert.run(params);
    imported++;
  }
});

tx();
console.log(`\nImported ${imported} entr${imported === 1 ? 'y' : 'ies'}.` + (skipped ? ` Skipped ${skipped} without a name.` : ''));
console.log('Start the app with `npm start` to see them.\n');

// Bulk Pokedex importer. Loads an array of Pokemon entries from a JSON file into
// the compendium. Useful for loading a full PTE dex in one shot instead of
// hand-entering every species.
//
//   node server/import-pokedex.js path/to/pokedex.json [--replace]
//
// JSON shape: an array of objects, each with at least { "name": "..." }.
// Recognized fields: name, dex_no, category, types, description, habitat,
// rarity, stats {hp,atk,def,spatk,spdef,speed}, abilities, moves,
// capture_rules, gm_notes, image, visibility.
//
//   --replace   wipe the existing compendium before importing.

import fs from 'node:fs';
import db from './db.js';

const args = process.argv.slice(2);
if (args.includes('--help') || args.length === 0) {
  console.log(`
Usage: node server/import-pokedex.js <file.json> [--replace]

  <file.json>  A JSON array of Pokemon entries (see README).
  --replace    Delete all existing compendium entries first.
`);
  process.exit(0);
}

const file = args.find((a) => !a.startsWith('--'));
const replace = args.includes('--replace');

let raw;
try {
  raw = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`Could not read/parse ${file}: ${e.message}`);
  process.exit(1);
}

const list = Array.isArray(raw) ? raw : raw.pokemon;
if (!Array.isArray(list)) {
  console.error('Expected a JSON array of entries (or an object with a "pokemon" array).');
  process.exit(1);
}

function arr(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

const insert = db.prepare(
  `INSERT INTO pokemon (dex_no, name, category, types, description, habitat, rarity, stats, abilities, moves, capture_rules, gm_notes, image, visibility)
   VALUES (@dex_no, @name, @category, @types, @description, @habitat, @rarity, @stats, @abilities, @moves, @capture_rules, @gm_notes, @image, @visibility)`
);

let imported = 0;
let skipped = 0;

const tx = db.transaction(() => {
  if (replace) {
    const n = db.prepare('DELETE FROM pokemon').run().changes;
    console.log(`Cleared ${n} existing entries (--replace).`);
  }
  for (const p of list) {
    if (!p || !p.name) {
      skipped++;
      continue;
    }
    insert.run({
      dex_no: p.dex_no ?? null,
      name: String(p.name).trim(),
      category: p.category ?? null,
      types: JSON.stringify(arr(p.types)),
      description: p.description ?? null,
      habitat: p.habitat ?? null,
      rarity: p.rarity ?? null,
      stats: JSON.stringify(p.stats && typeof p.stats === 'object' ? p.stats : {}),
      abilities: JSON.stringify(arr(p.abilities)),
      moves: JSON.stringify(arr(p.moves)),
      capture_rules: p.capture_rules ?? null,
      gm_notes: p.gm_notes ?? null,
      image: p.image ?? null,
      visibility: p.visibility === 'gm' ? 'gm' : 'public',
    });
    imported++;
  }
});

tx();
console.log(`\nImported ${imported} entr${imported === 1 ? 'y' : 'ies'}.` + (skipped ? ` Skipped ${skipped} without a name.` : ''));
console.log('Start the app with `npm start` to see them.\n');

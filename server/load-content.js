// One-command content loader. Drop your PTE materials into the seed-content/
// folder and run `npm run load-content` to ingest them all:
//
//   seed-content/
//     pdfs/                 <- put PTE rules, GM guide, bestiary PDFs here
//     pokedex.json|.csv     <- your Pokedex as a JSON array OR a CSV (see README)
//     manifest.json         <- OPTIONAL: titles/categories/visibility per PDF
//
// Without a manifest the loader auto-detects: every *.pdf under seed-content/
// becomes a rules document (a file whose name looks like a GM guide is marked
// GM-only), and pokedex*.json / pokedex*.csv is imported into the compendium.
//
// Re-running is safe: a PDF already loaded (same stored filename) is skipped,
// and the pokedex import only adds entries (use --replace-dex to wipe first).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './db.js';
import { parsePokedexFile, entryToParams, buildInsert } from './pokedex-source.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SEED_DIR = path.join(ROOT, 'seed-content');
const PDF_STORE = path.join(ROOT, 'data', 'uploads', 'pdfs');

const replaceDex = process.argv.includes('--replace-dex');

if (!fs.existsSync(SEED_DIR)) {
  console.log(`No seed-content/ folder found at ${SEED_DIR}. Nothing to load.`);
  process.exit(0);
}

// --- optional manifest ----------------------------------------------------
let manifest = {};
const manifestPath = path.join(SEED_DIR, 'manifest.json');
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    console.error(`manifest.json is invalid JSON: ${e.message}`);
    process.exit(1);
  }
}
// Map original filename -> metadata override from the manifest.
const pdfMeta = {};
for (const entry of manifest.pdfs || []) {
  if (entry.file) pdfMeta[path.basename(entry.file)] = entry;
}

// --- discover PDFs --------------------------------------------------------
function findPdfs() {
  const dirs = [SEED_DIR, path.join(SEED_DIR, 'pdfs')];
  const found = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name.toLowerCase().endsWith('.pdf')) found.push(path.join(dir, name));
    }
  }
  return found;
}

function looksLikeGmGuide(name) {
  return /gm[\s_-]?guide|game ?master|\bgm\b|dm[\s_-]?guide|secret/i.test(name);
}

function titleFromFilename(name) {
  return path.basename(name, '.pdf').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

let pdfsLoaded = 0;
let pdfsSkipped = 0;

fs.mkdirSync(PDF_STORE, { recursive: true });

for (const src of findPdfs()) {
  const orig = path.basename(src);
  const meta = pdfMeta[orig] || {};
  const stored = `seed-${orig.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const dest = path.join(PDF_STORE, stored);

  const already = db.prepare('SELECT id FROM pdf_docs WHERE filename = ?').get(stored);
  if (already) {
    pdfsSkipped++;
    continue;
  }

  fs.copyFileSync(src, dest);
  db.prepare(
    'INSERT INTO pdf_docs (title, category, description, filename, visibility) VALUES (?, ?, ?, ?, ?)'
  ).run(
    meta.title || titleFromFilename(orig),
    meta.category || (looksLikeGmGuide(orig) ? 'GM Guide' : 'Core Rules'),
    meta.description || null,
    stored,
    meta.visibility === 'gm' || looksLikeGmGuide(orig) ? 'gm' : (meta.visibility || 'public')
  );
  pdfsLoaded++;
  console.log(`  + PDF: ${meta.title || titleFromFilename(orig)} (${looksLikeGmGuide(orig) && meta.visibility !== 'public' ? 'GM only' : 'public'})`);
}

// --- discover & import pokedex -------------------------------------------
function findDex() {
  if (manifest.pokedex) {
    const p = path.join(SEED_DIR, manifest.pokedex);
    return fs.existsSync(p) ? p : null;
  }
  // Prefer JSON, then CSV, when both happen to be present.
  const names = fs.existsSync(SEED_DIR) ? fs.readdirSync(SEED_DIR) : [];
  return (
    names.map((n) => path.join(SEED_DIR, n)).find((p) => /pokedex.*\.json$/i.test(p)) ||
    names.map((n) => path.join(SEED_DIR, n)).find((p) => /pokedex.*\.csv$/i.test(p)) ||
    null
  );
}

let dexImported = 0;
const dexPath = findDex();
if (dexPath) {
  let list;
  try {
    list = parsePokedexFile(dexPath);
  } catch (e) {
    console.error(`Could not parse ${dexPath}: ${e.message}`);
    process.exit(1);
  }
  const insert = buildInsert(db);
  const existsByName = db.prepare('SELECT 1 FROM pokemon WHERE name = ? COLLATE NOCASE');
  let dexSkipped = 0;
  const tx = db.transaction(() => {
    if (replaceDex) {
      const n = db.prepare('DELETE FROM pokemon').run().changes;
      console.log(`  Cleared ${n} existing compendium entries (--replace-dex).`);
    }
    for (const p of list) {
      const params = entryToParams(p);
      if (!params) continue;
      // Skip duplicates by name so re-running the loader is safe.
      if (!replaceDex && existsByName.get(params.name)) {
        dexSkipped++;
        continue;
      }
      insert.run(params);
      dexImported++;
    }
  });
  tx();
  console.log(
    `  + Pokédex: imported ${dexImported} entries from ${path.basename(dexPath)}` +
      (dexSkipped ? ` (skipped ${dexSkipped} already in the compendium by name)` : '')
  );
}

console.log(
  `\nDone. PDFs loaded: ${pdfsLoaded}${pdfsSkipped ? ` (skipped ${pdfsSkipped} already present)` : ''}; ` +
    `Pokédex entries imported: ${dexImported}.`
);
if (!pdfsLoaded && !pdfsSkipped && !dexImported) {
  console.log('\nNothing was loaded. Put PDFs in seed-content/pdfs/ and a pokedex.json in seed-content/, then re-run.');
}
console.log('Start the app with `npm start`.\n');

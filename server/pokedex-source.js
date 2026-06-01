// Shared Pokédex parsing/normalization used by both the one-command loader
// (load-content.js) and the standalone bulk importer (import-pokedex.js).
//
// A dex source can be either JSON or CSV:
//   - JSON: an array of entry objects, or an object with a `pokemon` array.
//   - CSV : the first row is a header. Column names are matched loosely
//           (case/space/underscore-insensitive) against known fields, so a
//           spreadsheet exported straight from Excel/Google Sheets just works.
//
// Both forms normalize to the same entry shape consumed by the `pokemon` table.

import fs from 'node:fs';
import path from 'node:path';

// Split a list-ish value into a clean string array. Accepts a real array, or a
// string using comma / semicolon / pipe separators (so CSV cells like
// "Grass|Poison" or a quoted "Grass, Poison" both work).
export function arr(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (v == null) return [];
  return String(v)
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// --- CSV parsing ----------------------------------------------------------
// A small RFC-4180-ish parser: handles quoted fields, escaped quotes (""),
// and commas/newlines inside quotes. Good enough for hand- or sheet-exported
// dex files without pulling in a dependency.
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  // Strip a UTF-8 BOM if present so the first header isn't polluted.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      // Treat \r, \n, and \r\n all as one row break; ignore blank breaks.
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  // Flush trailing field/row (file not ending in a newline).
  if (field !== '' || row.length) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

// Canonical field <- accepted header aliases (compared after normalizing the
// header to lowercase with all non-alphanumerics removed).
const ALIASES = {
  dex_no: ['dexno', 'dex', 'dexnumber', 'number', 'no', 'num', '#', 'id'],
  name: ['name', 'pokemon', 'species', 'pokemonname'],
  category: ['category', 'kind', 'speciescategory', 'classification'],
  types: ['types', 'type', 'elements'],
  description: ['description', 'desc', 'flavor', 'flavortext', 'entry', 'dexentry'],
  habitat: ['habitat', 'location', 'biome'],
  rarity: ['rarity', 'rare'],
  abilities: ['abilities', 'ability'],
  moves: ['moves', 'move', 'moveset', 'movelist'],
  capture_rules: ['capturerules', 'capture', 'capturenotes', 'encounter', 'encounternotes'],
  gm_notes: ['gmnotes', 'gm', 'secret', 'secrets', 'notesgm'],
  image: ['image', 'img', 'sprite', 'art', 'picture'],
  visibility: ['visibility', 'vis', 'visible'],
  // Homebrew PTE profile fields:
  power: ['power'],
  size: ['size'],
  weight_class: ['weightclass', 'wc'],
  diet: ['diet'],
  evo_stage: ['evostage', 'evolutionstage', 'evo', 'stage', 'evolution'],
  cap_movement: ['movement', 'movementcaps', 'movementcapabilities'],
  cap_combat: ['combat', 'combatcaps', 'combatcapabilities'],
  cap_narrative: ['narrative', 'narrativecaps', 'narrativecapabilities'],
  skills: ['skills', 'skill'],
};

// Individual stat columns -> key inside the stats object.
const STAT_ALIASES = {
  hp: ['hp', 'health', 'hitpoints'],
  atk: ['atk', 'attack', 'att'],
  def: ['def', 'defense', 'defence'],
  spatk: ['spatk', 'spa', 'spattack', 'specialattack', 'spatt'],
  spdef: ['spdef', 'spd', 'spdefense', 'specialdefense', 'specialdefence'],
  speed: ['speed', 'spe', 'spd2'],
};

const normKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function buildHeaderMap(headers) {
  const fieldFor = {}; // column index -> canonical field
  const statFor = {}; // column index -> stat key
  headers.forEach((h, idx) => {
    const key = normKey(h);
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (aliases.includes(key)) {
        fieldFor[idx] = field;
        return;
      }
    }
    for (const [stat, aliases] of Object.entries(STAT_ALIASES)) {
      if (aliases.includes(key)) {
        statFor[idx] = stat;
        return;
      }
    }
  });
  return { fieldFor, statFor };
}

function rowsToEntries(rows) {
  if (rows.length < 2) return [];
  const { fieldFor, statFor } = buildHeaderMap(rows[0]);
  const entries = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const entry = {};
    const stats = {};
    cells.forEach((raw, idx) => {
      const val = raw == null ? '' : String(raw).trim();
      if (val === '') return;
      if (idx in fieldFor) entry[fieldFor[idx]] = val;
      else if (idx in statFor) {
        const n = Number(val);
        if (!Number.isNaN(n)) stats[statFor[idx]] = n;
      }
    });
    if (Object.keys(stats).length) entry.stats = stats;
    entries.push(entry);
  }
  return entries;
}

// --- public API -----------------------------------------------------------

// Read a .json or .csv dex file and return an array of raw entry objects.
// Throws on unreadable/invalid files so callers can report and exit.
export function parsePokedexFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  if (path.extname(filePath).toLowerCase() === '.csv') {
    return rowsToEntries(parseCSV(text));
  }
  const raw = JSON.parse(text);
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.pokemon)) return raw.pokemon;
  throw new Error('Expected a JSON array (or an object with a "pokemon" array).');
}

// Columns the `pokemon` INSERT binds, in order. Keep in sync with entryToParams.
export const POKEMON_COLUMNS = [
  'dex_no', 'name', 'category', 'types', 'description', 'habitat', 'rarity',
  'stats', 'abilities', 'moves', 'capture_rules', 'gm_notes', 'image',
  'power', 'size', 'weight_class', 'diet', 'evo_stage', 'capabilities',
  'skills', 'visibility',
];

// Prepare the shared bulk-insert statement (named @params from entryToParams).
export function buildInsert(db) {
  return db.prepare(
    `INSERT INTO pokemon (${POKEMON_COLUMNS.join(', ')})
     VALUES (${POKEMON_COLUMNS.map((c) => '@' + c).join(', ')})`
  );
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Assemble the grouped capabilities object from either separate movement/
// combat/narrative inputs (CSV) or a pre-built capabilities object (JSON).
// Empty groups are dropped so the stored JSON stays compact.
function buildCapabilities(p) {
  const base =
    p.capabilities && typeof p.capabilities === 'object' && !Array.isArray(p.capabilities)
      ? p.capabilities
      : {};
  const raw = {
    movement: p.cap_movement ?? base.movement,
    combat: p.cap_combat ?? base.combat,
    narrative: p.cap_narrative ?? base.narrative,
  };
  const out = {};
  for (const g of ['movement', 'combat', 'narrative']) {
    const list = arr(raw[g]);
    if (list.length) out[g] = list;
  }
  return out;
}

// Parse skills as a {Skill: Rank} map. Accepts an object, a JSON string, or a
// "Skill:Rank|Skill:Rank" / comma-separated string (the form the loader emits).
export function parseSkills(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      const key = String(k).trim();
      const rank = String(val ?? '').trim();
      if (key && rank) out[key] = rank;
    }
    return out;
  }
  if (typeof v === 'string' && v.trim()) {
    const parsed = (() => {
      try {
        return JSON.parse(v);
      } catch {
        return null;
      }
    })();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parseSkills(parsed);
    const out = {};
    for (const pair of v.split(/[|;,]/)) {
      const idx = pair.indexOf(':');
      if (idx === -1) continue;
      const key = pair.slice(0, idx).trim();
      const rank = pair.slice(idx + 1).trim();
      if (key && rank) out[key] = rank;
    }
    return out;
  }
  return {};
}

// Normalize one raw entry into the exact named params the `pokemon` INSERT
// expects. Returns null for entries without a usable name.
export function entryToParams(p) {
  if (!p || !p.name || !String(p.name).trim()) return null;
  const dex = p.dex_no ?? p.dexNo ?? null;
  const dexNum = dex == null || dex === '' ? null : Number(dex);
  return {
    dex_no: Number.isFinite(dexNum) ? dexNum : null,
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
    power: numOrNull(p.power),
    size: p.size ?? null,
    weight_class: numOrNull(p.weight_class),
    diet: p.diet ?? null,
    evo_stage: numOrNull(p.evo_stage),
    capabilities: JSON.stringify(buildCapabilities(p)),
    skills: JSON.stringify(parseSkills(p.skills)),
    visibility: p.visibility === 'gm' ? 'gm' : 'public',
  };
}

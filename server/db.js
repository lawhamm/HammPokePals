// Database layer: opens (and on first run, creates) the local SQLite file and
// exposes the schema. Everything the campaign stores lives here. The single most
// important column across content tables is `visibility`:
//   'public' -> visible to everyone (players + GM)
//   'gm'     -> visible only when the GM is logged in
// The API enforces this on every read so players never receive GM-only rows.

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'hammpokepals.db');

// Ensure the data + upload directories exist on a fresh clone. Upload targets
// must exist before multer writes to them, and they're git-ignored, so we can't
// rely on them being checked out.
for (const sub of ['', 'uploads/pdfs', 'uploads/maps', 'uploads/pokemon']) {
  fs.mkdirSync(path.join(DATA_DIR, sub), { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS pokemon (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    dex_no       INTEGER,
    name         TEXT NOT NULL,
    category     TEXT,              -- e.g. "Flame Pokemon"
    types        TEXT NOT NULL DEFAULT '[]',   -- JSON array of type strings
    description  TEXT,
    habitat      TEXT,
    rarity       TEXT,              -- Common / Uncommon / Rare / Legendary ...
    stats        TEXT NOT NULL DEFAULT '{}',   -- JSON: {hp,atk,def,spatk,spdef,speed}
    abilities    TEXT NOT NULL DEFAULT '[]',   -- JSON array
    moves        TEXT NOT NULL DEFAULT '[]',   -- JSON array
    capture_rules TEXT,            -- homebrew capture / encounter notes (player-facing)
    image        TEXT,             -- uploaded filename or external URL
    gm_notes     TEXT,             -- GM-only secrets, even on a public entry
    -- Homebrew PTE profile fields:
    power        INTEGER,          -- PTE Power rating
    size         TEXT,             -- Small / Medium / Large ...
    weight_class INTEGER,
    diet         TEXT,             -- e.g. "Herbivore, Phototroph"
    evo_stage    INTEGER,          -- 1 = base, 2 = stage 1, 3 = stage 2 ...
    capabilities TEXT NOT NULL DEFAULT '{}',  -- JSON: {movement:[],combat:[],narrative:[]}
    skills       TEXT NOT NULL DEFAULT '{}',  -- JSON: {"Athletics":"Mastered", ...}
    visibility   TEXT NOT NULL DEFAULT 'public',
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pdf_docs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    category    TEXT,              -- "Core Rules", "Bestiary", "Items" ...
    description TEXT,
    filename    TEXT NOT NULL,     -- stored under data/uploads/pdfs
    visibility  TEXT NOT NULL DEFAULT 'public',
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    category    TEXT,              -- Poke Ball, Medicine, Key Item, TM ...
    description TEXT,
    quantity    INTEGER NOT NULL DEFAULT 1,
    owner       TEXT,              -- which player/party member holds it
    value       TEXT,
    gm_notes    TEXT,
    visibility  TEXT NOT NULL DEFAULT 'public',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS story_entries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    chapter     TEXT,              -- grouping label, e.g. "Act I", "Chapter 3"
    body        TEXT,              -- markdown-ish lore / plot text
    order_index INTEGER NOT NULL DEFAULT 0,
    visibility  TEXT NOT NULL DEFAULT 'public',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS maps (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    region      TEXT,
    description TEXT,
    image       TEXT,              -- stored under data/uploads/maps
    markers     TEXT NOT NULL DEFAULT '[]',  -- JSON: [{x,y,label,note,visibility}]
    visibility  TEXT NOT NULL DEFAULT 'public',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Bulk reference material from the rulebook/workbook: moves, abilities, items.
  -- Read-only catalogue (loaded from seed-content), searchable in the app.
  CREATE TABLE IF NOT EXISTS reference_entries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    kind        TEXT NOT NULL,     -- 'move' | 'ability' | 'item'
    name        TEXT NOT NULL,
    category    TEXT,              -- move type, item category, ability keyword(s)
    summary     TEXT,              -- short one-line gist for the list view
    data        TEXT NOT NULL DEFAULT '{}',  -- JSON of all fields, shown in detail
    visibility  TEXT NOT NULL DEFAULT 'public',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_reference_kind ON reference_entries (kind, name);

  CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    played_on   TEXT,              -- session date
    summary     TEXT,              -- player-facing recap
    gm_notes    TEXT,              -- GM-only prep / secrets
    order_index INTEGER NOT NULL DEFAULT 0,
    visibility  TEXT NOT NULL DEFAULT 'public',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Singleton campaign meta (OPTIONS screen: name, running summary, counters).
  CREATE TABLE IF NOT EXISTS campaign (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    name          TEXT NOT NULL DEFAULT 'POKEPALS',
    story_so_far  TEXT NOT NULL DEFAULT '',   -- curated living canon summary
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Player characters (PLAYERS menu). gm_notes is always GM-only.
  CREATE TABLE IF NOT EXISTS players (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,         -- character name
    player_name TEXT,                  -- the person playing them
    stats       TEXT NOT NULL DEFAULT '{}',   -- JSON freeform stat block
    inventory   TEXT NOT NULL DEFAULT '[]',   -- JSON: [{name, qty, notes}]
    gm_notes    TEXT,                  -- GM-only: things the player doesn't know
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- A player's Pokémon roster.
  CREATE TABLE IF NOT EXISTS roster_pokemon (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    species     TEXT NOT NULL,
    nickname    TEXT,
    level       INTEGER,
    status      TEXT,                  -- Healthy / Fainted / Poisoned ...
    moves       TEXT NOT NULL DEFAULT '[]',   -- JSON array
    gm_notes    TEXT,                  -- GM-only
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- WORLD: NPCs, locations, factions.
  CREATE TABLE IF NOT EXISTS npcs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    description  TEXT,
    relationship TEXT,                 -- relationship notes
    last_seen    TEXT,                 -- last seen location
    gm_notes     TEXT,
    visibility   TEXT NOT NULL DEFAULT 'public',
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS locations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    region      TEXT,
    description TEXT,
    gm_notes    TEXT,
    visibility  TEXT NOT NULL DEFAULT 'public',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS factions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    description  TEXT,
    relationship TEXT,                 -- standing with the party
    gm_notes     TEXT,
    visibility   TEXT NOT NULL DEFAULT 'public',
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- RULES: keyword/natural-language searchable rules, tagged by category.
  CREATE TABLE IF NOT EXISTS rules_entries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    category    TEXT,                  -- Combat / Catching / Status / Movement ...
    body        TEXT,                  -- the rules text
    page        INTEGER,               -- source page in the rulebook, if known
    source      TEXT NOT NULL DEFAULT 'gm',   -- 'rulebook' | 'gm'
    visibility  TEXT NOT NULL DEFAULT 'public',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_rules_category ON rules_entries (category);

  CREATE INDEX IF NOT EXISTS idx_roster_player ON roster_pokemon (player_id);
`);

// Ensure the singleton campaign row exists.
db.prepare('INSERT OR IGNORE INTO campaign (id) VALUES (1)').run();


// --- Lightweight migrations ----------------------------------------------
// Add any columns missing from an older pokemon table (the PTE profile fields
// were introduced after the first release). Safe to run on every startup.
const pokemonCols = new Set(db.prepare('PRAGMA table_info(pokemon)').all().map((c) => c.name));
const POKEMON_ADDITIONS = {
  power: 'INTEGER',
  size: 'TEXT',
  weight_class: 'INTEGER',
  diet: 'TEXT',
  evo_stage: 'INTEGER',
  capabilities: "TEXT NOT NULL DEFAULT '{}'",
  skills: "TEXT NOT NULL DEFAULT '{}'",
};
for (const [col, type] of Object.entries(POKEMON_ADDITIONS)) {
  if (!pokemonCols.has(col)) db.exec(`ALTER TABLE pokemon ADD COLUMN ${col} ${type}`);
}

export default db;
export { DATA_DIR };

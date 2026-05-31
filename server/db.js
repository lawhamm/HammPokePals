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
`);

export default db;
export { DATA_DIR };

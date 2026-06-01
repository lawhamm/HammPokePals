// Compendium API — the heart of the MVP. Full CRUD for the GM, read-only and
// visibility-filtered for players. Supports text search and type filtering.

import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../db.js';
import { requireGM } from '../auth.js';
import { visibilityClause, parseJSON, redactForPlayer, normVisibility } from '../util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', '..', 'data', 'uploads', 'pokemon'),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
});

// JSON columns that need parse on the way out / stringify on the way in.
const JSON_FIELDS = ['types', 'stats', 'abilities', 'moves', 'capabilities'];

function rowToApi(row, isGM) {
  if (!row) return row;
  const out = { ...row };
  out.types = parseJSON(row.types, []);
  out.stats = parseJSON(row.stats, {});
  out.abilities = parseJSON(row.abilities, []);
  out.moves = parseJSON(row.moves, []);
  out.capabilities = parseJSON(row.capabilities, {});
  return isGM ? out : redactForPlayer(out);
}

// Accept capabilities as a grouped object {movement,combat,narrative} (each an
// array or comma string), a JSON string of the same (as stored in the DB, so
// PUT round-trips an unchanged value), or a flat array/string -> "movement".
function coerceCapabilities(v) {
  if (typeof v === 'string') {
    const parsed = parseJSON(v, null);
    if (parsed && typeof parsed === 'object') v = parsed;
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const out = {};
    for (const g of ['movement', 'combat', 'narrative']) {
      const list = coerceArray(v[g]);
      if (list.length) out[g] = list;
    }
    return out;
  }
  const list = coerceArray(v);
  return list.length ? { movement: list } : {};
}

function bodyToColumns(body) {
  return {
    dex_no: body.dex_no === '' || body.dex_no == null ? null : Number(body.dex_no),
    name: (body.name || '').trim(),
    category: body.category ?? null,
    types: JSON.stringify(coerceArray(body.types)),
    description: body.description ?? null,
    habitat: body.habitat ?? null,
    rarity: body.rarity ?? null,
    stats: JSON.stringify(body.stats && typeof body.stats === 'object' ? body.stats : parseJSON(body.stats, {})),
    abilities: JSON.stringify(coerceArray(body.abilities)),
    moves: JSON.stringify(coerceArray(body.moves)),
    capture_rules: body.capture_rules ?? null,
    image: body.image ?? null,
    gm_notes: body.gm_notes ?? null,
    power: body.power === '' || body.power == null ? null : Number(body.power),
    size: body.size ?? null,
    weight_class:
      body.weight_class === '' || body.weight_class == null ? null : Number(body.weight_class),
    diet: body.diet ?? null,
    evo_stage: body.evo_stage === '' || body.evo_stage == null ? null : Number(body.evo_stage),
    capabilities: JSON.stringify(coerceCapabilities(body.capabilities)),
    visibility: normVisibility(body.visibility),
  };
}

function coerceArray(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === 'string') {
    const parsed = parseJSON(v, null);
    if (Array.isArray(parsed)) return parsed;
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

// GET /api/pokemon — list with optional ?search= and ?type=
router.get('/', (req, res) => {
  const where = [];
  const params = [];

  const vis = visibilityClause(req.isGM);
  if (vis.sql) where.push(vis.sql);

  if (req.query.search) {
    where.push('(name LIKE ? OR description LIKE ? OR category LIKE ?)');
    const like = `%${req.query.search}%`;
    params.push(like, like, like);
  }
  if (req.query.type) {
    where.push('types LIKE ?');
    params.push(`%"${req.query.type}"%`);
  }

  const sql =
    'SELECT * FROM pokemon' +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ' ORDER BY (dex_no IS NULL), dex_no, name';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map((r) => rowToApi(r, req.isGM)));
});

// GET /api/pokemon/types — distinct list of types currently in use (for filters)
router.get('/types', (req, res) => {
  const vis = visibilityClause(req.isGM);
  const sql = 'SELECT types FROM pokemon' + (vis.sql ? ` WHERE ${vis.sql}` : '');
  const set = new Set();
  for (const row of db.prepare(sql).all()) {
    for (const t of parseJSON(row.types, [])) set.add(t);
  }
  res.json([...set].sort());
});

// GET /api/pokemon/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM pokemon WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (!req.isGM && row.visibility !== 'public') return res.status(404).json({ error: 'Not found' });
  res.json(rowToApi(row, req.isGM));
});

// POST /api/pokemon  (GM)
router.post('/', requireGM, (req, res) => {
  const c = bodyToColumns(req.body);
  if (!c.name) return res.status(400).json({ error: 'Name is required' });
  const cols = Object.keys(c);
  const stmt = db.prepare(
    `INSERT INTO pokemon (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
  );
  const info = stmt.run(...cols.map((k) => c[k]));
  const row = db.prepare('SELECT * FROM pokemon WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(rowToApi(row, true));
});

// PUT /api/pokemon/:id  (GM)
router.put('/:id', requireGM, (req, res) => {
  const existing = db.prepare('SELECT * FROM pokemon WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const c = bodyToColumns({ ...existing, ...req.body });
  if (!c.name) return res.status(400).json({ error: 'Name is required' });
  const cols = Object.keys(c);
  db.prepare(
    `UPDATE pokemon SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`
  ).run(...cols.map((k) => c[k]), req.params.id);
  const row = db.prepare('SELECT * FROM pokemon WHERE id = ?').get(req.params.id);
  res.json(rowToApi(row, true));
});

// DELETE /api/pokemon/:id  (GM)
router.delete('/:id', requireGM, (req, res) => {
  const info = db.prepare('DELETE FROM pokemon WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// POST /api/pokemon/:id/image  (GM) — upload an artwork file
router.post('/:id/image', requireGM, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const rel = `/uploads/pokemon/${req.file.filename}`;
  db.prepare("UPDATE pokemon SET image = ?, updated_at = datetime('now') WHERE id = ?").run(
    rel,
    req.params.id
  );
  res.json({ image: rel });
});

export default router;
export { JSON_FIELDS };

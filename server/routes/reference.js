// Reference catalogue API — moves, abilities, and items pulled from the
// rulebook/workbook. Read-only and visibility-filtered; the data is bulk-loaded
// from seed-content rather than hand-edited, so there is no CRUD here.

import express from 'express';
import db from '../db.js';
import { requireGM } from '../auth.js';
import { visibilityClause, parseJSON, normVisibility } from '../util.js';

const router = express.Router();
const KINDS = new Set(['move', 'ability', 'item']);

function rowToApi(row) {
  if (!row) return row;
  return { ...row, data: parseJSON(row.data, {}) };
}

// Normalize an incoming body into reference columns.
function bodyToColumns(body, existing = {}) {
  const kind = KINDS.has(body.kind) ? body.kind : existing.kind || 'item';
  let data = body.data ?? existing.data ?? {};
  if (typeof data === 'string') data = parseJSON(data, {});
  return {
    kind,
    name: (body.name ?? existing.name ?? '').trim(),
    category: body.category ?? existing.category ?? null,
    summary: body.summary ?? existing.summary ?? null,
    data: JSON.stringify(data && typeof data === 'object' ? data : {}),
    visibility: normVisibility(body.visibility ?? existing.visibility),
  };
}

// GET /api/reference?kind=move&search=tackle
// Returns matching entries (capped) plus the total count so the UI can show
// "showing N of M — refine your search".
router.get('/', (req, res) => {
  const where = [];
  const params = [];

  const vis = visibilityClause(req.isGM);
  if (vis.sql) where.push(vis.sql);

  if (req.query.kind && KINDS.has(req.query.kind)) {
    where.push('kind = ?');
    params.push(req.query.kind);
  }
  if (req.query.search) {
    where.push('(name LIKE ? OR summary LIKE ? OR category LIKE ?)');
    const like = `%${req.query.search}%`;
    params.push(like, like, like);
  }

  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM reference_entries${whereSql}`).get(...params).n;

  const limit = Math.min(Number(req.query.limit) || 300, 1000);
  const rows = db
    .prepare(`SELECT * FROM reference_entries${whereSql} ORDER BY name LIMIT ?`)
    .all(...params, limit);

  res.json({ total, limit, items: rows.map(rowToApi) });
});

// GET /api/reference/counts — how many entries of each kind are visible.
router.get('/counts', (req, res) => {
  const vis = visibilityClause(req.isGM);
  const sql =
    'SELECT kind, COUNT(*) AS n FROM reference_entries' +
    (vis.sql ? ` WHERE ${vis.sql}` : '') +
    ' GROUP BY kind';
  const out = {};
  for (const r of db.prepare(sql).all()) out[r.kind] = r.n;
  res.json(out);
});

// GET /api/reference/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM reference_entries WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (!req.isGM && row.visibility !== 'public') return res.status(404).json({ error: 'Not found' });
  res.json(rowToApi(row));
});

// POST /api/reference  (GM) — add a move/ability/item.
router.post('/', requireGM, (req, res) => {
  const c = bodyToColumns(req.body);
  if (!c.name) return res.status(400).json({ error: 'Name is required' });
  const cols = Object.keys(c);
  const info = db
    .prepare(`INSERT INTO reference_entries (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...cols.map((k) => c[k]));
  res.status(201).json(rowToApi(db.prepare('SELECT * FROM reference_entries WHERE id = ?').get(info.lastInsertRowid)));
});

// PUT /api/reference/:id  (GM)
router.put('/:id', requireGM, (req, res) => {
  const existing = db.prepare('SELECT * FROM reference_entries WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const c = bodyToColumns(req.body, { ...existing, data: parseJSON(existing.data, {}) });
  if (!c.name) return res.status(400).json({ error: 'Name is required' });
  const cols = Object.keys(c);
  db.prepare(`UPDATE reference_entries SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...cols.map((k) => c[k]), req.params.id);
  res.json(rowToApi(db.prepare('SELECT * FROM reference_entries WHERE id = ?').get(req.params.id)));
});

// DELETE /api/reference/:id  (GM)
router.delete('/:id', requireGM, (req, res) => {
  const info = db.prepare('DELETE FROM reference_entries WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;

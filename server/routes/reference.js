// Reference catalogue API — moves, abilities, and items pulled from the
// rulebook/workbook. Read-only and visibility-filtered; the data is bulk-loaded
// from seed-content rather than hand-edited, so there is no CRUD here.

import express from 'express';
import db from '../db.js';
import { visibilityClause, parseJSON } from '../util.js';

const router = express.Router();
const KINDS = new Set(['move', 'ability', 'item']);

function rowToApi(row) {
  if (!row) return row;
  return { ...row, data: parseJSON(row.data, {}) };
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

export default router;

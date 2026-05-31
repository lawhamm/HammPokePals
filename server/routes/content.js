// Generic CRUD router factory for the straightforward content tables
// (inventory items, story entries, session notes). Each shares the same shape:
// visibility-filtered reads for players, full CRUD for the GM, optional gm_notes
// redaction. Maps and Pokemon have their own modules because of image handling.

import express from 'express';
import db from '../db.js';
import { requireGM } from '../auth.js';
import { visibilityClause, redactForPlayer, normVisibility } from '../util.js';

/**
 * @param {object} cfg
 * @param {string} cfg.table        SQL table name
 * @param {string[]} cfg.fields     editable columns (excluding id/timestamps/visibility)
 * @param {string} cfg.orderBy      ORDER BY clause
 * @param {string[]} [cfg.gmFields] columns to strip for players (default ['gm_notes'])
 * @param {string} [cfg.required]   a field that must be non-empty on create
 */
export function makeContentRouter(cfg) {
  const router = express.Router();
  const gmFields = cfg.gmFields ?? ['gm_notes'];
  const allCols = [...cfg.fields, 'visibility'];

  const shape = (row, isGM) => (isGM ? row : redactForPlayer(row, gmFields));

  const pick = (body, existing = {}) => {
    const out = {};
    for (const f of cfg.fields) {
      out[f] = f in body ? body[f] : existing[f] ?? null;
    }
    out.visibility = normVisibility('visibility' in body ? body.visibility : existing.visibility);
    return out;
  };

  router.get('/', (req, res) => {
    const vis = visibilityClause(req.isGM);
    const sql =
      `SELECT * FROM ${cfg.table}` +
      (vis.sql ? ` WHERE ${vis.sql}` : '') +
      ` ORDER BY ${cfg.orderBy}`;
    res.json(db.prepare(sql).all().map((r) => shape(r, req.isGM)));
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (!req.isGM && row.visibility !== 'public') return res.status(404).json({ error: 'Not found' });
    res.json(shape(row, req.isGM));
  });

  router.post('/', requireGM, (req, res) => {
    const c = pick(req.body);
    if (cfg.required && !String(c[cfg.required] ?? '').trim()) {
      return res.status(400).json({ error: `${cfg.required} is required` });
    }
    const cols = allCols;
    const info = db
      .prepare(`INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
      .run(...cols.map((k) => c[k]));
    res.status(201).json(db.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).get(info.lastInsertRowid));
  });

  router.put('/:id', requireGM, (req, res) => {
    const existing = db.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const c = pick(req.body, existing);
    const cols = allCols;
    db.prepare(
      `UPDATE ${cfg.table} SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`
    ).run(...cols.map((k) => c[k]), req.params.id);
    res.json(db.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).get(req.params.id));
  });

  router.delete('/:id', requireGM, (req, res) => {
    const info = db.prepare(`DELETE FROM ${cfg.table} WHERE id = ?`).run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  });

  return router;
}

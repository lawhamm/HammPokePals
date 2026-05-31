// Maps — image-backed region maps with pin markers. Individual markers carry
// their own visibility, so a player viewing a public map still won't see the
// GM's "ambush here" pin.

import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../db.js';
import { requireGM } from '../auth.js';
import { visibilityClause, parseJSON, normVisibility } from '../util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', '..', 'data', 'uploads', 'maps'),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 30 * 1024 * 1024 },
});

function rowToApi(row, isGM) {
  const out = { ...row };
  let markers = parseJSON(row.markers, []);
  if (!isGM) markers = markers.filter((m) => (m.visibility ?? 'public') === 'public');
  out.markers = markers;
  return out;
}

router.get('/', (req, res) => {
  const vis = visibilityClause(req.isGM);
  const sql = 'SELECT * FROM maps' + (vis.sql ? ` WHERE ${vis.sql}` : '') + ' ORDER BY region, title';
  res.json(db.prepare(sql).all().map((r) => rowToApi(r, req.isGM)));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM maps WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (!req.isGM && row.visibility !== 'public') return res.status(404).json({ error: 'Not found' });
  res.json(rowToApi(row, req.isGM));
});

function pick(body, existing = {}) {
  return {
    title: body.title ?? existing.title ?? '',
    region: body.region ?? existing.region ?? null,
    description: body.description ?? existing.description ?? null,
    image: body.image ?? existing.image ?? null,
    markers: JSON.stringify(
      Array.isArray(body.markers) ? body.markers : parseJSON(body.markers, parseJSON(existing.markers, []))
    ),
    visibility: normVisibility('visibility' in body ? body.visibility : existing.visibility),
  };
}

router.post('/', requireGM, (req, res) => {
  const c = pick(req.body);
  if (!c.title.trim()) return res.status(400).json({ error: 'title is required' });
  const cols = Object.keys(c);
  const info = db
    .prepare(`INSERT INTO maps (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...cols.map((k) => c[k]));
  res.status(201).json(rowToApi(db.prepare('SELECT * FROM maps WHERE id = ?').get(info.lastInsertRowid), true));
});

router.put('/:id', requireGM, (req, res) => {
  const existing = db.prepare('SELECT * FROM maps WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const c = pick(req.body, existing);
  const cols = Object.keys(c);
  db.prepare(
    `UPDATE maps SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`
  ).run(...cols.map((k) => c[k]), req.params.id);
  res.json(rowToApi(db.prepare('SELECT * FROM maps WHERE id = ?').get(req.params.id), true));
});

router.delete('/:id', requireGM, (req, res) => {
  const info = db.prepare('DELETE FROM maps WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

router.post('/:id/image', requireGM, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const rel = `/uploads/maps/${req.file.filename}`;
  db.prepare("UPDATE maps SET image = ?, updated_at = datetime('now') WHERE id = ?").run(rel, req.params.id);
  res.json({ image: rel });
});

export default router;

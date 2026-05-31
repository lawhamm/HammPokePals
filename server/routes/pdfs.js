// Rules library — stores and serves PDF documents (PTE core rules, GM guide,
// bestiary, etc.). Players only see docs marked 'public'; the GM guide is
// typically stored with visibility 'gm' so it never reaches a player's device.

import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../db.js';
import { requireGM } from '../auth.js';
import { visibilityClause, normVisibility } from '../util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_DIR = path.join(__dirname, '..', '..', 'data', 'uploads', 'pdfs');
const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: PDF_DIR,
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

// GET /api/pdfs — list metadata (filtered by visibility)
router.get('/', (req, res) => {
  const vis = visibilityClause(req.isGM);
  const sql =
    'SELECT id, title, category, description, filename, visibility, uploaded_at FROM pdf_docs' +
    (vis.sql ? ` WHERE ${vis.sql}` : '') +
    ' ORDER BY category, title';
  res.json(db.prepare(sql).all());
});

// GET /api/pdfs/:id/file — stream the actual PDF (visibility enforced)
router.get('/:id/file', (req, res) => {
  const row = db.prepare('SELECT * FROM pdf_docs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (!req.isGM && row.visibility !== 'public') return res.status(404).json({ error: 'Not found' });
  const filePath = path.join(PDF_DIR, row.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing on disk' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${row.title.replace(/"/g, '')}.pdf"`);
  fs.createReadStream(filePath).pipe(res);
});

// POST /api/pdfs  (GM) — upload a new document
router.post('/', requireGM, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'A PDF file is required' });
  const info = db
    .prepare(
      'INSERT INTO pdf_docs (title, category, description, filename, visibility) VALUES (?, ?, ?, ?, ?)'
    )
    .run(
      (req.body.title || req.file.originalname.replace(/\.pdf$/i, '')).trim(),
      req.body.category || 'Uncategorized',
      req.body.description || null,
      req.file.filename,
      normVisibility(req.body.visibility)
    );
  res.status(201).json(db.prepare('SELECT * FROM pdf_docs WHERE id = ?').get(info.lastInsertRowid));
});

// PUT /api/pdfs/:id  (GM) — edit metadata (title/category/description/visibility)
router.put('/:id', requireGM, (req, res) => {
  const row = db.prepare('SELECT * FROM pdf_docs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare(
    'UPDATE pdf_docs SET title = ?, category = ?, description = ?, visibility = ? WHERE id = ?'
  ).run(
    req.body.title ?? row.title,
    req.body.category ?? row.category,
    req.body.description ?? row.description,
    normVisibility(req.body.visibility ?? row.visibility),
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM pdf_docs WHERE id = ?').get(req.params.id));
});

// DELETE /api/pdfs/:id  (GM)
router.delete('/:id', requireGM, (req, res) => {
  const row = db.prepare('SELECT * FROM pdf_docs WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const filePath = path.join(PDF_DIR, row.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM pdf_docs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;

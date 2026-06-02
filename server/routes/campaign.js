// Campaign meta — the singleton row behind the OPTIONS screen and the title
// header: campaign name, the curated "Story So Far" summary, plus derived
// counters (session count, current date). GM-editable.

import express from 'express';
import db from '../db.js';
import { requireGM } from '../auth.js';

const router = express.Router();

function snapshot() {
  const row = db.prepare('SELECT name, story_so_far FROM campaign WHERE id = 1').get() || {};
  const sessionCount = db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n;
  return {
    name: row.name || 'POKEPALS',
    story_so_far: row.story_so_far || '',
    session_count: sessionCount,
    current_date: new Date().toISOString().slice(0, 10),
  };
}

// GET /api/campaign — always available (read-only for players).
router.get('/', (_req, res) => res.json(snapshot()));

// PUT /api/campaign  (GM) — update name and/or the Story So Far summary.
router.put('/', requireGM, (req, res) => {
  const cur = db.prepare('SELECT name, story_so_far FROM campaign WHERE id = 1').get();
  const name = (req.body.name ?? cur.name ?? '').trim() || 'POKEPALS';
  const story = req.body.story_so_far ?? cur.story_so_far ?? '';
  db.prepare("UPDATE campaign SET name = ?, story_so_far = ?, updated_at = datetime('now') WHERE id = 1")
    .run(name, story);
  res.json(snapshot());
});

export default router;

// RULES — a keyword + natural-language searchable rules compendium, tagged by
// category. CRUD for the GM, read-only for players. The /search endpoint uses
// Claude (claude-opus-4-8) to answer natural-language questions over the rules
// when ANTHROPIC_API_KEY is set, and falls back to keyword search otherwise.

import express from 'express';
import db from '../db.js';
import { requireGM } from '../auth.js';
import { visibilityClause, normVisibility } from '../util.js';

const router = express.Router();

// Lazily-created Anthropic client (only if the SDK is installed and a key is set).
let anthropic = null;
let anthropicTried = false;
async function getAnthropic() {
  if (anthropicTried) return anthropic;
  anthropicTried = true;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    anthropic = new Anthropic();
  } catch {
    anthropic = null; // SDK not installed — fall back to keyword search.
  }
  return anthropic;
}

function visibleRules(isGM) {
  const vis = visibilityClause(isGM);
  const sql = 'SELECT * FROM rules_entries' + (vis.sql ? ` WHERE ${vis.sql}` : '');
  return db.prepare(sql).all();
}

function bodyToColumns(body, existing = {}) {
  return {
    title: (body.title ?? existing.title ?? '').trim(),
    category: body.category ?? existing.category ?? null,
    body: body.body ?? existing.body ?? null,
    page: body.page === '' || body.page == null ? existing.page ?? null : Number(body.page),
    source: body.source ?? existing.source ?? 'gm',
    visibility: normVisibility(body.visibility ?? existing.visibility),
  };
}

// GET /api/rules?search=&category=
router.get('/', (req, res) => {
  const where = [];
  const params = [];
  const vis = visibilityClause(req.isGM);
  if (vis.sql) where.push(vis.sql);
  if (req.query.category) {
    where.push('category = ?');
    params.push(req.query.category);
  }
  if (req.query.search) {
    where.push('(title LIKE ? OR body LIKE ? OR category LIKE ?)');
    const like = `%${req.query.search}%`;
    params.push(like, like, like);
  }
  const sql =
    'SELECT * FROM rules_entries' +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ' ORDER BY category, title';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/rules/categories — distinct tags (for tag browsing).
router.get('/categories', (req, res) => {
  const vis = visibilityClause(req.isGM);
  const sql =
    'SELECT category, COUNT(*) AS n FROM rules_entries' +
    (vis.sql ? ` WHERE ${vis.sql}` : '') +
    ' GROUP BY category ORDER BY category';
  res.json(db.prepare(sql).all().filter((r) => r.category));
});

// POST /api/rules/search { query } — natural-language answer + matching entries.
// Always returns keyword matches; adds an AI `answer` + cited entries when Claude
// is available.
router.post('/search', async (req, res) => {
  const query = String(req.body?.query ?? '').trim();
  if (!query) return res.status(400).json({ error: 'A query is required' });

  const all = visibleRules(req.isGM);
  // Keyword prefilter (always computed; also the fallback).
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = all
    .map((r) => {
      const hay = `${r.title} ${r.category} ${r.body || ''}`.toLowerCase();
      let score = 0;
      for (const t of terms) if (hay.includes(t)) score++;
      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r);

  const client = await getAnthropic();
  if (!client || all.length === 0) {
    return res.json({ answer: null, ai: false, results: scored.slice(0, 25) });
  }

  // Build a compact, stable rules corpus for the model. Cap to keep tokens sane.
  const corpus = all
    .slice(0, 400)
    .map((r) => `#${r.id} [${r.category || 'Misc'}] ${r.title}\n${(r.body || '').slice(0, 800)}`)
    .join('\n\n');

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      system: [
        {
          type: 'text',
          text:
            'You are the rules reference assistant for a homebrew Pokémon tabletop RPG (PTE). ' +
            'Answer the game master\'s question using ONLY the rules entries provided. ' +
            'Be concise and concrete. If the rules do not cover it, say so plainly. ' +
            'Cite the entry IDs you used as a JSON array. ' +
            'Respond as strict JSON: {"answer": string, "cited_ids": number[]}.\n\n' +
            'RULES ENTRIES:\n' +
            corpus,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: query }],
    });
    const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    let parsed = null;
    try {
      parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    } catch {
      parsed = { answer: text, cited_ids: [] };
    }
    const citedIds = Array.isArray(parsed.cited_ids) ? parsed.cited_ids : [];
    const byId = new Map(all.map((r) => [r.id, r]));
    const cited = citedIds.map((id) => byId.get(Number(id))).filter(Boolean);
    const results = cited.length ? cited : scored.slice(0, 25);
    res.json({ answer: parsed.answer || null, ai: true, results });
  } catch (e) {
    // Any API failure → graceful keyword fallback.
    res.json({ answer: null, ai: false, error: e.message, results: scored.slice(0, 25) });
  }
});

// GET /api/rules/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM rules_entries WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (!req.isGM && row.visibility !== 'public') return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.post('/', requireGM, (req, res) => {
  const c = bodyToColumns(req.body);
  if (!c.title) return res.status(400).json({ error: 'Title is required' });
  const cols = Object.keys(c);
  const info = db
    .prepare(`INSERT INTO rules_entries (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...cols.map((k) => c[k]));
  res.status(201).json(db.prepare('SELECT * FROM rules_entries WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', requireGM, (req, res) => {
  const existing = db.prepare('SELECT * FROM rules_entries WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const c = bodyToColumns(req.body, existing);
  if (!c.title) return res.status(400).json({ error: 'Title is required' });
  const cols = Object.keys(c);
  db.prepare(`UPDATE rules_entries SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
    .run(...cols.map((k) => c[k]), req.params.id);
  res.json(db.prepare('SELECT * FROM rules_entries WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requireGM, (req, res) => {
  const info = db.prepare('DELETE FROM rules_entries WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;

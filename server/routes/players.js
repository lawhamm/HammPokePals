// PLAYERS — player characters and their Pokémon rosters. Everyone can read a
// character sheet; only the GM sees gm_notes (things the player doesn't know yet)
// and only the GM can edit. Roster Pokémon are a nested resource under a player.

import express from 'express';
import db from '../db.js';
import { requireGM } from '../auth.js';
import { parseJSON } from '../util.js';

const router = express.Router();

function rosterToApi(row, isGM) {
  const out = { ...row, moves: parseJSON(row.moves, []) };
  if (!isGM) delete out.gm_notes;
  return out;
}

function playerToApi(row, isGM, { withRoster = true } = {}) {
  if (!row) return row;
  const out = {
    ...row,
    stats: parseJSON(row.stats, {}),
    inventory: parseJSON(row.inventory, []),
  };
  if (!isGM) delete out.gm_notes;
  if (withRoster) {
    const roster = db
      .prepare('SELECT * FROM roster_pokemon WHERE player_id = ? ORDER BY order_index, id')
      .all(row.id);
    out.roster = roster.map((r) => rosterToApi(r, isGM));
  }
  return out;
}

function playerColumns(body, existing = {}) {
  const stats = body.stats ?? existing.stats ?? {};
  const inventory = body.inventory ?? existing.inventory ?? [];
  return {
    name: (body.name ?? existing.name ?? '').trim(),
    player_name: body.player_name ?? existing.player_name ?? null,
    stats: JSON.stringify(typeof stats === 'object' ? stats : parseJSON(stats, {})),
    inventory: JSON.stringify(Array.isArray(inventory) ? inventory : parseJSON(inventory, [])),
    gm_notes: body.gm_notes ?? existing.gm_notes ?? null,
    order_index: Number(body.order_index ?? existing.order_index ?? 0) || 0,
  };
}

function rosterColumns(body, existing = {}) {
  const moves = body.moves ?? existing.moves ?? [];
  return {
    species: (body.species ?? existing.species ?? '').trim(),
    nickname: body.nickname ?? existing.nickname ?? null,
    level: body.level === '' || body.level == null ? existing.level ?? null : Number(body.level),
    status: body.status ?? existing.status ?? null,
    moves: JSON.stringify(
      Array.isArray(moves)
        ? moves.map((m) => String(m).trim()).filter(Boolean)
        : String(moves).split(',').map((s) => s.trim()).filter(Boolean)
    ),
    gm_notes: body.gm_notes ?? existing.gm_notes ?? null,
    order_index: Number(body.order_index ?? existing.order_index ?? 0) || 0,
  };
}

// --- players --------------------------------------------------------------
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM players ORDER BY order_index, name').all();
  res.json(rows.map((r) => playerToApi(r, req.isGM, { withRoster: false })));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(playerToApi(row, req.isGM));
});

router.post('/', requireGM, (req, res) => {
  const c = playerColumns(req.body);
  if (!c.name) return res.status(400).json({ error: 'Name is required' });
  const cols = Object.keys(c);
  const info = db
    .prepare(`INSERT INTO players (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...cols.map((k) => c[k]));
  res.status(201).json(playerToApi(db.prepare('SELECT * FROM players WHERE id = ?').get(info.lastInsertRowid), true));
});

router.put('/:id', requireGM, (req, res) => {
  const existing = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const c = playerColumns(req.body, {
    ...existing,
    stats: parseJSON(existing.stats, {}),
    inventory: parseJSON(existing.inventory, []),
  });
  if (!c.name) return res.status(400).json({ error: 'Name is required' });
  const cols = Object.keys(c);
  db.prepare(`UPDATE players SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
    .run(...cols.map((k) => c[k]), req.params.id);
  res.json(playerToApi(db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id), true));
});

router.delete('/:id', requireGM, (req, res) => {
  const info = db.prepare('DELETE FROM players WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// --- roster (nested under a player) --------------------------------------
router.post('/:id/roster', requireGM, (req, res) => {
  const player = db.prepare('SELECT id FROM players WHERE id = ?').get(req.params.id);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  const c = rosterColumns(req.body);
  if (!c.species) return res.status(400).json({ error: 'Species is required' });
  const cols = ['player_id', ...Object.keys(c)];
  const vals = [req.params.id, ...Object.keys(c).map((k) => c[k])];
  const info = db
    .prepare(`INSERT INTO roster_pokemon (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...vals);
  res.status(201).json(rosterToApi(db.prepare('SELECT * FROM roster_pokemon WHERE id = ?').get(info.lastInsertRowid), true));
});

router.put('/:id/roster/:rid', requireGM, (req, res) => {
  const existing = db
    .prepare('SELECT * FROM roster_pokemon WHERE id = ? AND player_id = ?')
    .get(req.params.rid, req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const c = rosterColumns(req.body, { ...existing, moves: parseJSON(existing.moves, []) });
  if (!c.species) return res.status(400).json({ error: 'Species is required' });
  const cols = Object.keys(c);
  db.prepare(`UPDATE roster_pokemon SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
    .run(...cols.map((k) => c[k]), req.params.rid);
  res.json(rosterToApi(db.prepare('SELECT * FROM roster_pokemon WHERE id = ?').get(req.params.rid), true));
});

router.delete('/:id/roster/:rid', requireGM, (req, res) => {
  const info = db
    .prepare('DELETE FROM roster_pokemon WHERE id = ? AND player_id = ?')
    .run(req.params.rid, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;

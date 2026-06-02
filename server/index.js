// HammPokePals server entry point.
// One process serves the API and the static front-end. Run with `npm start`.

import express from 'express';
import cookieParser from 'cookie-parser';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATA_DIR } from './db.js';
import { attachRole, requireGM, login, logout, COOKIE, config } from './auth.js';
import pokemonRouter from './routes/pokemon.js';
import pdfRouter from './routes/pdfs.js';
import mapsRouter from './routes/maps.js';
import referenceRouter from './routes/reference.js';
import campaignRouter from './routes/campaign.js';
import playersRouter from './routes/players.js';
import rulesRouter from './routes/rules.js';
import { makeContentRouter } from './routes/content.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(attachRole);

// --- Auth endpoints -------------------------------------------------------
app.post('/api/auth/login', (req, res) => {
  const token = login(req.body?.passcode ?? '');
  if (!token) return res.status(401).json({ error: 'Incorrect passcode' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax' });
  res.json({ role: 'gm' });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (token) logout(token);
  res.clearCookie(COOKIE);
  res.json({ role: 'player' });
});

// Tells the front-end who it's talking to and how to label the app.
app.get('/api/me', (req, res) => {
  res.json({ role: req.isGM ? 'gm' : 'player', appName: config.appName });
});

// --- Content routers ------------------------------------------------------
app.use('/api/pokemon', pokemonRouter);
app.use('/api/pdfs', pdfRouter);
app.use('/api/maps', mapsRouter);
app.use('/api/reference', referenceRouter);
app.use('/api/campaign', campaignRouter);
app.use('/api/players', playersRouter);
app.use('/api/rules', rulesRouter);

// WORLD: NPCs, locations, factions — straightforward visibility-filtered CRUD.
app.use(
  '/api/npcs',
  makeContentRouter({
    table: 'npcs',
    fields: ['name', 'description', 'relationship', 'last_seen', 'gm_notes'],
    orderBy: 'name',
    required: 'name',
  })
);

app.use(
  '/api/locations',
  makeContentRouter({
    table: 'locations',
    fields: ['name', 'region', 'description', 'gm_notes'],
    orderBy: 'name',
    required: 'name',
  })
);

app.use(
  '/api/factions',
  makeContentRouter({
    table: 'factions',
    fields: ['name', 'description', 'relationship', 'gm_notes'],
    orderBy: 'name',
    required: 'name',
  })
);

app.use(
  '/api/items',
  makeContentRouter({
    table: 'items',
    fields: ['name', 'category', 'description', 'quantity', 'owner', 'value', 'gm_notes'],
    orderBy: 'category, name',
    required: 'name',
  })
);

app.use(
  '/api/story',
  makeContentRouter({
    table: 'story_entries',
    fields: ['title', 'chapter', 'body'],
    orderBy: 'id',
    gmFields: [],
    required: 'title',
  })
);

app.use(
  '/api/sessions',
  makeContentRouter({
    table: 'sessions',
    fields: ['title', 'played_on', 'summary', 'gm_notes'],
    orderBy: 'played_on DESC, id DESC',
    required: 'title',
  })
);

// --- Static assets & uploads ---------------------------------------------
// Uploaded files (Pokemon art, map images) are served directly; PDFs are NOT
// served statically — they go through /api/pdfs/:id/file so visibility is enforced.
app.use('/uploads/pokemon', express.static(path.join(DATA_DIR, 'uploads', 'pokemon')));
app.use('/uploads/maps', express.static(path.join(DATA_DIR, 'uploads', 'maps')));
app.use(express.static(PUBLIC_DIR));

// SPA fallback for client-side routes.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// --- Error handler --------------------------------------------------------
app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, () => {
  const nets = os.networkInterfaces();
  const lan = Object.values(nets)
    .flat()
    .find((n) => n && n.family === 'IPv4' && !n.internal);
  console.log(`\n  ${config.appName} is running.`);
  console.log(`  GM / local:   http://localhost:${PORT}`);
  if (lan) console.log(`  Players (LAN): http://${lan.address}:${PORT}`);
  console.log('\n  Press Ctrl+C to stop.\n');
});

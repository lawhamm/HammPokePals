// GM authentication. Deliberately lightweight: this is a local app for one game
// group, not a public service. The GM unlocks the GM view with a passcode; on
// success the server issues a random token stored in an httpOnly cookie and
// remembered in memory. Players need nothing — they get the public view.
//
// The passcode lives in server/config.local.json (gitignored). On first run we
// create it with a default and print a reminder to change it.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'config.local.json');

const DEFAULT_CONFIG = { gmPasscode: 'changeme', appName: 'HammPokePals' };

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    console.log(
      '\n[auth] Created server/config.local.json with default GM passcode "changeme".' +
        '\n[auth] Change it before sharing the app with players.\n'
    );
    return { ...DEFAULT_CONFIG };
  }
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
  } catch {
    console.warn('[auth] config.local.json is invalid JSON; falling back to defaults.');
    return { ...DEFAULT_CONFIG };
  }
}

const config = loadConfig();

// Active GM session tokens (cleared on restart — re-login is cheap).
const gmTokens = new Set();
const COOKIE = 'hpp_gm';

function timingSafeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function login(passcode) {
  if (!timingSafeEqual(passcode, config.gmPasscode)) return null;
  const token = crypto.randomBytes(24).toString('hex');
  gmTokens.add(token);
  return token;
}

export function logout(token) {
  gmTokens.delete(token);
}

// Marks req.isGM based on the cookie. Always runs; never blocks.
export function attachRole(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  req.isGM = Boolean(token && gmTokens.has(token));
  next();
}

// Guard for write/GM-only endpoints.
export function requireGM(req, res, next) {
  if (req.isGM) return next();
  res.status(403).json({ error: 'GM access required. Unlock the GM view first.' });
}

export { COOKIE, config };

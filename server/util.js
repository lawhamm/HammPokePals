// Small shared helpers for the API routes.

// Returns a SQL fragment + params that hide GM-only rows from players.
// For a GM, no filter is applied.
export function visibilityClause(isGM, prefix = '') {
  if (isGM) return { sql: '', params: [] };
  const col = prefix ? `${prefix}.visibility` : 'visibility';
  return { sql: `${col} = 'public'`, params: [] };
}

// Parse a JSON column safely, returning a fallback on bad/empty data.
export function parseJSON(value, fallback) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// Strip GM-only fields from a row before sending it to a player.
export function redactForPlayer(row, gmFields = ['gm_notes']) {
  if (!row) return row;
  const copy = { ...row };
  for (const f of gmFields) delete copy[f];
  return copy;
}

// Coerce a possibly-stringified value into a normalized visibility.
export function normVisibility(v) {
  return v === 'gm' ? 'gm' : 'public';
}

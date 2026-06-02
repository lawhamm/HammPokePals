# HammPokePals — POKEPALS

A compendium, catalogue, and campaign manager for a homebrew Pokémon tabletop
RPG (built around the **PTE** ruleset), styled like a **Gen 2/3 Game Boy
game**: chunky bordered boxes, a muted GBC palette, a monospace look, a cursor
arrow, and snappy nested menus you drill into and back out of. One local app
gives **players** a read-only view; the **GM** unlocks editing with a passcode.

> Players and the GM use the **same app**. Players never log in and only ever
> see content marked *public*. The GM toggles GM Mode in **OPTIONS**.

## Menus

Everything hangs off a title-screen **MAIN MENU**:

- **CAMPAIGN** — *Session Log* (GM-editable, datestamped, newest first) and
  *Story So Far* (a curated living canon summary the GM writes).
- **PLAYERS** — each player character's sheet: stats, **Pokémon roster** (each
  with moveset, level, status, and GM notes), inventory, and a GM-only Notes
  field for things the player doesn't know yet.
- **WORLD** — searchable **NPCs** (description, relationship, last seen),
  **Locations**, and **Factions**.
- **POKEDEX** — search the species compendium (types, PTE stats, capabilities,
  skills, diet/size/power/evolution…).
- **RULES** — a keyword **and natural-language** searchable rules compendium
  (entries tagged by category — Combat, Catching, Status, Movement…), plus the
  **Moves / Abilities / Items** reference catalogues.
- **OPTIONS** — GM Mode toggle (off = read-only), campaign name, session
  counter, and current date.

GM Mode unlocks inline **create / edit / delete** across every section. Every
record carries a **visibility** flag (`public` or `gm`) enforced on the server,
so GM secrets are never sent to a player's browser — not just hidden in the UI.
Everything persists in a local SQLite database, so nothing is lost between
sessions.

### Natural-language rules search (optional)

RULES → *Search* answers plain-English questions ("how does catching work?")
over your rulebook using Claude (`claude-opus-4-8`). Set an API key to enable
it:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm start
```

Without a key (or if the call fails) it gracefully falls back to keyword search
— no setup required.

## Quick start

```bash
npm install      # one-time
npm run seed     # one-time: loads a few sample Pokémon so it isn't empty
npm start        # launches the app
```

Then open **http://localhost:3000** in your browser.

When it starts, the console also prints a **Players (LAN)** address (e.g.
`http://192.168.1.20:3000`). Anyone on your home wifi — players on their phones
or laptops at game night — can open that address and get the player view.

### Unlocking GM Mode

Go to **OPTIONS → GM MODE** and enter the passcode. The default passcode is
`changeme`, stored in `server/config.local.json` (which is git-ignored).

**Change it before sharing with players:** edit `server/config.local.json`:

```json
{ "gmPasscode": "your-secret-here", "appName": "HammPokePals" }
```

You can also rename the app there via `appName`.

## Loading your real PTE content

The seed data is just samples — replace it with your own. The easiest way is the
**bulk loader**: drop your files into `seed-content/` and run one command.

```
seed-content/
  pdfs/                 ← your PTE rule PDFs + GM guide
  pokedex.json  or .csv ← your Pokédex as a JSON array OR a CSV export
  reference.json        ← moves / abilities / items catalogue (optional)
  sources/              ← original workbooks the above are generated from
```

```bash
npm run load-content
```

This registers every PDF (a file named like a *GM guide* is automatically marked
GM-only so players never receive it), imports the Pokédex, and loads the
reference catalogue. Re-running is safe — already-loaded PDFs and existing
entries (by name) are skipped. Use `npm run load-content -- --replace-dex` (or
`--replace-reference`) to wipe and reimport. See
[`seed-content/README.md`](seed-content/README.md) for manifest options.

This repo's data was generated from the PTE Character Sheet workbook in
`seed-content/sources/`:

```bash
python3 scripts/xlsx-to-pokedex.py   "seed-content/sources/PTE Character Sheet.xlsx"  # -> pokedex.csv
python3 scripts/xlsx-to-reference.py "seed-content/sources/PTE Character Sheet.xlsx"  # -> reference.json
```

You can also add content **inside the app** at any time (GM view):

- **Rules & GM guide:** **Rules & PDFs** → **+ Upload PDF** (set the GM guide to
  *GM only*).
- **Pokédex:** add entries by hand in the Compendium.
- **Lore / maps / items:** add them in their tabs.

### Pokédex format (JSON or CSV)

**JSON** — an array of entries; each may include: `name` (required), `dex_no`,
`category`, `types` (array or comma string), `description`, `habitat`, `rarity`,
`stats` (`{hp,atk,def,spatk,spdef,speed}`), `abilities`, `moves`,
`capture_rules`, `gm_notes`, `image`, `visibility`. Missing fields are fine.

**CSV** — export your spreadsheet and save it as `seed-content/pokedex.csv`. The
header row's column names are matched loosely (case/space/punctuation ignored),
each stat is its own column (`HP`, `Attack`, `Sp. Atk`…), and list columns may
use `|`, `;`, or commas. Full column reference:
[`seed-content/README.md`](seed-content/README.md).

A standalone importer handles either format:
`node server/import-pokedex.js path/to/dex.csv --help`.

## Where your data lives

Everything is stored locally and is **not** committed to git:

- `data/hammpokepals.db` — the SQLite database (all entries, notes, metadata).
- `data/uploads/` — uploaded PDFs, map images, and Pokémon artwork.

To back up your campaign, copy the whole `data/` folder. To move it to another
computer, copy `data/` across alongside the code.

## Tech notes

- Node.js + Express server, SQLite (`better-sqlite3`) storage, no build step.
- Front-end is dependency-free vanilla JS modules served as static files.
- PDFs are streamed through an access-checked endpoint, never served statically,
  so GM-only documents stay private.

## Roadmap ideas

- NPC & trainer roster, encounter/combat tracker, dice roller.
- Linking entries (a session references the Pokémon/NPCs/maps involved).
- Discord sync for pulling the latest PTE files (see the project notes).

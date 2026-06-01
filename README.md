# HammPokePals

A compendium, catalogue, and campaign manager for a homebrew Pokémon tabletop
RPG (built around the **PTE** ruleset). One local app gives **players** a clean
view of the rules, lore, and Pokédex, while the **GM** unlocks a private command
center with session notes, plot secrets, GM-only map markers, and full editing.

> Players and the GM use the **same app**. Players never log in and only ever
> see content marked *public*. The GM unlocks the extra view with a passcode.

## Features

- **Compendium (Pokédex)** — searchable, type-filterable catalogue with detail
  pages (types, base stats, abilities, moves, habitat, rarity, capture rules).
  GM can add/edit/delete entries and upload artwork. *(The MVP centerpiece.)*
- **Rules & PDFs** — upload your PTE core rules, GM guide, bestiary, etc. and
  read them in-app. Mark the **GM guide** as *GM only* so it never reaches a
  player's device.
- **Story** — your plot storybook and lore, grouped by chapter/act, with
  GM-only plot secrets alongside public lore.
- **Maps** — region maps with pin markers; GM-only markers (ambushes, caches)
  are filtered out before a player ever receives the data.
- **Inventory** — party items, Poké Balls, TMs, key items, with quantity/owner.
- **Sessions** — session-by-session notes: a player-facing recap plus secret GM
  prep on each entry.

Every item carries a **visibility** flag (`public` or `gm`) enforced on the
server, so GM secrets are never sent to a player's browser — not just hidden in
the UI.

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

### Unlocking the GM view

Click **GM login** (top-right) and enter the passcode. The default passcode is
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
```

```bash
npm run load-content
```

This registers every PDF (a file named like a *GM guide* is automatically marked
GM-only so players never receive it) and imports the Pokédex. Re-running is safe
— already-loaded PDFs and existing Pokémon (by name) are skipped. Use
`npm run load-content -- --replace-dex` to wipe and reimport the Pokédex. See
[`seed-content/README.md`](seed-content/README.md) for the manifest options.

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

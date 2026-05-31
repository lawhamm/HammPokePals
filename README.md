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

The seed data is just samples — replace it with your own:

- **Rules & GM guide:** GM view → **Rules & PDFs** → **+ Upload PDF**. Set the
  GM guide's visibility to *GM only*.
- **Pokédex:** add entries by hand in the Compendium, **or** bulk-import a JSON
  file (see below) — handy for loading a full PTE dex at once.
- **Lore / maps / items:** add them in their tabs while in GM view.

### Bulk-importing a Pokédex

Put your data in a JSON file (an array of entries) and run:

```bash
node server/import-pokedex.js path/to/your-pokedex.json
```

Each entry may include: `name` (required), `dex_no`, `category`, `types` (array
or comma string), `description`, `habitat`, `rarity`, `stats`
(`{hp,atk,def,spatk,spdef,speed}`), `abilities`, `moves`, `capture_rules`,
`gm_notes`, `image`, `visibility`. Missing fields are fine. See
`server/import-pokedex.js --help` for options.

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

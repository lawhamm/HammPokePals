# seed-content — drop your PTE materials here

Put your real campaign source files in this folder, then run:

```bash
npm run load-content
```

…and the app will ingest everything. (Re-running is safe — already-loaded PDFs
are skipped; the Pokédex import adds entries. Use `npm run load-content -- --replace-dex`
to wipe and reimport the Pokédex.)

## What goes where

```
seed-content/
  pdfs/                 ← your PTE rule PDFs (core rules, GM guide, bestiary…)
  pokedex.json          ← your Pokédex as a JSON array
  manifest.json         ← OPTIONAL: fine-tune titles/categories/visibility
```

### PDFs (rules + GM guide)

Drop any `.pdf` into `seed-content/pdfs/`. By default each becomes a public
rules document **except** files whose name looks like a GM guide (e.g.
`PTE GM Guide.pdf`, `gm-secrets.pdf`) — those are marked **GM only** so players
never receive them. Override any of this with `manifest.json`.

### Pokédex

Provide `seed-content/pokedex.json` as a JSON array. Minimum is a `name` per
entry; everything else is optional:

```json
[
  {
    "name": "Bulbasaur",
    "dex_no": 1,
    "category": "Seed Pokémon",
    "types": ["Grass", "Poison"],
    "description": "…",
    "habitat": "Grassland",
    "rarity": "Uncommon",
    "stats": { "hp": 45, "atk": 49, "def": 49, "spatk": 65, "spdef": 65, "speed": 45 },
    "abilities": ["Overgrow"],
    "moves": ["Tackle", "Vine Whip"],
    "capture_rules": "Capture DC 12.",
    "gm_notes": "Only visible in GM view.",
    "visibility": "public"
  }
]
```

If your PTE Pokédex is in a spreadsheet or some other format, export it to CSV
and tell me the column names — I'll convert it to this JSON for you.

## Important

This folder is **not** git-ignored, so anything you put here *will* be committed
and pushed if you commit it. That's intentional — it lets the materials travel
with the app — but don't put anything here you wouldn't want in the repo. If
your PTE files are private/copyrighted, load them locally and keep them out of
git instead (the app's in-app GM upload does exactly that).

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
  pokedex.json  or .csv ← your Pokédex as a JSON array OR a CSV export
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

#### …or just drop in a CSV

If your Pokédex lives in a spreadsheet, export it to CSV and save it as
`seed-content/pokedex.csv` — no conversion needed. The first row must be a
header; column names are matched loosely (case, spaces, and punctuation are
ignored), so headers like `Dex No`, `Sp. Atk`, or `Special Defense` all line up
on their own. Recognized columns:

| Column (any of)                                  | Goes to        |
| ------------------------------------------------ | -------------- |
| `name` / `pokemon` / `species`                   | name (required)|
| `dex_no` / `dex` / `number` / `#`                | dex number     |
| `category` / `kind` / `classification`           | category       |
| `type` / `types`                                 | types          |
| `hp`, `attack`, `defense`, `sp. atk`, `sp. def`, `speed` | stats  |
| `ability` / `abilities`                          | abilities      |
| `move` / `moves` / `moveset`                      | moves          |
| `rarity`                                         | rarity         |
| `habitat` / `location`                            | habitat        |
| `description` / `flavor` / `dex entry`            | description    |
| `capture` / `encounter` / `capture rules`         | capture rules  |
| `gm` / `gm notes` / `secret`                      | GM-only notes  |
| `visibility` (`public` or `gm`)                   | visibility     |

List columns (`types`, `abilities`, `moves`) can hold multiple values separated
by `|`, `;`, or commas — e.g. `Grass|Poison` or a quoted `"Tackle, Vine Whip"`.
Unknown columns are ignored, so extra spreadsheet columns do no harm.

Prefer JSON? It still works exactly as above — and if both a `pokedex.json` and
a `pokedex.csv` are present, the JSON wins.

## Important

This folder is **not** git-ignored, so anything you put here *will* be committed
and pushed if you commit it. That's intentional — it lets the materials travel
with the app — but don't put anything here you wouldn't want in the repo. If
your PTE files are private/copyrighted, load them locally and keep them out of
git instead (the app's in-app GM upload does exactly that).

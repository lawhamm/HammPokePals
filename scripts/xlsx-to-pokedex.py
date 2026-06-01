#!/usr/bin/env python3
"""Convert a PTE Character Sheet workbook's "Poke Data" sheet into a
seed-content/pokedex.csv that HammPokePals' content loader understands.

Usage:
    python3 scripts/xlsx-to-pokedex.py "/path/to/PTE_Character_Sheet.xlsx"

Requires openpyxl (`pip install openpyxl`). The "Poke Data" sheet is expected to
have a header row (Pokemon:, Type1, Type2, HP, Attack, Defense, Special Attack,
Special Defense, Speed, Power, Size, Weight Class, Naturewalk, Movement…,
Combat…, Narrative…, Evo, Diet) with species rows below it.

Stats are kept on the PTE scale as-is. Types come from Type1/Type2, habitat from
Naturewalk, and each PTE profile field (Power, Size, Weight Class, Diet,
Evolution stage) plus the Movement/Combat/Narrative capability groups become
their own columns the loader maps to structured fields.
"""
import csv
import sys
from pathlib import Path

import openpyxl

# Column groups within "Poke Data" (0-based), based on the sheet's header row.
COL = {
    "name": 0, "type1": 1, "type2": 2,
    "hp": 3, "atk": 4, "def": 5, "spatk": 6, "spdef": 7, "speed": 8,
    "power": 9, "size": 10, "weight": 11, "naturewalk": 12,
    "evo": 29, "diet": 30,
}
MOVEMENT_COLS = range(13, 17)
COMBAT_COLS = range(17, 21)
NARRATIVE_COLS = range(21, 29)

BLANKS = {None, "", "--", "None", "none", "N/A"}


def clean(v):
    if v is None:
        return ""
    return str(v).strip()


def real(v):
    """A value that means something (not blank/placeholder)."""
    s = clean(v)
    return "" if s in BLANKS else s


def caps(row, cols):
    out = []
    for c in cols:
        v = real(row[c]) if c < len(row) else ""
        if v:
            out.append(v)
    return out


def types(row):
    t1 = real(row[COL["type1"]])
    t2 = real(row[COL["type2"]])
    return "|".join(t for t in (t1, t2) if t)


def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: python3 scripts/xlsx-to-pokedex.py <workbook.xlsx>")
    src = Path(sys.argv[1])
    out = Path(__file__).resolve().parent.parent / "seed-content" / "pokedex.csv"

    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    ws = wb["Poke Data"]

    header = [
        "Name", "Type", "HP", "Attack", "Defense", "Sp. Atk", "Sp. Def",
        "Speed", "Habitat", "Power", "Size", "Weight Class", "Diet",
        "Evolution Stage", "Movement", "Combat", "Narrative",
    ]
    written = 0
    with out.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        for row in ws.iter_rows(values_only=True):
            if not row:
                continue
            name = real(row[COL["name"]]) if COL["name"] < len(row) else ""
            # Skip the header row and any blank/label rows.
            if not name or name.lower() in ("pokemon:", "pokemon"):
                continue
            cell = lambda key: real(row[COL[key]]) if COL[key] < len(row) else ""
            w.writerow([
                name,
                types(row),
                cell("hp"), cell("atk"), cell("def"),
                cell("spatk"), cell("spdef"), cell("speed"),
                cell("naturewalk"),
                cell("power"), cell("size"), cell("weight"), cell("diet"),
                cell("evo"),
                "|".join(caps(row, MOVEMENT_COLS)),
                "|".join(caps(row, COMBAT_COLS)),
                "|".join(caps(row, NARRATIVE_COLS)),
            ])
            written += 1

    print(f"Wrote {written} species to {out}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Convert a PTE Character Sheet workbook's "Poke Data" sheet into a
seed-content/pokedex.csv that HammPokePals' content loader understands.

Usage:
    python3 scripts/xlsx-to-pokedex.py "/path/to/PTE_Character_Sheet.xlsx"

Requires openpyxl (`pip install openpyxl`). The "Poke Data" sheet is expected to
have a header row (Pokemon:, Type1, Type2, HP, Attack, Defense, Special Attack,
Special Defense, Speed, Power, Size, Weight Class, Naturewalk, Movement…,
Combat…, Narrative…, Evo, Diet) with species rows below it.

Stats are kept on the PTE scale as-is. Each species' PTE extras (capabilities,
diet, size/weight/power, evolution stage) are folded into the Description so no
data is lost; types come from Type1/Type2 and habitat from Naturewalk.
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


def build_description(row):
    parts = []
    diet = real(row[COL["diet"]])
    if diet:
        parts.append(f"Diet: {diet}.")

    phys = []
    size = real(row[COL["size"]])
    weight = real(row[COL["weight"]])
    power = real(row[COL["power"]])
    if size:
        phys.append(f"Size {size}")
    if weight:
        phys.append(f"Weight class {weight}")
    if power:
        phys.append(f"Power {power}")
    if phys:
        parts.append(" · ".join(phys) + ".")

    evo = real(row[COL["evo"]])
    if evo:
        parts.append(f"Evolution stage {evo}.")

    movement = caps(row, MOVEMENT_COLS)
    combat = caps(row, COMBAT_COLS)
    narrative = caps(row, NARRATIVE_COLS)
    if movement:
        parts.append("Movement: " + ", ".join(movement) + ".")
    if combat:
        parts.append("Combat: " + ", ".join(combat) + ".")
    if narrative:
        parts.append("Narrative: " + ", ".join(narrative) + ".")

    return " ".join(parts)


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
        "Speed", "Habitat", "Description",
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
            stat = lambda key: real(row[COL[key]]) if COL[key] < len(row) else ""
            w.writerow([
                name,
                types(row),
                stat("hp"), stat("atk"), stat("def"),
                stat("spatk"), stat("spdef"), stat("speed"),
                real(row[COL["naturewalk"]]) if COL["naturewalk"] < len(row) else "",
                build_description(row),
            ])
            written += 1

    print(f"Wrote {written} species to {out}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Extract the PTE Rule Book PDF into seed-content/rules.json — a list of
categorised, searchable rules entries the content loader ingests into the
rules_entries table (and the RULES screen + Claude search read from).

Usage:
    python3 scripts/pdf-to-rules.py "seed-content/pdfs/PTE Rule Book.pdf"

Requires pypdf. The extractor loses inter-word spaces in places, so we re-insert
them at lower→upper case boundaries and letter↔digit boundaries. Each page below
the table of contents becomes one entry, tagged by the chapter it falls under.
"""
import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader

CHAPTER_RE = re.compile(r"Chapter\s*\d+\s*[-–]\s*([A-Za-z ]+)")

# Map a chapter title to a short browsable category tag.
CATEGORY_KEYWORDS = [
    ("Combat", "Combat"),
    ("Capture", "Catching"),
    ("Catch", "Catching"),
    ("Status", "Status"),
    ("Movement", "Movement"),
    ("Character Creation", "Character"),
    ("Pokemon", "Pokémon"),
    ("Skill", "Skills"),
    ("Item", "Items"),
    ("Class", "Classes"),
    ("Feature", "Features"),
    ("Intro", "Overview"),
    ("Equipment", "Equipment"),
]


def categorise(chapter_title):
    if not chapter_title:
        return "General"
    for needle, tag in CATEGORY_KEYWORDS:
        if needle.lower() in chapter_title.lower():
            return tag
    return chapter_title.strip().title()[:24] or "General"


def clean(text):
    if not text:
        return ""
    # Re-insert spaces lost during extraction.
    text = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", text)
    text = re.sub(r"(?<=[A-Za-z])(?=\d)", " ", text)
    text = re.sub(r"(?<=\d)(?=[A-Za-z])", " ", text)
    text = text.replace("»", "\n• ").replace("•", "\n• ")
    # Normalise whitespace but keep paragraph-ish line breaks.
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def title_from(text, chapter, page):
    for line in text.splitlines():
        line = line.strip(" •-\t")
        # A heading-ish line: a few words, not a full sentence.
        if 3 <= len(line) <= 60 and not line.endswith((".", ",", ":")) and len(line.split()) <= 8:
            if any(c.isalpha() for c in line):
                return line
    base = chapter or "Rules"
    return f"{base} (p.{page})"


def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: python3 scripts/pdf-to-rules.py <rulebook.pdf>")
    src = Path(sys.argv[1])
    out = Path(__file__).resolve().parent.parent / "seed-content" / "rules.json"

    reader = PdfReader(str(src))
    entries = []
    chapter = None
    seen_titles = set()

    for page_no, page in enumerate(reader.pages, start=1):
        raw = page.extract_text() or ""
        # Track the current chapter heading as we walk pages.
        m = CHAPTER_RE.search(raw)
        if m:
            chapter = m.group(1).strip()
        body = clean(raw)
        # Skip the cover, the table of contents, and near-empty pages.
        if page_no <= 4 or len(body) < 400:
            continue
        title = title_from(body, chapter, page_no)
        # De-dup identical titles by appending the page.
        key = title.lower()
        if key in seen_titles:
            title = f"{title} (p.{page_no})"
        seen_titles.add(key)
        entries.append({
            "title": title,
            "category": categorise(chapter),
            "body": body,
            "page": page_no,
            "source": "rulebook",
            "visibility": "public",
        })

    out.write_text(json.dumps(entries, ensure_ascii=False, indent=0), encoding="utf-8")
    cats = {}
    for e in entries:
        cats[e["category"]] = cats.get(e["category"], 0) + 1
    print(f"Wrote {len(entries)} rules entries to {out}")
    for c, n in sorted(cats.items(), key=lambda kv: -kv[1]):
        print(f"  {c}: {n}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Reproduce three individually documented 1863 Galician readings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-galician-classics-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-galician-classics.json"
READINGS_SHA256 = "842d8f95e5a725680a0cc6316ba88efff668beaf27b7804080fd828181fed2f4"

# This identifies the consulted copy, not the accuracy of the transcription.
EVIDENCE = {
    "castro-cantares-1863-bpl-candidate.pdf": "6e2741fc73db773e5ec9d48f38922f4d527cea6173a87eac1e129767d4170423",
}
SCAN = "https://archive.org/download/cantaresgallegos00cast_0/cantaresgallegos00cast_0.pdf"
FOUNDATION = "https://rosalia.gal/planeta-rosalia/"
RIGHTS = (
    "The 1863 printing is public domain in the United States; Castro died in 1885. "
    "Copyright, edition-related and moral rights vary by jurisdiction; check local law. "
    "The scan is linked, not republished. No translation or recording is included."
)
COMMON = {
    "author": "Rosalía de Castro", "authorId": "rosalia-de-castro", "authorYears": "1837–1885",
    "authorAliases": ["Rosalia de Castro"], "country": "Spain", "language": "Galician", "lang": "gl",
    "era": "19th century", "year": 1863, "yearLabel": "1863 printing · not necessarily composition date",
    "form": "Lyric", "collection": "Cantares gallegos · 1863", "rights": RIGHTS,
}
WORKS = [
    {
        "key": "adios-rios", "title": "Adiós ríos, adiós fontes",
        "context": (
            "Number 13 occupies pp. 57–59 of the 1863 printing and ends Miña casiña! meu lar!; "
            "later editions add and alter stanzas. Its first four lines are separately italicized as an "
            "introductory copla; their traditional source and attribution are not independently established "
            "here and the copla is not a separate work. A printed dotted separator is represented by "
            "spaced dots and counted as a nonblank line, not verse. The Fundación Rosalía de Castro and "
            "Universidade de Vigo name this among the collection's best-known poems. Italics, spacing "
            "and apostrophe typography are normalized; Spain is an associated place, not a composition claim."
        ),
        "sourceTitle": "Cantares gallegos · Vigo, 1863, pp. 57–59 / PDF pp. 81–83",
        "source": SCAN + "#page=81", "contextSourceTitle": "Fundación Rosalía de Castro · Planeta Rosalía",
        "contextSource": FOUNDATION,
        "searchAliases": ["Adios rios, adios fontes", "Goodbye rivers, goodbye fountains"],
        "blocks": [4, 4, 4, 4, 4, 4, 4, 1, 5, 5, 5, 8],
    },
    {
        "key": "airinos", "title": "Airiños, airiños aires",
        "context": (
            "Number 15 occupies pp. 65–68 of the 1863 printing and ends Airiños, leváime á ela! "
            "Its first four lines are separately italicized as an introductory copla; their traditional "
            "source and attribution are not independently established here and the copla is not a "
            "separate work. The Fundación Rosalía de Castro and Universidade de Vigo name this among "
            "the collection's best-known poems; their online selection is excerpted and differs in "
            "spelling. Italics, spacing and apostrophe typography are normalized; Spain is an associated "
            "place, not a claim about composition."
        ),
        "sourceTitle": "Cantares gallegos · Vigo, 1863, pp. 65–68 / PDF pp. 89–92",
        "source": SCAN + "#page=89", "contextSourceTitle": "Fundación Rosalía de Castro · Planeta Rosalía",
        "contextSource": FOUNDATION, "searchAliases": ["Airiños, airiños, aires", "Airiños da miña terra"],
        "blocks": [4, 20, 12, 14, 30, 26],
    },
    {
        "key": "campanas-de-bastabales", "title": "Campanas de Bastabales",
        "context": (
            "Number 9 occupies pp. 39–43 of the 1863 printing. Its five numbered sections are one "
            "complete work, not five poems; the opening three-line italic copla returns at the end. "
            "Its traditional source and attribution are not independently established here. A printed "
            "dotted separator is represented by spaced dots; it and the section labels count as nonblank "
            "lines, not verse. Turismo de Galicia describes the opening as widely known and recited. "
            "Bastavales and oio are modern variants, not separate works. Italics, spacing and apostrophe "
            "typography are normalized; Spain is an associated place, not a composition claim."
        ),
        "sourceTitle": "Cantares gallegos · Vigo, 1863, pp. 39–43 / PDF pp. 63–67",
        "source": SCAN + "#page=63", "contextSourceTitle": "Turismo de Galicia · Campanas de Bastabales",
        "contextSource": "https://blog.turismo.gal/as-campas-de-bastavales-as-que-cantou-rosalia/",
        "searchAliases": ["Campanas de Bastavales", "Cando vos oio tocar", "Bells of Bastabales"],
        "blocks": [3, 1, 3, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 3,
                   1, 3, 3, 3, 3, 3, 3, 1, 3, 3, 3, 1, 3, 7],
    },
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build():
    if digest(READINGS) != READINGS_SHA256:
        raise ValueError("Reading snapshot changed")
    blocks = [block.strip() for block in re.split(r"(?m)^## ", READINGS.read_text(encoding="utf-8")) if block.strip()]
    readings = {}
    for block in blocks:
        key, text = block.split("\n", 1)
        if key in readings:
            raise ValueError(f"Duplicate reading: {key}")
        readings[key] = text.strip()
    if list(readings) != [work["key"] for work in WORKS]:
        raise ValueError("Unexpected reading selection or order")
    records = []
    for work in WORKS:
        text = readings[work["key"]]
        if [len(block.splitlines()) for block in text.split("\n\n")] != work["blocks"]:
            raise ValueError(f"Unexpected reading boundaries: {work['key']}")
        record = {**COMMON, **{key: value for key, value in work.items() if key not in {"key", "blocks"}}}
        record.update({
            "id": "recognized-galician-classics-" + work["key"], "direction": "ltr", "themes": [],
            "mood": "paper", "text": text, "translations": [],
        })
        records.append(record)
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    operation = parser.add_mutually_exclusive_group(required=True)
    operation.add_argument("--check", action="store_true")
    operation.add_argument("--write", action="store_true")
    parser.add_argument("--evidence-dir", type=Path)
    args = parser.parse_args()
    records = build()
    if args.evidence_dir:
        for filename, expected in EVIDENCE.items():
            if digest(args.evidence_dir / filename) != expected:
                raise ValueError(f"Witness does not match: {filename}")
    if args.write:
        OUTPUT.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {len(records)} historical readings.")
    else:
        if json.loads(OUTPUT.read_text(encoding="utf-8")) != records:
            raise ValueError("Catalogue differs from the reviewed readings")
        print(f"Verified {len(records)} historical readings" +
              ("; witness hash matches." if args.evidence_dir else "."))


if __name__ == "__main__":
    main()

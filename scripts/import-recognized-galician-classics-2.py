#!/usr/bin/env python3
"""Reproduce two complete Galician readings from the 1880 Follas novas."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-galician-classics-2-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-galician-classics-2.json"
READINGS_SHA256 = "53fc7d5f417aa342e00b7fc01b761f7d62ecde977ee9820fc476320c90befef0"

# This identifies the consulted copy, not the accuracy of the transcription.
EVIDENCE = {
    "castro-follas-novas-1880-uoft.pdf": "8a2326bd2db52645c18944c755a2471b3e5bbb4050e01625f726de8e7b10c8cd",
}
SCAN = "https://archive.org/download/follasnovasverso00castuoft/follasnovasverso00castuoft.pdf"
RIGHTS = (
    "The 1880 printing is public domain in the United States; Castro died in 1885. "
    "Copyright, edition-related and moral rights vary by jurisdiction; check local law. "
    "The scan is linked, not republished. No translation or recording is included."
)
COMMON = {
    "author": "Rosalía de Castro", "authorId": "rosalia-de-castro", "authorYears": "1837–1885",
    "authorAliases": ["Rosalia de Castro"], "country": "Spain", "language": "Galician", "lang": "gl",
    "era": "19th century", "year": 1880, "yearLabel": "1880 printing · not necessarily composition date",
    "form": "Lyric", "collection": "Follas novas · 1880", "rights": RIGHTS,
}
WORKS = [
    {
        "key": "xusticia", "title": "A xusticia pó-l-a man",
        "context": (
            "The complete 1880 reading occupies pp. 57–58. A printed rule is represented by a "
            "separate dash and counted as a nonblank line, not verse. María do Cebreiro Rábade "
            "Villar discusses this individual poem and identifies a Spanish self-translation, "
            "La justicia por la mano, as another version of the same work; that text is not included. "
            "Historical spelling and ẍ are retained; italics, indentation, spacing and apostrophe "
            "typography are normalized. Spain is an associated place, not a composition claim."
        ),
        "sourceTitle": "Follas novas · 1880, pp. 57–58 / PDF pp. 93–94",
        "source": SCAN + "#page=93",
        "contextSourceTitle": "María do Cebreiro Rábade Villar · A xustiza pola man",
        "contextSource": "https://sibila.com.br/mapa-da-lingua/a-xustiza-pola-man-de-rosalia-de-castro/9718",
        "searchAliases": ["A xustiza pola man", "A xusticia pola man", "La justicia por la mano"],
        "blocks": [4, 5, 4, 1, 4, 5, 4, 2],
    },
    {
        "key": "pra-habana", "title": "¡Prá á Habana!",
        "context": (
            "The complete 1880 poem occupies pp. 211–214: its five numbered parts form one "
            "work, and the often-quoted 'Este vaise y aquel vaise' is its last part, not a "
            "separate poem. The Fundación Rosalía de Castro describes this individual poem as "
            "emblematic. Historical spelling and ẍ are retained; indentation, spacing and "
            "apostrophe typography are normalized. Spain is an associated place, not a "
            "claim about where the poem was composed."
        ),
        "sourceTitle": "Follas novas · 1880, pp. 211–214 / PDF pp. 247–250",
        "source": SCAN + "#page=247", "contextSourceTitle": "Fundación Rosalía de Castro · Rosalía na Coruña",
        "contextSource": "https://rosalia.gal/rosalia-na-coruna/",
        "searchAliases": ["Pra a Habana", "Para a Habana", "Este vaise e aquel vaise", "Este vaise y aquel vaise"],
        "blocks": [1, 4, 4, 4, 4, 1, 4, 4, 4, 4, 1, 4, 4, 4, 4, 6, 1, 10, 4, 1, 12],
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
            "id": "recognized-galician-2-" + work["key"], "direction": "ltr", "themes": [],
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

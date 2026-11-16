#!/usr/bin/env python3
"""Reproduce three complete Swedish readings from a 1921 printing."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-world-classics-6-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-world-classics-6.json"
READINGS_SHA256 = "8e0592878fb0c95ff8ca85af220e147ff79c15b1e2af9f9b8f8a44e1f790f48a"

# These identify the consulted copies, not the accuracy of the transcription.
EVIDENCE = {
    "andersson-visor-1921-scan-0005-future.png": "a996fb288a99f85cc752a83ad94e2d6a335943ea7df45822a41ef8ff697eac77",
    "andersson-visor-1921-scan-0083-future.png": "fdf4924fdd28cf7ca285825154e20d95cad4f597f3ccdd9e21b33c5c19ed2c0c",
    "andersson-visor-1921-scan-0084-future.png": "1d7148f807c4bbc2807d992525e3f3395cf479d051f2341ecce73a37da663d04",
    "andersson-visor-1921-scan-0085-future.png": "2dba90903eca6c3ad41f662a652af351666234c48d48482c5cff5a737b149088",
    "andersson-visor-1921-scan-0086-future.png": "6bee43ad54f12d0ccb87280cdcc68d2563cf159f0df596416f4a87732afd3f5e",
    "andersson-visor-1921-scan-0087-future.png": "de323dd1dbb3165b11acfa311de55ab49e2692701b26f8092d590d0f40cfe4a6",
    "andersson-visor-1921-scan-0088-future.png": "ec65b2745e5bc961216c7a566a5f00b9037f290d957e1101c7238138b546806f",
    "andersson-visor-1921-scan-0119-future.png": "be79422e3c5e1499e60d2aa1aa3d6fb20cff4404642ca1224941c61f4a77e32c",
    "andersson-visor-1921-scan-0120-future.png": "596e7a7a3ec05f1192bc78ff7b4a423ebaa4824b8e42397bf73568f2d8c85827",
    "andersson-visor-1921-scan-0248-future.png": "a2930daa631948b193d61cb14e88f8234ffcb856dc3f0659f5ceba9221161216",
}
SCHOOL = "https://litteraturbanken.se/skolan/poesi-forfattare-dan-andersson-"
RIGHTS = (
    "The 1921 printing is public domain in the United States; Andersson died in 1920. "
    "Copyright, edition-related and moral rights vary by jurisdiction; check local law. "
    "The facsimile is linked, not republished. No translation or recording is included."
)

WORKS = [
    {
        "key": "andersson-omkring-tiggarn", "title": "Omkring tiggarn från Luossa",
        "pages": "81–83", "firstPage": "0083", "school": "omkring-tiggarn-fran-luossa/",
        "stanzas": [4] * 9,
        "aliases": ["Det är något bortom bergen", "Omkring tiggaren från Luossa"],
        "detail": (
            "The complete poem has nine quatrains. The 1921 contents names it at p. 81, "
            "although that page itself has no title; En spelmans jordafärd begins on p. 84. "
            "The often-quoted song passage is part of this poem, not a separate work. "
        ),
    },
    {
        "key": "andersson-spelmans-jordafard", "title": "En spelmans jordafärd",
        "pages": "84–86", "firstPage": "0086", "school": "en-spelmans-jordafard/",
        "stanzas": [8] * 5 + [9],
        "aliases": ["Himmelmora kam", "Förr än rosig morgon lyser över Himmelmora kam"],
        "detail": (
            "The complete poem has five eight-line stanzas and a final nine-line stanza; "
            "Spelmannen begins on p. 87. The 1921 printing reads Himmelmora kamm and "
            "han led ofta brist; a later online text reads kam and adds av. "
        ),
    },
    {
        "key": "andersson-till-min-syster", "title": "Till min syster",
        "pages": "117–118", "firstPage": "0119", "school": "till-min-syster/",
        "stanzas": [4] * 4,
        "aliases": ["Nu spelar vårens ljumma vind", "En sång till dej min syster"],
        "detail": (
            "The separately headed poem has four complete quatrains on pp. 117–118; "
            "En gamling begins on p. 119. This printing retains däj and det starka oss. "
        ),
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
        if [len(stanza.splitlines()) for stanza in text.split("\n\n")] != work["stanzas"]:
            raise ValueError(f"Unexpected stanza boundaries: {work['key']}")
        records.append({
            "id": "recognized-world-classics-6-" + work["key"], "title": work["title"],
            "author": "Dan Andersson", "authorId": "dan-andersson", "authorYears": "1888–1920",
            "country": "Sweden", "language": "Swedish", "lang": "sv", "direction": "ltr",
            "year": 1921, "yearLabel": "1921 printing · not necessarily composition date",
            "era": "20th century", "form": "Verse", "collection": "Svarta ballader · Visor och ballader, 1921",
            "themes": [], "mood": "paper",
            "context": work["detail"] + (
                "Litteraturbanken discusses the individual poem for school readers. "
                "Printed line wraps are rejoined; spacing, indentation and dash typography are normalized. "
                "Sweden is an associated place, not a claim about composition."
            ),
            "sourceTitle": f"Visor och ballader · Stockholm, 1921, pp. {work['pages']}",
            "source": f"https://runeberg.org/danvob/{work['firstPage']}.html",
            "contextSourceTitle": "Litteraturbanken · individual teaching selection",
            "contextSource": SCHOOL + work["school"], "rights": RIGHTS,
            "searchAliases": work["aliases"], "text": text, "translations": [],
        })
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
              ("; witness hashes match." if args.evidence_dir else "."))


if __name__ == "__main__":
    main()

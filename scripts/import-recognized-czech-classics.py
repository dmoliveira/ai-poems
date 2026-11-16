#!/usr/bin/env python3
"""Reproduce three Czech poems from identified historical printings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-czech-classics-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-czech-classics.json"
READINGS_SHA256 = "cb82dcad2c5f5dd97fe42c58a718afbcfde824df3987412315ae13ee5af13f6d"

# Hashes identify consulted copies, not the accuracy of their transcription.
EVIDENCE = {
    "vrchlicky-okna-1894-polona-p075.jpg": "216f59cf61e55c53f3660c917dac8d1c1dc34518980a1d01489e6b7535aad91f",
    "vrchlicky-okna-1894-polona-p076.jpg": "3374c52adbb263f749b9409940a3ad2d1525e2e891608293031a05436df5767e",
    "sladek-spisy-basnicke-2-1907-research.pdf": "e02863b6d513951fa3cd1799f99f07db43d1ee607975d47aa66e04a0e11c8a51",
    "bily-patery-knihy-1891-research.pdf": "ccf3a719c36f411d121b5a86795240b971aed8960311aadcd00bddb39baa8379",
    "kwety-volume-10-1843-research.pdf": "58fb2d4c1b38d6c49bb80eeb675983a8dbbf7a50256ac45ac24d45b679a89c34",
}
COMMON = {
    "country": "Czechia", "language": "Czech", "lang": "cs", "direction": "ltr",
    "form": "Verse", "themes": [], "mood": "paper", "translations": [],
}
RIGHTS = (
    "This historical printing is public domain in the United States. {deaths} "
    "Copyright, edition-related and moral rights vary by jurisdiction; check local law. "
    "Scans are linked, not republished; no translation, score or recording is included."
)
WORKS = [
    {
        "key": "za-trochu-lasky", "id": "recognized-czech-classics-vrchlicky-za-trochu-lasky",
        "blocks": [7], "title": "Za trochu lásky...", "author": "Jaroslav Vrchlický",
        "authorId": "jaroslav-vrchlicky", "authorYears": "1853–1912",
        "authorAliases": ["Jaroslav Vrchlicky"],
        "year": 1894, "yearLabel": "1894 printing", "era": "19th century",
        "collection": "Okna v bouři · 1894",
        "sourceTitle": "Okna v bouři · 1894 · p. 75 · Polona facsimile",
        "source": "https://polona.pl/iiif/3/4b2df30a-b282-48d3-9758-848e354f6049/full/max/0/default.jpg",
        "contextSourceTitle": "Rozbor-díla · Lyrický subjekt",
        "contextSource": "https://rozbor-dila.cz/lyricky-subjekt",
        "searchAliases": ["Za trochu lasky", "Za trochu lasky sel bych sveta kraj"],
        "context": (
            "The separately headed seven-line poem ends before 'Stará píseň o lásce' on the next page. "
            "The 1894 scan reads 'šel v ledu'; some modern reproductions instead say 'šel v lednu'. "
            "A Czech literary-study article calls this poem well known; that is regional reception, "
            "not a global ranking."
        ),
        "rights": RIGHTS.format(deaths="Vrchlický died in 1912."),
    },
    {
        "key": "lesni-studanka", "id": "recognized-czech-classics-sladek-lesni-studanka",
        "blocks": [4] * 3, "title": "Lesní studánka", "author": "Josef Václav Sládek",
        "authorId": "josef-vaclav-sladek", "authorYears": "1845–1912",
        "authorAliases": ["Josef Vaclav Sladek", "J. V. Sládek", "J. V. Sladek"],
        "year": 1907, "yearLabel": "1907 printing · collection dated 1894", "era": "19th century",
        "collection": "Zvony a zvonky · Spisy básnické II · 1907",
        "sourceTitle": "Spisy básnické II · 1907 · p. 160 · Internet Archive facsimile",
        "source": "https://archive.org/details/spisybsnicksoub01slgoog/page/n170/mode/1up",
        "contextSourceTitle": "ČT edu · Znám křišťálovou studánku",
        "contextSource": "https://edu.ceskatelevize.cz/video/8377-deti-kresli-pisnicky-znam-kristalovou-studanku",
        "searchAliases": ["Lesni studanka", "Znam kristalovou studanku"],
        "context": (
            "The 1907 collected edition prints this complete twelve-line poem before the separately "
            "headed 'Lilie'; its children's-poem collection is dated 1894. The scan reads 'a nebesa "
            "i studánka', while some modern reproductions say 'tu nebesa i studánka'. ČT edu calls "
            "it a known poem when discussing a later musical setting, which is not a separate work."
        ),
        "rights": RIGHTS.format(deaths="Sládek died in 1912."),
    },
    {
        "key": "zenam-ceskym", "id": "recognized-czech-classics-nemcova-zenam-ceskym",
        "blocks": [4] * 8, "title": "Ženám českým", "author": "Božena Němcová",
        "authorId": "bozena-nemcova", "authorYears": "1820?–1862",
        "authorAliases": ["Bozena Nemcova"],
        "year": 1891, "yearLabel": "1891 printing · first published 1843", "era": "19th century",
        "collection": "Patery knihy plodů básnických · 1891",
        "sourceTitle": "Patery knihy plodů básnických · 1891 · pp. 137–138 · Internet Archive facsimile",
        "source": "https://archive.org/details/pateryknihyplodb00bluoft/page/n162/mode/1up",
        "contextSourceTitle": "ČT edu · Ženám českým",
        "contextSource": "https://edu.ceskatelevize.cz/video/7828-bozena-zenam-ceskym",
        "searchAliases": ["Zenam ceskym", "Zeny ceske matky ceske"],
        "context": (
            "The signed 1843 Květy printing and Bílý's 1891 anthology both contain all 32 lines. "
            "This reading follows the 1891 scan's 'útlá', 'Jmenujme' and 'zrostou'; the original "
            "uses older spelling and 'Gmenugte'. The 1891 pages show four-line blocks in two columns; "
            "the 1843 and 1957 printings group them into eight-line stanzas. A 1957 scholarly note "
            "discusses possible textual intervention and a censorship-proof variant; the signed "
            "1843 publication and this 1891 copy both name Břetislavy. Němcová's birth year is disputed."
        ),
        "rights": RIGHTS.format(deaths="Němcová died in 1862 and anthology editor František Bílý in 1920."),
    },
]
NORMALIZATION = (
    " Historical spelling is retained; typeface, indentation and punctuation typography are normalized. "
    "Czechia is an associated modern place, not a claim about composition location."
)


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
        record["context"] += NORMALIZATION
        record["text"] = text
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
              ("; witness hashes match." if args.evidence_dir else "."))


if __name__ == "__main__":
    main()

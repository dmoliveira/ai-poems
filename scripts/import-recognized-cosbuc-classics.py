#!/usr/bin/env python3
"""Reproduce two complete readings from Coșbuc's 1897 Balade și idile."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-cosbuc-classics-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-cosbuc-classics.json"
READINGS_SHA256 = "1797017731c4e721a1a96825fff25177a750c10399e1276902b66b86c04390dc"

# Hashes identify the inspected copies, not the accuracy of the transcription.
EVIDENCE = {
    "cosbuc-balade-idile-1897.pdf": "adaf5b4e166da1ca55ca14472c534165b4cf36bef496fb35c3682977570b8da2",
    "cosbuc-balade-1897-commons.pdf": "0d5d09cc9f5392c1e7c8614ad4cd134bfe66f2841a4ba968c84fcd80ccac3c39",
}
PDF = "https://archive.org/download/baladeiidile00cogoog/baladeiidile00cogoog.pdf"
SCHOOL = "https://liceunet.ro/george-cosbuc-poezii/nunta-zamfirei"
NEWS = "https://www.libertatea.ro/lifestyle/george-cosbuc-poezii-2888642"
RIGHTS = (
    "The 1897 printing is public domain in the United States; Coșbuc died in 1918. "
    "Copyright, edition-related and moral rights vary by jurisdiction; check local law. "
    "The scan is linked, not republished; the verse was transcribed from its historical pages. "
    "No translation or recording is included."
)

WORKS = [
    {
        "key": "nunta-zamfirei", "title": "Nunta Zamfirei", "pages": "16–23", "pdfPage": 27,
        "stanzas": [6] * 28, "form": "Ballad", "reception": SCHOOL,
        "aliases": ["Nunta Zamfirii", "Când a pornit s-alerge-n zbor", "Pe-un gard de-alături"],
        "detail": (
            "This complete ballad has twenty-eight six-line stanzas. The 1897 printing reads "
            "'să-și dee zor', 'Tinteș' and 'Pe-un grad'; some modern readings use "
            "'s-alerge-n zbor', 'Ținteș' and 'Pe-un gard'. Liceunet discusses the work "
            "individually in a Romanian educational context."
        ),
    },
    {
        "key": "rea-de-plata", "title": "Rea de plată", "pages": "33–34", "pdfPage": 44,
        "stanzas": [8] * 3, "form": "Verse", "reception": NEWS,
        "aliases": ["Punându-și sacul, iacă", "Rea de plata"],
        "detail": (
            "This complete poem has three eight-line stanzas; the middle stanza crosses a page break. "
            "The 1897 reading prints 'Punând un sac, în urmă', unlike 'Punându-și sacul, iacă' "
            "in some modern readings. Libertatea selects the poem individually among Coșbuc's verses."
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
            raise ValueError(f"Unexpected stanza lengths: {work['key']}")
        records.append({
            "id": "recognized-cosbuc-classics-" + work["key"], "title": work["title"],
            "author": "George Coșbuc", "authorId": "george-cosbuc", "authorYears": "1866–1918",
            "authorAliases": ["Gheorghe Coșbuc"],
            "country": "Romania", "language": "Romanian", "lang": "ro", "direction": "ltr",
            "year": 1897, "yearLabel": "1897 second edition · not necessarily composition date",
            "era": "19th century", "form": work["form"], "collection": "Balade și idile · 1897",
            "themes": [], "mood": "paper",
            "context": work["detail"] + (
                " The 1897 wording is retained; historical ĕ/ê and short i/u marks, title accents, "
                "ș/ț letterforms, punctuation typography, spacing and indentation are normalized. "
                "Romania is an associated place, not a claim about where the poem was composed."
            ),
            "sourceTitle": f"Balade și idile · second edition, 1897, pp. {work['pages']}",
            "source": f"{PDF}#page={work['pdfPage']}",
            "contextSourceTitle": "Individual reception and context", "contextSource": work["reception"],
            "rights": RIGHTS, "searchAliases": work["aliases"], "text": text, "translations": [],
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

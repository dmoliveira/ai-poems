#!/usr/bin/env python3
"""Reproduce two complete Eminescu readings from the 1884 Poesii."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-romanian-classics-2-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-romanian-classics-2.json"
READINGS_SHA256 = "7621d79c5b221796d1eac8a362972d6a51f46a75320532f52b4f4625090d8157"

# Hashes identify consulted copies, not the accuracy of their transcriptions.
EVIDENCE = {
    "eminescu-poesii-1884-bcu-iasi.pdf": "aef6be579c0f728af12115f5b0d97c1af92c53ebb93d018ce5964778186c29fd",
    "eminescu-1884-ia-socecu-copy.pdf": "88f15d106d78d7281b7fbbe05de2d1b8b2203e8fe306e2a45497a6047c2d7754",
}
PDF = "https://dspace.bcu-iasi.ro/bitstream/handle/123456789/36442/BCUIASI_CS_CR2155_1884.pdf?sequence=2&isAllowed=y"
NEWS = "https://www.libertatea.ro/lifestyle/poezii-de-mihai-eminescu-2805295"
ESSAY = "https://centruleminescubm.wordpress.com/2022/11/15/teze-existentialiste-in-glossa-lui-eminescu/"
RIGHTS = (
    "The 1884 printing is public domain in the United States; Eminescu died in 1889 and "
    "editor Titu Maiorescu in 1917. Copyright, edition-related and moral rights vary by jurisdiction; "
    "check local law. The scan is linked, not republished; the verse was transcribed from its "
    "historical pages. No translation or recording is included."
)
WORKS = [
    {
        "key": "o-ramai", "title": "O, rămâi", "pages": "31–33", "pdfPage": 45,
        "stanzas": [4] * 7, "reception": NEWS,
        "aliases": ["O, rămâi...", "O rămâi rămâi la mine", "O, rămâi, rămâi la mine", "O remăi"],
        "detail": (
            "The seven-quatrain 1884 reading prints 'vuetul' and 'Șueram'; modern readings "
            "often have 'vuietul' and 'Șuieram'. The newspaper selects this individual poem. "
            "The print repeats an opening quotation mark at each line of the first five stanzas; "
            "these are represented by one opening mark and the printed closing mark."
        ),
    },
    {
        "key": "glossa", "title": "Glossă", "pages": "143–147", "pdfPage": 157,
        "stanzas": [8] * 10, "reception": ESSAY,
        "aliases": ["Glossa", "Vreme trece, vreme vine", "Vremea trece, vremea vine"],
        "detail": (
            "The complete ten-stanza glossa is one poem: its closing stanza revisits the "
            "opening lines in reverse order, omitting the opening 'Tu' before 'te intreabă'. "
            "This printing has 'Vremea trece, vremea vine', 'mizerii' and "
            "'Să supun', unlike common modern 'Vreme trece, vreme vine', 'mișeii' and "
            "'Se supun'. Its italic type is rendered as plain text. The linked essay discusses "
            "this individual poem and the older fixed form."
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
            "id": "recognized-romanian-2-" + work["key"], "title": work["title"],
            "author": "Mihai Eminescu", "authorId": "mihai-eminescu", "authorYears": "1850–1889",
            "country": "Romania", "language": "Romanian", "lang": "ro", "direction": "ltr",
            "year": 1884, "yearLabel": "1884 title-page printing · not necessarily composition date",
            "era": "19th century", "form": "Verse", "collection": "Poesii · 1884",
            "themes": [], "mood": "paper",
            "context": work["detail"] + (
                " Historical spelling is retained; title accents, punctuation typography, spacing "
                "and indentation are normalized. Romania is an associated place, not a claim about "
                "where the poem was composed."
            ),
            "sourceTitle": f"Poesii · title-page 1884, pp. {work['pages']}",
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

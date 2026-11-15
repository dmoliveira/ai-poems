#!/usr/bin/env python3
"""Reproduce five complete readings from dated historical scans."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-early-classics-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-early-classics.json"
READINGS_SHA256 = "ae63cb1fe9d1252fdba0c121acb6f18ceb3262040c4cd208b335c83a3af8a3ef"

# Hashes identify witnesses, not the accuracy of the transcriptions.
EVIDENCE = {
    "leino-hiihtajan-virsia-1900.pdf": "9990525f66cd24139a8f6acb76ce3712ce6c02545d42691d960c78cd828810a2",
    "oxford-cornell-1912.pdf": "0d6c99180ac9c901e5cb5439c4e931167ff059d5b6fede9a5a16b53574b96565",
}

LEINO_RECEPTION = "https://www.kainuuneinoleinoseura.fi/eino-leino/runoteokset/"
LEINO_RIGHTS = (
    "The 1900 printing is public domain in the United States; Leino died in 1926. "
    "Copyright and moral rights vary by jurisdiction, so check local law. "
    "The National Library of Finland scan is linked, not republished; the verse was "
    "transcribed from its historical pages. No translation or recording is included."
)

WORKS = [
    {
        "key": "leino-hyva-on-hiihtajan-hiihdella", "title": "Hyvä on hiihtäjän hiihdellä",
        "author": "Eino Leino", "authorId": "eino-leino", "authorYears": "1878–1926",
        "country": "Finland", "language": "Finnish", "lang": "fi", "year": 1900,
        "era": "19th century", "collection": "Hiihtäjän virsiä · 1900", "stanzas": [6, 6, 6, 6],
        "sourceTitle": "Hiihtäjän virsiä · Helsinki, 1900, pp. 70–71",
        "source": "https://digi.kansalliskirjasto.fi/teos/binding/1907469?page=80",
        "reception": LEINO_RECEPTION, "rights": LEINO_RIGHTS,
        "detail": (
            "This separately headed reading has four complete stanzas on printed pages 70–71. "
            "The Kainuu Eino Leino society names this individual poem among the collection's "
            "well-known works. It is not the separately printed Yksin hiihtäjä section of Metsän kosija."
        ),
    },
    {
        "key": "leino-laulu-onnesta", "title": "Laulu onnesta", "author": "Eino Leino",
        "authorId": "eino-leino", "authorYears": "1878–1926", "country": "Finland",
        "language": "Finnish", "lang": "fi", "year": 1900, "era": "19th century",
        "collection": "Hiihtäjän virsiä · 1900", "stanzas": [4, 4],
        "sourceTitle": "Hiihtäjän virsiä · Helsinki, 1900, p. 84",
        "source": "https://digi.kansalliskirjasto.fi/teos/binding/1907469?page=94",
        "reception": LEINO_RECEPTION, "rights": LEINO_RIGHTS,
        "detail": (
            "The two complete stanzas are separately headed on printed page 84, although the "
            "book's contents page gives 83. The Kainuu Eino Leino society names this individual "
            "poem among the collection's well-known works."
        ),
    },
    {
        "key": "leino-hautalaulu", "title": "Hautalaulu", "author": "Eino Leino",
        "authorId": "eino-leino", "authorYears": "1878–1926", "country": "Finland",
        "language": "Finnish", "lang": "fi", "year": 1900, "era": "19th century",
        "collection": "Hiihtäjän virsiä · 1900", "stanzas": [3, 3, 3],
        "sourceTitle": "Hiihtäjän virsiä · Helsinki, 1900, p. 88",
        "source": "https://digi.kansalliskirjasto.fi/teos/binding/1907469?page=98",
        "reception": LEINO_RECEPTION, "rights": LEINO_RIGHTS,
        "detail": (
            "The three complete stanzas are separately headed on printed page 88, although the "
            "book's contents page gives 87. The scan prints 'ijäks', retained here. The Kainuu "
            "Eino Leino society names this individual poem among the collection's well-known works."
        ),
    },
    {
        "key": "leino-mirjamin-laulu", "title": "Mirjamin laulu", "author": "Eino Leino",
        "authorId": "eino-leino", "authorYears": "1878–1926", "country": "Finland",
        "language": "Finnish", "lang": "fi", "year": 1900, "era": "19th century",
        "collection": "Hiihtäjän virsiä · 1900", "stanzas": [4, 4, 4],
        "sourceTitle": "Hiihtäjän virsiä · Helsinki, 1900, pp. 89–90",
        "source": "https://digi.kansalliskirjasto.fi/teos/binding/1907469?page=99",
        "reception": LEINO_RECEPTION, "rights": LEINO_RIGHTS,
        "detail": (
            "The three complete stanzas span printed pages 89–90, although the book's contents "
            "page gives 88. The Kainuu Eino Leino society names this individual poem among the "
            "collection's well-known works."
        ),
    },
    {
        "key": "marlowe-passionate-shepherd", "title": "The Passionate Shepherd to His Love",
        "author": "Christopher Marlowe", "authorId": "christopher-marlowe", "authorYears": "1564–1593",
        "country": "England", "language": "English", "lang": "en", "year": 1912,
        "era": "Renaissance", "collection": "The Oxford Book of English Verse · 1912",
        "stanzas": [4, 4, 4, 4, 4, 4],
        "sourceTitle": "The Oxford Book of English Verse · Oxford, 1912, pp. 173–174",
        "source": "https://archive.org/details/cu31924011997909/page/n188/mode/1up",
        "reception": "https://www.poetryfoundation.org/articles/68445/hit-singles",
        "rights": (
            "The 1912 printing is public domain in the United States; Marlowe died in 1593 "
            "and editor Arthur Quiller-Couch in 1944. Copyright and moral rights vary by "
            "jurisdiction, so check local law. The scan is linked, not republished; the verse "
            "was transcribed from its historical pages. No recording is included."
        ),
        "detail": (
            "The six complete stanzas span pages 173–174; a separate reply follows and is not "
            "included. The editor says his anthology modernizes spelling and sometimes omits "
            "material. This poem's six-stanza boundary also appears in the Academy of American "
            "Poets' separate reading, whose wording differs. Poetry Foundation's unscientific "
            "survey counted this individual poem in ten of seventeen selected anthologies."
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
            "id": "recognized-early-classics-" + work["key"], "title": work["title"],
            "author": work["author"], "authorId": work["authorId"], "authorYears": work["authorYears"],
            "country": work["country"], "language": work["language"], "lang": work["lang"],
            "direction": "ltr", "year": work["year"],
            "yearLabel": f"{work['year']} printing · not necessarily composition date",
            "era": work["era"], "form": "Verse", "collection": work["collection"],
            "themes": [], "mood": "paper", "context": work["detail"] + (
                " Spacing, indentation and apostrophe/dash typography are normalized; the associated "
                "country is not a claim about the place of composition."
            ),
            "sourceTitle": work["sourceTitle"], "source": work["source"],
            "contextSourceTitle": "Individual reception and context", "contextSource": work["reception"],
            "rights": work["rights"], "text": text, "translations": [],
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

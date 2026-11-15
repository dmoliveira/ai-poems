#!/usr/bin/env python3
"""Reproduce three complete readings from Wilfred Owen's 1920 Poems."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-owen-classics-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-owen-classics.json"
READINGS_SHA256 = "d031b0c70e01227d532bf01206b6864c343d4b0c3e2c9446c4c298db545f7e05"

# These identify the inspected copies, not the accuracy of their transcriptions.
EVIDENCE = {
    "owen-poems-1920-ucb.pdf": "d63ff4271c991273a3c6c491e28542a6b7a2b3ca9026d4218540ce4106a02962",
    "owen-poems-uoft.pdf": "9a31b0c5153bd4440b5150cc01eefbc32a140c02a68bad40b1a577a777236943",
}
PDF = "https://archive.org/download/poemsowenwil00owenrich/poemsowenwil00owenrich.pdf"
POLL = "https://wykontario.org/index.php/features-category/1150-100-favorite-poems-of-britain"
RIGHTS = (
    "The 1920 printing is public domain in the United States; Owen died in 1918 and "
    "editor Siegfried Sassoon in 1967. Copyright, edition-related and moral rights vary by "
    "jurisdiction; check local law. The scan is linked, not republished; the verse was "
    "transcribed from its historical page. No introduction, portrait, translation or recording is included."
)

WORKS = [
    {
        "key": "anthem-for-doomed-youth", "title": "Anthem for Doomed Youth", "page": 11,
        "pdfPage": 31, "stanzas": [8, 6], "form": "Sonnet", "aliases": [],
        "detail": (
            "This complete 1920 sonnet has an eight-line stanza and a six-line stanza; "
            "its first line reads 'these who die as cattle'. "
            "The secondary account of the 1995 BBC British viewer poll lists this individual poem."
        ),
    },
    {
        "key": "dulce-et-decorum-est", "title": "Dulce et Decorum Est", "page": 15,
        "pdfPage": 35, "stanzas": [8, 6, 2, 12], "form": "Verse",
        "aliases": ["Bitter as the cud", "Obscene as cancer, bitter as the cud"],
        "titleLang": "la",
        "textLanguageSpans": [{"line": 27, "text": "Dulce et decorum est", "lang": "la"}],
        "textLanguageOverrides": [{"line": 28, "lang": "la"}],
        "detail": (
            "The complete 1920 printing has four stanzas and reads 'Bitten as the cud'; "
            "some later transcriptions read 'Bitter as the cud' and other modern readings have "
            "'Obscene as cancer, bitter as the cud'. This documents textual variants, "
            "not a claim about Owen's final intention. The Latin title and closing words "
            "are marked as Latin. The secondary account of the 1995 BBC British viewer poll "
            "lists this individual poem."
        ),
    },
    {
        "key": "futility", "title": "Futility", "page": 25,
        "pdfPage": 45, "stanzas": [7, 7], "form": "Verse", "aliases": [],
        "detail": (
            "This complete 1920 printing has two seven-line stanzas. "
            "The secondary account of the 1995 BBC British viewer poll lists this individual poem."
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
        record = {
            "id": "recognized-owen-classics-" + work["key"], "title": work["title"],
            "author": "Wilfred Owen", "authorId": "wilfred-owen", "authorYears": "1893–1918",
            "country": "England", "language": "English", "lang": "en", "direction": "ltr",
            "year": 1920, "yearLabel": "1920 printing · not necessarily composition date",
            "era": "20th century", "form": work["form"], "collection": "Poems · 1920",
            "themes": [], "mood": "paper",
            "context": work["detail"] + (
                " The text follows the posthumous printing, not a claim about a final manuscript; "
                "spacing, indentation and punctuation typography are normalized. "
                "England is an associated place, not a claim about where the poem was composed."
            ),
            "sourceTitle": f"Poems · 1920, p. {work['page']}",
            "source": f"{PDF}#page={work['pdfPage']}",
            "contextSourceTitle": "Secondary account of the 1995 British poll", "contextSource": POLL,
            "rights": RIGHTS, "searchAliases": work["aliases"], "text": text, "translations": [],
        }
        for key in ("titleLang", "textLanguageSpans", "textLanguageOverrides"):
            if key in work:
                record[key] = work[key]
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

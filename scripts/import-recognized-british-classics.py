#!/usr/bin/env python3
"""Reproduce four individually documented historical British readings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-british-classics-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-british-classics.json"
READINGS_SHA256 = "2766a549f94dbf53fba248be56f4ca94c1f0f0dab8f7dae0658900c090ab2ce4"

# These identify consulted copies; hashes do not prove transcription accuracy.
EVIDENCE = {
    "davies-songs-joy-1911-future.pdf": "6d6f05c9caa07196720c7ae03ff2e2143cdcc8c1a1b78c4bd1f97463bacc851d",
    "kipling-rewards-fairies-1910-future.pdf": "cc5ac122f85211c92fcede56c7f7123f0794fe1bf3e82f4ac13b262f3b5048d5",
    "kipling-fletcher-history-1911-future.pdf": "fe17193062ec88cc9bd2c7822c958413b9a054f7cc9bc7fa2294153aa6a9d930",
    "chesterton-wild-knight-1914-future.pdf": "df51c4552a0654a6328d2183d3578de5a97c87425fc93a9c556fcdc26e62be83",
}
RIGHTS = (
    "The historical printing is public domain in the United States. Copyright, edition-related and moral rights "
    "vary by jurisdiction; check local law. The scan is linked, not republished. "
    "No translation or recording is included."
)
POLL = "https://wykontario.org/index.php/features-category/1150-100-favorite-poems-of-britain"
WORKS = [
    {
        "key": "davies-leisure", "title": "Leisure", "author": "W. H. Davies", "authorId": "w-h-davies",
        "authorYears": "1871–1940", "authorAliases": ["William Henry Davies", "William H Davies"],
        "country": "Wales", "year": 1911, "form": "Lyric", "collection": "Songs of Joy and Others · 1911",
        "context": (
            "The complete seven couplets occupy p. 15, before Love's Power. Literature Wales and Swansea "
            "University describe this as Davies's most widely anthologized poem; the later educational "
            "commentary is not the source of this text. Indentation and apostrophe typography are normalized. "
            "Wales is an associated place, not a claim about composition."
        ),
        "sourceTitle": "Songs of Joy and Others · London, 1911, p. 15 / PDF p. 19",
        "source": "https://archive.org/download/songsofjoyothers00davi/songsofjoyothers00davi.pdf#page=19",
        "contextSourceTitle": "Literature Wales and Swansea University · individual educational commentary",
        "contextSource": "https://www.swansea.ac.uk/media/Leisure---W-H-Davies.pdf",
        "searchAliases": ["What is this life if, full of care", "stand and stare"], "stanzas": [2, 2, 2, 2, 2, 2, 2],
    },
    {
        "key": "kipling-way-through-woods", "title": "The Way through the Woods", "author": "Rudyard Kipling",
        "authorId": "rudyard-kipling", "authorYears": "1865–1936", "country": "England", "year": 1910,
        "form": "Lyric", "collection": "Rewards and Fairies · 1910",
        "context": (
            "This complete, separately headed poem occupies p. 87 before Marklake Witches. The Kipling "
            "Society identifies it as among his best-known poems. The Toronto printing has a period after "
            "mate and no comma after woods in the parenthesis; some later versions punctuate these differently. "
            "A printer-wrapped line is rejoined; indentation and apostrophe typography are normalized. "
            "England is an associated place, not a claim about composition."
        ),
        "sourceTitle": "Rewards and Fairies · Toronto, 1910, p. 87 / PDF p. 107",
        "source": "https://archive.org/download/rewardsfairie00kipl/rewardsfairie00kipl.pdf#page=107",
        "contextSourceTitle": "The Kipling Society · individual poem notes",
        "contextSource": "https://www.kiplingsociety.co.uk/readers-guide/rg_woods1.htm",
        "searchAliases": ["They shut the road through the woods", "the old lost road through the woods"],
        "stanzas": [12, 13],
    },
    {
        "key": "kipling-glory-of-garden", "title": "The Glory of the Garden", "author": "Rudyard Kipling",
        "authorId": "rudyard-kipling", "authorYears": "1865–1936", "country": "England", "year": 1911,
        "form": "Lyric", "collection": "A History of England · 1911",
        "context": (
            "This separately headed poem closes the 1911 New York printing on pp. 306–308; it has eight "
            "stanzas and a final repeated line, printed in italics here rendered in plain text. A secondary "
            "transcription of a 1995 British poll lists it individually, not as a global ranking. The "
            "Kipling Society notes its relationship to the school history and later editions. Printer-wrapped "
            "lines are rejoined; indentation and apostrophe typography are normalized. England is an "
            "associated place, not a claim about composition."
        ),
        "sourceTitle": "A History of England · Garden City, New York, 1911, pp. 306–308 / PDF pp. 390–392",
        "source": "https://archive.org/download/historyofengland00flet/historyofengland00flet.pdf#page=390",
        "contextSourceTitle": "Wah Yan College alumni · transcription of 1995 BBC poll",
        "contextSource": POLL,
        "searchAliases": ["Our England is a garden", "Glory of the Garden"], "stanzas": [4, 4, 4, 4, 4, 4, 4, 5],
    },
    {
        "key": "chesterton-donkey", "title": "The Donkey", "author": "G. K. Chesterton",
        "authorId": "g-k-chesterton", "authorYears": "1874–1936", "authorAliases": ["Gilbert Keith Chesterton"],
        "country": "England", "year": 1914, "form": "Lyric", "collection": "The Wild Knight · fourth edition",
        "context": (
            "This separately headed poem's four complete quatrains occupy pp. 16–17; The Beatific Vision "
            "begins on p. 18. A secondary transcription of a 1995 British poll lists it individually, not "
            "as a global ranking. The inspected copy is the 1914 fourth edition with additional poems, "
            "not a claim that it is textually identical to the 1900 volume. Indentation and apostrophe "
            "typography are normalized. England is an associated place, not a claim about composition."
        ),
        "sourceTitle": "The Wild Knight · fourth edition, London and New York, 1914, pp. 16–17 / PDF pp. 34–35",
        "source": "https://archive.org/download/wildknight00chesrich/wildknight00chesrich.pdf#page=34",
        "contextSourceTitle": "Wah Yan College alumni · transcription of 1995 BBC poll", "contextSource": POLL,
        "searchAliases": ["When fishes flew and forests walked", "And palms before my feet"],
        "stanzas": [4, 4, 4, 4],
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
        record = {key: value for key, value in work.items() if key not in {"key", "stanzas"}}
        record.update({
            "id": "recognized-british-classics-" + work["key"], "language": "English", "lang": "en",
            "direction": "ltr", "era": "20th century", "yearLabel": f"{work['year']} printing · not necessarily composition date",
            "themes": [], "mood": "paper", "rights": RIGHTS, "text": text, "translations": [],
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
        print(f"Verified {len(records)} historical readings" + ("; witness hashes match." if args.evidence_dir else "."))


if __name__ == "__main__":
    main()

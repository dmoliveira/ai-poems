#!/usr/bin/env python3
"""Reproduce two complete Dutch readings from historical printings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-dutch-classics-2-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-dutch-classics-2.json"
READINGS_SHA256 = "9ee0040e2df41d7f39d013229a3e9f0359ef55ddb5ff903e4b30390fce141ff9"

# These identify consulted copies, not the accuracy of their transcriptions.
EVIDENCE = {
    "dutch-kloos-verzen-1902-discovery.pdf": "a013f65f0d03aa6dd2e2272cf0740afc1715e788bbbb2de11b4fc73dfc63c507",
    "dutch-eeden-enkele-1898-discovery.pdf": "2b37e52a8e6c0754506b66f73f8c6d27f53dabb2b17338d7e2ea727779533f4f",
}
SURVEY = "https://www.dbnl.org/tekst/_tsj001199701_01/_tsj001199701_01_0028.php"
RIGHTS = (
    "The historical printing is public domain in the United States. "
    "Copyright, edition-related and moral rights vary by jurisdiction; check local law. "
    "The facsimile is linked, not republished; no translation, illustration or recording is included."
)
WORKS = [
    {
        "key": "ik-ween-om-bloemen", "title": "Ik ween om bloemen, in den knop gebroken",
        "author": "Willem Kloos", "authorId": "willem-kloos", "authorYears": "1859–1938",
        "year": 1902, "era": "19th century", "form": "Sonnet", "stanzas": [4, 4, 3, 3],
        "collection": "Verzen I · second printing, 1902",
        "aliases": ["Ik ween om bloemen in de knop gebroken", "Ik ween om bloemen"],
        "sourceTitle": "Verzen I · second printing, 1902, p. 73",
        "source": "https://archive.org/download/verzen00kloogoog/verzen00kloogoog.pdf#page=79",
        "detail": (
            "The complete fourteen-line sonnet is numbered LXI on p. 73; the opening supplies its title here. "
            "The 1902 printing has 'heen-gegaan' and 'geblaêrte'; a teaching text uses 'heengegaan' and 'geblaarte'. "
            "A publisher identifies this poem in the earlier 1894 volume. Kloos died in 1938."
        ),
    },
    {
        "key": "de-waterlelie", "title": "De waterlelie",
        "author": "Frederik van Eeden", "authorId": "frederik-van-eeden", "authorYears": "1860–1932",
        "year": 1898, "era": "19th century", "form": "Verse", "stanzas": [3, 3, 2],
        "collection": "Enkele verzen · 1898", "aliases": ["Ik heb de witte waterlelie lief"],
        "sourceTitle": "Enkele verzen · 1898, first poem, unnumbered page",
        "source": "https://archive.org/download/enkeleverzen00eedegoog/enkeleverzen00eedegoog.pdf#page=11",
        "detail": (
            "The complete eight-line poem appears on the unnumbered first poem page, before De Lente. "
            "The 1898 printing has 'zoo' and 'wenscht'; a teaching text uses modern 'zo' and 'wenst'. "
            "Van Eeden died in 1932."
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
            "id": "recognized-dutch-classics-2-" + work["key"], "title": work["title"],
            "author": work["author"], "authorId": work["authorId"], "authorYears": work["authorYears"],
            "country": "Netherlands", "language": "Dutch", "lang": "nl", "direction": "ltr",
            "year": work["year"], "yearLabel": f"{work['year']} printing · not necessarily composition date",
            "era": work["era"], "form": work["form"], "collection": work["collection"],
            "themes": [], "mood": "paper",
            "context": work["detail"] + (
                " A 1997 review reports the individual poem in a Dutch teachers' survey selection; "
                "this documents educational attention, not a global ranking. "
                "Spacing, indentation and apostrophe typography are normalized; historical wording is retained. "
                "The associated country is not a claim about where the poem was composed."
            ),
            "sourceTitle": work["sourceTitle"], "source": work["source"],
            "contextSourceTitle": "Dutch teachers' survey selection · 1997 review", "contextSource": SURVEY,
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

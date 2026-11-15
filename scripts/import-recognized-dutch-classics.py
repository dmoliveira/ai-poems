#!/usr/bin/env python3
"""Reproduce three distinct Dutch-language historical readings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-dutch-classics-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-dutch-classics.json"
READINGS_SHA256 = "08e35cccfd4b5d5952bd239f02b2181dfc30863cee97b5c466e2c9620514b0d7"

# These identify the inspected copies, not the accuracy of their transcriptions.
EVIDENCE = {
    "gorter-verzen-1890.pdf": "64725da0a0f1642f2810cfdea263e6f4ed3020f7488250e9e2f2440b8be51e55",
    "van-alphen-dichtwerken-1857.pdf": "a6dc8ad054101d03c851137c423bcf3f2fe5a0906a64e557c8bba0c9c01f6ce6",
}
SURVEY = "https://www.dbnl.org/tekst/_tsj001199701_01/_tsj001199701_01_0028.php"
RIGHTS = (
    "The historical printing is public domain in the United States. "
    "Copyright, edition-related and moral rights vary by jurisdiction; check local law. "
    "The source is linked, not republished; no translation, illustration or recording is included."
)

WORKS = [
    {
        "key": "zie-je-ik-hou-van-je", "title": "Zie je ik hou van je",
        "author": "Herman Gorter", "authorId": "herman-gorter", "authorYears": "1864–1927",
        "country": "Netherlands", "year": 1890, "stanzas": [4, 4, 4, 4],
        "collection": "Verzen · 1890", "aliases": ["Zie je, ik hou van je"],
        "sourceTitle": "Verzen · 1890, p. 102",
        "source": "https://upload.wikimedia.org/wikipedia/commons/d/d0/Herman_Gorter%2C_Verzen_%281890%29.pdf#page=110",
        "detail": (
            "This complete sixteen-line poem occupies printed p. 102 of the 1890 volume. "
            "The volume prints no title; the opening words serve as the title here. "
            "Gorter died in 1927."
        ),
    },
    {
        "key": "de-pruimeboom", "title": "De Pruimeboom",
        "author": "Hieronymus van Alphen", "authorId": "hieronymus-van-alphen", "authorYears": "1746–1803",
        "country": "Netherlands", "year": 1857, "stanzas": [24],
        "collection": "Dichtwerken · 1857", "aliases": ["De pruimenboom", "The plumtree"],
        "sourceTitle": "Dichtwerken · second printing, volume 1, 1857, pp. 393–394",
        "source": "https://archive.org/download/dichtwerkenvanm00alphgoog/dichtwerkenvanm00alphgoog.pdf#page=463",
        "detail": (
            "This complete twenty-four-line poem continues for two lines on p. 394; "
            "the next poem is excluded. Its 1857 subtitle is 'Eene vertelling'. "
            "Van Alphen died in 1803. Translations and adaptations are not separate works here."
        ),
    },
    {
        "key": "het-schryverke", "title": "Het Schryverke",
        "author": "Guido Gezelle", "authorId": "guido-gezelle", "authorYears": "1830–1899",
        "country": "Belgium", "year": 1858, "stanzas": [44],
        "collection": "Vlaemsche dichtoefeningen · 1858", "aliases": ["Het schrijverke", "Gyrinus natans"],
        "sourceTitle": "Vlaemsche dichtoefeningen · 1858, pp. 36–37, via DBNL (KB, national library)",
        "source": "https://www.dbnl.org/tekst/geze002vlae01_01/geze002vlae01_01_0009.php",
        "detail": (
            "The complete forty-four-line reading follows DBNL's diplomatic transcription of "
            "an identified 1858 copy, not inspected page images. The transcription includes the subtitle "
            "'(Gyrinus natans.)'. The transcription retains 'kabotseken' and 'regtte'; "
            "later readings differ. DBNL marks this edition copyright-free and requests "
            "customary source attribution. Gezelle died in 1899."
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
            "id": "recognized-dutch-classics-" + work["key"], "title": work["title"],
            "author": work["author"], "authorId": work["authorId"], "authorYears": work["authorYears"],
            "country": work["country"], "language": "Dutch", "lang": "nl", "direction": "ltr",
            "year": work["year"], "yearLabel": f"{work['year']} printing · not necessarily composition date",
            "era": "19th century", "form": "Verse", "collection": work["collection"],
            "themes": [], "mood": "paper",
            "context": work["detail"] + (
                " A 1997 review reports the individual poem in a Dutch teachers' survey selection; "
                "this documents educational attention, not a global ranking. "
                "Spacing, indentation and punctuation typography are normalized; historical wording is retained. "
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

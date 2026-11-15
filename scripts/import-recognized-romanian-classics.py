#!/usr/bin/env python3
"""Reproduce six complete Romanian readings from Eminescu's 1884 Poesii."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-romanian-classics-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-romanian-classics.json"
READINGS_SHA256 = "44c92b0f2bf4782f57e539e4b539cc0175c66ccc267435156412662f67d053f0"

# These identify the inspected copies, not the accuracy of their transcriptions.
EVIDENCE = {
    "eminescu-poesii-1884-bcu-iasi.pdf": "aef6be579c0f728af12115f5b0d97c1af92c53ebb93d018ce5964778186c29fd",
    "eminescu-1884-ia-socecu-copy.pdf": "88f15d106d78d7281b7fbbe05de2d1b8b2203e8fe306e2a45497a6047c2d7754",
}
PDF = "https://dspace.bcu-iasi.ro/bitstream/handle/123456789/36442/BCUIASI_CS_CR2155_1884.pdf?sequence=2&isAllowed=y"
NEWS = "https://www.libertatea.ro/lifestyle/poezii-de-mihai-eminescu-2805295"
SCHOOL = "https://liceunet.ro/mihai-eminescu/dorinta/eseu"
RIGHTS = (
    "The 1884 printing is public domain in the United States; Eminescu died in 1889 and "
    "editor Titu Maiorescu in 1917. Copyright, edition-related and moral rights vary by jurisdiction; "
    "check local law. The scan is linked, not republished; the verse was transcribed from its "
    "historical pages. No translation or recording is included."
)

WORKS = [
    {
        "key": "lacul", "title": "Lacul", "pages": "87–88", "pdfPage": 101, "stanzas": [4] * 5,
        "reception": NEWS,
        "aliases": ["Lacul codrilor albastru", "Nuferi galbeni îl încarcă"],
        "detail": (
            "The five-quatrain 1884 reading prints 'resară', 'sufĕr' and 'nufĕr'; "
            "modern spellings differ. The newspaper identifies this individual poem as well known."
        ),
    },
    {
        "key": "dorinta", "title": "Dorința", "pages": "63–64", "pdfPage": 77, "stanzas": [4] * 6,
        "reception": SCHOOL,
        "aliases": ["Vino-n codru la izvorul", "Vino în codru la izvorul", "Dorinţa"],
        "detail": (
            "The six-quatrain reading prints 'Să alergi, pe piept să-mi caz', 'O să-ți cază' "
            "and 'Ori să cadă'; modern readings often differ. Liceunet discusses this individual "
            "poem in a Romanian educational context."
        ),
    },
    {
        "key": "floare-albastra", "title": "Floare albastră", "pages": "97–100", "pdfPage": 111,
        "stanzas": [4] * 13 + [1, 4], "reception": NEWS,
        "aliases": ["Iar te-ai cufundat în stele", "râuri de soare", "balta cea senină"],
        "detail": (
            "All fourteen quatrains form one poem. The 1884 reading has 'riuri in soare' "
            "and 'bolta cea senină', not the 'râuri de soare' and 'balta cea senină' found "
            "in some modern readings. A normalized dotted divider before the final stanza is "
            "printed in the source and counts as a displayed line, not a fifteenth stanza."
        ),
    },
    {
        "key": "somnoroase-pasarele", "title": "Somnoroase păsărele", "pages": "167–168", "pdfPage": 181,
        "stanzas": [4] * 4, "reception": NEWS,
        "aliases": ["Somnoroase păsărele", "Trece lebăda pe ape", "Noapte bună"],
        "detail": (
            "The four-quatrain 1884 reading prints 'Trece lebeda pe apă'; "
            "some modern readings have 'Trece lebăda pe ape'. The newspaper identifies "
            "the individual poem as well known; musical settings are not included."
        ),
    },
    {
        "key": "si-daca", "title": "Și dacă ramuri bat în geam", "pages": "9–10", "pdfPage": 23,
        "stanzas": [4] * 3, "reception": NEWS,
        "aliases": ["Și dacă", "Şi dacă", "Și dacă ramuri bat în geam"],
        "detail": (
            "The three-quatrain poem is headed 'Și dacă ramuri bat in geam' in this printing; "
            "'Și dacă' is a later short title for the same work. The newspaper selects it "
            "individually, not as a separate adaptation or translation."
        ),
    },
    {
        "key": "pe-langa-plopii", "title": "Pe lângă plopii fără soț", "pages": "139–142", "pdfPage": 153,
        "stanzas": [4] * 11, "reception": NEWS,
        "aliases": ["Pe lângă plopii fără soţ", "Pe lăngă plopii fără soț"],
        "detail": (
            "The eleven-quatrain reading continues across four pages and ends 'Iubirii pe pămĕnt.' "
            "It prints 'O oară' and 'din adins', rather than some modern spellings. "
            "The newspaper selects this poem individually."
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
            "id": "recognized-romanian-classics-" + work["key"], "title": work["title"],
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

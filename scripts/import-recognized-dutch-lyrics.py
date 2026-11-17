#!/usr/bin/env python3
"""Reproduce three Dutch-language poems from identified historical printings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-dutch-lyrics-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-dutch-lyrics.json"
READINGS_SHA256 = "668eb4a4c2ec4090b194d7dfce6bcca7e4026246705b68dcece03dd344a8154a"

# These identify consulted copies, not the accuracy of their transcriptions.
EVIDENCE = {
    "hooft-emblemata-amatoria-1611.pdf": "c59355580ab025b43c52f737e173ccded755b031262d476cd5f2491f496d1f05",
    "gezelle-1903-riet-p83.jpg": "ecd63e90a3e41ccfd056617e201c07475c1a11491500e0f254a7509567ea2138",
    "gezelle-1903-riet-p84.jpg": "1ca929885634648d78064c425994fc8adbc4199a083e86a99a58dda5d9c09898",
    "gezelle-gedichten-1908-db.pdf": "a4a47bd9e5c7ce76f8c53ed301098a2c52d7b69f398024e2a9002b056a3df64d",
}
COMMON = {
    "language": "Dutch", "lang": "nl", "direction": "ltr", "themes": [],
    "mood": "paper", "translations": [],
}
RIGHTS = (
    "This historical poem reading is public domain in the United States. {deaths} "
    "Copyright, edition-related and moral rights vary by jurisdiction; check local law. "
    "The scan is linked, not republished; no translation, score or recording is included."
)
WORKS = [
    {
        "key": "hooft-grysaert", "blocks": [14],
        "id": "recognized-dutch-lyrics-hooft-grysaert",
        "title": "Ghesvvinde Grysaert", "author": "P. C. Hooft",
        "authorId": "p-c-hooft", "authorYears": "1581–1647",
        "authorAliases": ["P.C. Hooft", "Pieter Corneliszoon Hooft", "Pieter Cornelisz Hooft"],
        "country": "Netherlands", "year": 1611,
        "yearLabel": "1611 printing · manuscript dated 1610", "era": "17th century", "form": "Sonnet",
        "collection": "Emblemata amatoria · 1611",
        "sourceTitle": "Emblemata amatoria · 1611 · p. 122 · DBNL",
        "source": "https://www.dbnl.org/tekst/hoof001embl02_01/hoof001embl02_01_0067.php",
        "contextSourceTitle": "Dutch teachers’ survey selection · 1997 review",
        "contextSource": "https://www.dbnl.org/tekst/_tsj001199701_01/_tsj001199701_01_0028.php",
        "searchAliases": ["Gezwinde grijsaard", "Geswinde grijsart", "Gezwinde grijsaard die op wakkere wieken staag"],
        "context": (
            "The 1611 printing heads this complete fourteen-line poem 'Sonnet'; its opening supplies "
            "the catalogue title. It stands among separately headed songs and sonnets, not in an "
            "emblem. The printed reading retains vv spellings; long s, indentation and punctuation "
            "typography are normalized. A manuscript dated 17 February 1610 differs in wording, "
            "including line 10. The Dutch teachers' survey selection documents attention to this "
            "individual poem, not a global ranking. The Netherlands is an associated place."
        ),
        "rights": RIGHTS.format(deaths="Hooft died in 1647; DBNL marks this 1611 edition copyright-free."),
    },
    {
        "key": "gezelle-ruischen", "blocks": [8] * 6,
        "id": "recognized-dutch-lyrics-gezelle-ruischen",
        "title": "O ’t ruischen van het ranke riet", "author": "Guido Gezelle",
        "authorId": "guido-gezelle", "authorYears": "1830–1899",
        "country": "Belgium", "year": 1903,
        "yearLabel": "Edition catalogued as 1903 · earlier version 1858", "era": "19th century", "form": "Verse",
        "collection": "Dichtoefeningen · edition catalogued as 1903",
        "sourceTitle": "Dichtoefeningen · pp. 83–84 · scan-linked Wikisource",
        "source": "https://nl.wikisource.org/wiki/Gezelle/O_%27t_ruischen_van_het_ranke_riet",
        "contextSourceTitle": "KANTL · widely anthologized Gezelle poems",
        "contextSource": "https://canon2020.literairecanon.be/nl/nieuws/de-kleine-gezelle-honderd-gedichten",
        "searchAliases": ["O 't ruisen van het ranke riet", "De Bedroefde"],
        "context": (
            "The chosen printing has six eight-line stanzas; its separately attributed Homeric motto "
            "is not part of the lyric here. DBNL catalogues the scan as 1903, though its colophon "
            "says the copy is undated. The 1858 printing differs in spelling and wording; this "
            "reading retains 'windtje' and 'rieten staal' from the scan. KANTL identifies this "
            "individual poem as widely anthologized, not globally ranked. Typeface and punctuation "
            "typography are normalized. Belgium is an associated place."
        ),
        "rights": RIGHTS.format(deaths="Gezelle died in 1899; the cited historical printing is catalogued as 1903."),
    },
    {
        "key": "gezelle-dien-avond", "blocks": [32],
        "id": "recognized-dutch-lyrics-gezelle-dien-avond",
        "title": "Dien avond en die rooze", "author": "Guido Gezelle",
        "authorId": "guido-gezelle", "authorYears": "1830–1899",
        "country": "Belgium", "year": 1908,
        "yearLabel": "1908 printing · written 1858", "era": "19th century", "form": "Verse",
        "collection": "Gedichten · 1908",
        "sourceTitle": "Gedichten · Nijland edition, 1908 · pp. 85–86 · DBNL scan",
        "source": "https://www.dbnl.org/arch/geze002gedi03_01/pag/geze002gedi03_01.pdf#page=99",
        "contextSourceTitle": "KANTL · widely anthologized Gezelle poems",
        "contextSource": "https://canon2020.literairecanon.be/nl/nieuws/de-kleine-gezelle-honderd-gedichten",
        "searchAliases": ["Dien avond en die roze", "Ik heb menig menig uur bij u"],
        "context": (
            "This separately headed 32-line poem is dedicated 'Aan den voorgaande' in the "
            "1908 selection. It was first printed in 1863, not in the 1862 first edition of "
            "Gedichten, gezangen en gebeden; the poem entered that collection in 1879. "
            "The 1908 scan reads 'menig menig' in its opening, unlike some later transcriptions. "
            "Its alternating indentation is retained; italic emphasis and punctuation typography "
            "are normalized. KANTL identifies the individual poem as widely anthologized, not "
            "globally ranked. Belgium is an associated place."
        ),
        "rights": RIGHTS.format(deaths="Gezelle died in 1899 and anthology editor J. Aleida Nijland in 1950."),
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
        if [len(block.splitlines()) for block in text.split("\n\n")] != work["blocks"]:
            raise ValueError(f"Unexpected reading boundaries: {work['key']}")
        record = {**COMMON, **{key: value for key, value in work.items() if key not in {"key", "blocks"}}}
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

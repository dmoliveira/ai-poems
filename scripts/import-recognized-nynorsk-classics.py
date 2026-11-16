#!/usr/bin/env python3
"""Reproduce five early Nynorsk poems from specified historical printings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-nynorsk-classics-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-nynorsk-classics.json"
READINGS_SHA256 = "66f1c94063df6906634e7da50dfa6c54d2334c2df8130f0becd6606f7e191f4a"

# Hashes identify the copies consulted; they do not themselves prove a transcription.
EVIDENCE = {
    "aasen-symra-1863-image005.jpg": "4ba1d73a94d30705cb479b4b6412a2cfaa2c38f2e448c7ec6a5e82caa9fe2440",
    "aasen-symra-1863-image006.jpg": "d8a9bab06a35ab5359f2c5ae5c8567c3c0b5ed41b13a6cc6479fadb2a7ae1603",
    "aasen-symra-1863-image007.jpg": "7c3ce773aaf2f4fc1cbfd4daae32306f3e6f6517662ed427e3725f6de158cb52",
    "aasen-symra-1863-image010.jpg": "9eb739784fc7b5fdc203a1f37cb4aa4bd25e5981936e2897430471dc3e729df4",
    "aasen-symra-1863-image011.jpg": "10e618e9f26b3263dd45917aede970aaca0823e36cf65eaf5df26dab6d0289bf",
    "vinje-diktsamling-title-1864-p094.jpg": "428487969ba7fd23f07eb09f1bb99e0f7103029a3c3caee8e8f455c4ab772794",
    "vinje-diktsamling-title-1864-p152.jpg": "1a0928f583403fe8b6c371246dd88406cab8073e55da36ed33bc46f9aacb95c1",
    "vinje-diktsamling-title-1864-p153.jpg": "bee0be13b448890decd8a2b80a79d0c2f225ce86a931705b12e9b6983dd69cd6",
}

AASEN = {"author": "Ivar Aasen", "authorId": "ivar-aasen", "authorYears": "1813–1896", "authorAliases": ["Ivar Åsen"]}
VINJE = {
    "author": "Aasmund Olavsson Vinje", "authorId": "aasmund-olavsson-vinje", "authorYears": "1818–1870",
    "authorAliases": ["A. O. Vinje", "Åsmund Olavsson Vinje"],
}
COMMON = {
    "country": "Norway", "language": "Norwegian", "lang": "nn", "direction": "ltr", "era": "19th century",
    "form": "Lyric", "themes": [], "mood": "paper", "translations": [],
}
LANDSMAAL = (
    "Landsmaal was an early form of the written language later called Nynorsk; the nn tag identifies "
    "that language family, not modernized spelling. Historical spelling is retained; typeface, "
    "indentation, spacing and some punctuation are normalized. Norway is an associated place, "
    "not a composition claim."
)
VINJE_DATE = "The title page says 1864; Store norske leksikon reports publication in December 1863. "
WORKS = [
    {
        "key": "gamle-norig", **AASEN, "title": "Gamle Norig", "displayTitle": "Old Norway",
        "year": 1863, "yearLabel": "1863 printing", "collection": "Symra · 1863",
        "context": (
            "Symra prints this separately titled poem in three numbered eight-line stanzas on pp. 5–6, "
            "before Nordmannen. Store norske leksikon names it among Aasen's known poems. " + LANDSMAAL
        ),
        "sourceTitle": "Symra · 1863 · pp. 5–6",
        "source": "https://www.nb.no/items/URN:NBN:no-nb_digibok_2009120812001?page=6",
        "contextSourceTitle": "Store norske leksikon · Ivar Aasen",
        "contextSource": "https://snl.no/Ivar_Aasen",
        "searchAliases": ["Gamle Noreg", "Gamle Norge", "Gamle Norig nørdst i Grendom"],
        "blocks": [8, 8, 8],
    },
    {
        "key": "nordmannen", **AASEN, "title": "Nordmannen", "displayTitle": "The Norwegian",
        "year": 1863, "yearLabel": "1863 printing", "collection": "Symra · 1863",
        "context": (
            "The 1863 scan prints five numbered stanzas on pp. 6–7; the printed tune instruction is not verse. "
            "Grepstad's Aasen bibliography entry 184 says six stanzas, while its entry 212 says five. "
            "His separate comparison also reads 'si Røda' where the scan reads 'ei Røda'; the scan reading "
            "is retained. Later versions are not combined or counted as separate works. " + LANDSMAAL
        ),
        "sourceTitle": "Symra · 1863 · pp. 6–7",
        "source": "https://www.nb.no/items/URN:NBN:no-nb_digibok_2009120812001?page=7",
        "contextSourceTitle": "Nynorsk kultursentrum · Ivar Aasen's versions",
        "contextSource": "https://www.nynorsk.no/ivar-aasens-ulike-versjonar",
        "searchAliases": ["Mellom bakkar og berg", "Millom bakkar og berg", "Millom Bakkar og Berg ut med Havet"],
        "blocks": [4, 4, 4, 4, 4],
    },
    {
        "key": "gamle-grendi", **AASEN, "title": "Gamle Grendi", "displayTitle": "The Old Village",
        "year": 1863, "yearLabel": "1863 printing", "collection": "Symra · 1863",
        "context": (
            "The separately titled poem has four numbered eight-line stanzas on Symra pp. 10–11, "
            "following Heimvegen. Store norske leksikon names it among Aasen's known poems. " + LANDSMAAL
        ),
        "sourceTitle": "Symra · 1863 · pp. 10–11",
        "source": "https://www.nb.no/items/URN:NBN:no-nb_digibok_2009120812001?page=11",
        "contextSourceTitle": "Store norske leksikon · Ivar Aasen",
        "contextSource": "https://snl.no/Ivar_Aasen",
        "searchAliases": ["Gamle grenda", "Den gamle grenda", "Tidt eg minnest ein gamall gard"],
        "blocks": [8, 8, 8, 8],
    },
    {
        "key": "den-saerde", **VINJE, "title": "Den Særde", "displayTitle": "The Wounded One",
        "year": 1864, "yearLabel": "1864 title page · publication reported December 1863",
        "collection": "Diktsamling · title page 1864",
        "context": (
            "Diktsamling p. 94 prints this separately titled poem in three five-line stanzas, before "
            "Efter eit Lag. Bokselskap includes it among five well-known poems from the collection. "
            + VINJE_DATE + LANDSMAAL
        ),
        "sourceTitle": "Diktsamling · title page 1864 · p. 94",
        "source": "https://www.nb.no/items/URN:NBN:no-nb_digibok_2009071303002?page=111",
        "contextSourceTitle": "Bokselskap · selected poems of A. O. Vinje",
        "contextSource": "https://www.bokselskap.no/boker/vinjedikt/tittelside",
        "searchAliases": ["Den sårede", "Den såra", "Mitt hjarte har vore i livsens strid", "Mit Hjarta har voret"],
        "blocks": [5, 5, 5],
    },
    {
        "key": "vaaren", **VINJE, "title": "Vaaren", "displayTitle": "Spring",
        "year": 1864, "yearLabel": "1864 title page · publication reported December 1863",
        "collection": "Diktsamling · title page 1864",
        "context": (
            "The complete poem has 24 long lines on Diktsamling pp. 152–153; printed line wraps are rejoined. "
            "Store norske leksikon dates its first printing in Dølen to 3 June 1860. "
            "Grieg's later setting uses only lines 1–6 and 19–24; it is not a separate poem here. "
            "The scan reads 'af' twice and 'vaarlige'; Bokselskap's transcription reads 'av' and 'vaarlege'. "
            "The printing's four glosses, not verse, are: kralla — 'den sagte, afbrudte Duren'; "
            "Saagiddren — 'Af giddra, leika up og ned. Vaareimen, Dunsten, som leikar paa Vaarbakken "
            "liksom eit Sædekast'; Fivreld — 'Fjæril, Sommerfugl'; Eim — 'Damp'. "
            "Footnote markers are omitted from the reading. " + VINJE_DATE + LANDSMAAL
        ),
        "sourceTitle": "Diktsamling · title page 1864 · pp. 152–153",
        "source": "https://www.nb.no/items/URN:NBN:no-nb_digibok_2009071303002?page=169",
        "contextSourceTitle": "Bokselskap · selected poems of A. O. Vinje",
        "contextSource": "https://www.bokselskap.no/boker/vinjedikt/tittelside",
        "searchAliases": ["Våren", "Enno ein gong fekk eg vetren å sjå", "Enno ein Gong fekk eg Vetren at sjaa"],
        "blocks": [24],
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
        record.update({
            "id": "recognized-nynorsk-" + work["key"],
            "rights": (
                "Historical original published before 1931; public domain in the United States. "
                "Transcribed from the linked National Library of Norway scan, marked public domain; "
                "the scan is linked, not republished. Copyright and moral rights vary; check local law. "
                "No translation or recording is included."
            ),
            "text": text,
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
        print(f"Verified {len(records)} historical readings" +
              ("; witness hashes match." if args.evidence_dir else "."))


if __name__ == "__main__":
    main()

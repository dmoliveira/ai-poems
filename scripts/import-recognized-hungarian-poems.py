#!/usr/bin/env python3
"""Reproduce five individually documented Hungarian historical readings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-hungarian-poems-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-hungarian-poems.json"
READINGS_SHA256 = "08ddd2ebbe5406e57b278ac279c6e9f904f8fc9f8c4fc0314f890119bd6b4d91"

# These identify the consulted copies, not the accuracy of their transcriptions.
EVIDENCE = {
    "petofi-dalaim-1921-discovery.pdf": "a03cd2b91e7306a7d26d90c3fcc61bfd210db30db21a5eb944d0817b8d4bcd69",
    "kolcsey-hymnus-aurora-1829-discovery.pdf": "32d69a93420f429ca94d6237df78857036532894976ef5bb0418146ee0b9a5fa",
}
PETOFI_SCAN = "https://archive.org/download/dalaimantholgi00petf/dalaimantholgi00petf.pdf"
HYMNUS_SCAN = "https://epa.oszk.hu/02900/02968/00002/pdf/EPA02968_aurora_1829_266-274.pdf"
COMMON = {
    "country": "Hungary", "language": "Hungarian", "lang": "hu", "era": "19th century", "form": "Verse",
}
PETOFI = {
    "author": "Sándor Petőfi", "authorId": "sandor-petofi", "authorYears": "1823–1849",
    "authorAliases": ["Petőfi Sándor", "Sandor Petofi", "Petofi Sandor"], "collection": "Dalaim · 1921",
    "year": 1921, "yearLabel": "1921 printing · not necessarily composition date",
    "rights": (
        "The 1921 printing is public domain in the United States; Petőfi died in 1849 and series editor "
        "György Király in 1922. Copyright, edition-related and moral rights vary by jurisdiction; check local law. "
        "The scan is linked, not republished. "
        "No translation or recording is included."
    ),
}
KOLCSEY = {
    "author": "Ferenc Kölcsey", "authorId": "ferenc-kolcsey", "authorYears": "1790–1838",
    "authorAliases": ["Kölcsey Ferenc", "Ferenc Kolcsey", "Kolcsey Ferenc"], "collection": "Aurora · 1829",
    "year": 1829, "yearLabel": "1829-dated printing · reportedly issued December 1828",
    "rights": (
        "The 1829-dated printing is public domain in the United States. Copyright, edition-related and moral "
        "rights vary by jurisdiction; check local law. The scan is linked, not republished. "
        "No translation or recording is included."
    ),
}
WORKS = [
    {
        **PETOFI, "key": "petofi-egy-gondolat-bant-engemet", "title": "Egy gondolat bánt engemet",
        "blocks": [36], "sourceTitle": "Dalaim · Gyoma, 1921, afterword by György Király, pp. 17–18 / PDF pp. 21–22",
        "source": PETOFI_SCAN + "#page=21",
        "contextSourceTitle": "Érettségi.com · analysis of Egy gondolat bánt engemet",
        "contextSource": "https://erettsegi.com/tetelek/irodalom/petofi-sandor-forradalmi-versei-egy-gondolat-bant-engemet-elemzes/",
        "searchAliases": ["Egy gondolat bant engemet"],
        "context": (
            "The complete 36-line reading occupies pp. 17–18 of the 1921 anthology, crossing a page turn "
            "after line six. The printed heading repeats the first line with an ellipsis. The reading retains "
            "nyúgatig, velök, ifjui, szivembül, ágyudörej and kiséretével. A Hungarian examination-preparation "
            "analysis discusses the individual poem. Heading ellipsis, spacing and dash typography are normalized; "
            "Hungary is an associated place, not a composition-location claim."
        ),
    },
    {
        **PETOFI, "key": "petofi-foltamadott-a-tenger", "title": "Föltámadott a tenger",
        "blocks": [5] * 5, "sourceTitle": "Dalaim · Gyoma, 1921, afterword by György Király, pp. 27–28 / PDF pp. 31–32",
        "source": PETOFI_SCAN + "#page=31", "contextSourceTitle": "Érettségi.com · Petőfi's poetry",
        "contextSource": "https://erettsegi.com/tetelek/irodalom/petofi-sandor-kolteszete/",
        "searchAliases": ["Foltamadott a tenger", "The sea has risen"],
        "context": (
            "The complete five stanzas occupy pp. 27–28 of the 1921 anthology; Rákóczi follows. "
            "The fourth stanza crosses the page turn. This printing reads Sűlyednek, fölűl and alúl. "
            "A Hungarian examination-preparation survey names the individual poem. The heading ellipsis "
            "and spacing are normalized; Hungary is an associated place, not a composition-location claim."
        ),
    },
    {
        **PETOFI, "key": "petofi-az-alfold", "title": "Az alföld",
        "blocks": [4] * 12, "sourceTitle": "Dalaim · Gyoma, 1921, afterword by György Király, pp. 123–125 / PDF pp. 127–129",
        "source": PETOFI_SCAN + "#page=127", "contextSourceTitle": "Érettségi.com · analysis of Az alföld",
        "contextSource": "https://erettsegi.com/tetelek/irodalom/petofi-sandor-tajversei-az-alfold-elemzes/",
        "searchAliases": ["Az alfold", "The Great Plain"],
        "context": (
            "The complete twelve quatrains occupy pp. 123–125 of the 1921 anthology; Az erdei lak follows. "
            "The historical reading retains szabadúlt, hosszu, gémü, vályu, szinével, vadlúdak and sir. "
            "A Hungarian examination-preparation analysis discusses the individual poem. Spacing and "
            "indentation are normalized; Hungary is an associated place, not a composition-location claim."
        ),
    },
    {
        **PETOFI, "key": "petofi-a-tisza", "title": "A Tisza",
        "blocks": [4] * 15, "sourceTitle": "Dalaim · Gyoma, 1921, afterword by György Király, pp. 129–131 / PDF pp. 133–135",
        "source": PETOFI_SCAN + "#page=133", "contextSourceTitle": "Érettségi.com · analysis of A Tisza",
        "contextSource": "https://erettsegi.com/tetelek/irodalom/petofi-sandor-a-tisza/",
        "searchAliases": ["The Tisza"],
        "context": (
            "The complete fifteen quatrains occupy pp. 129–131 of the 1921 anthology; A gólya follows. "
            "The historical reading retains alkonyúlatánál, símán, fodrába without an apostrophe, "
            "tulsó, usztak, szunyog and árviz. A Hungarian examination-preparation analysis discusses "
            "the individual poem. Spacing and indentation are normalized; Hungary is an associated place, "
            "not a composition-location claim."
        ),
    },
    {
        **KOLCSEY, "key": "kolcsey-hymnus", "title": "Hymnus", "blocks": [8] * 8,
        "sourceTitle": "Aurora · 1829-dated volume, pp. 267–270 / PDF leaves 1–3",
        "source": HYMNUS_SCAN + "#page=1", "contextSourceTitle": "National Library of Hungary · Hymnus chronology",
        "contextSource": "https://erkel.oszk.hu/tan/hymnustol-himnuszig-avagy-egy-legitimacio-toertenete-%E2%80%93-evszamokban",
        "searchAliases": ["Himnusz", "Magyar Himnusz"],
        "context": (
            "This complete eight-stanza first printing occupies pp. 267–270 of the volume dated 1829, "
            "which the National Library of Hungary reports was released in December 1828. The fifth stanza "
            "crosses a page turn. The heading has no subtitle; the source retains Tokaj', fenn fiad, Árvánk', "
            "múltat in the first stanza and multat in the last. Its first stanza is the basis of Hungary's "
            "national anthem; the excerpt, musical settings and other editions are not separate poems. "
            "Apostrophe typography, spacing and indentation are normalized; Hungary is an associated place, "
            "not a composition-location claim."
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
        if [len(block.splitlines()) for block in text.split("\n\n")] != work["blocks"]:
            raise ValueError(f"Unexpected reading boundaries: {work['key']}")
        record = {**COMMON, **{key: value for key, value in work.items() if key not in {"key", "blocks"}}}
        record.update({
            "id": "recognized-hungarian-poems-" + work["key"], "direction": "ltr", "themes": [],
            "mood": "paper", "text": text, "translations": [],
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

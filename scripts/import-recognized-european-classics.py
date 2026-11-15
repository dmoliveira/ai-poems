#!/usr/bin/env python3
"""Reproduce three complete Slovenian and Dutch historical readings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-european-classics-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-european-classics.json"
READINGS_SHA256 = "b963dade94dabbf63b25488271e1daed96c756ed6c8d21c7cf548c1c900bff17"

# These identify the inspected copies, not the accuracy of their transcriptions.
EVIDENCE = {
    "preseren-poezije-1914.pdf": "68518428b3ccf8ff10e316a81ae4066174508446f7c742249751b667abf606c9",
    "wilhelmus-1911.pdf": "9bd7eb42483a753d35f363db4307e6f60e7f050aa456ef8597408ee22f579bbc",
}

PRESEREN = {
    "author": "France Prešeren", "authorId": "france-preseren", "authorYears": "1800–1849",
    "authorAliases": ["France Prešerin"], "country": "Slovenia", "language": "Slovenian", "lang": "sl",
    "year": 1914, "era": "19th century", "collection": "Dóktorja Francéta Prešérna poezije · 1914",
    "rights": (
        "The 1914 printing is public domain in the United States; Prešeren died in 1849 and editor "
        "Luka Pintar in 1915. Copyright and moral rights vary by jurisdiction, so check local law. "
        "The scan is linked, not republished; the verse was transcribed from its historical pages. "
        "No translation or recording is included."
    ),
}

WORKS = [
    {
        **PRESEREN, "key": "preseren-zdravljica", "title": "Zdravljica", "stanzas": [7] * 8,
        "sourceTitle": "Dóktorja Francéta Prešérna poezije · third impression, 1914, pp. 17–19",
        "source": "https://archive.org/details/dktorjafranctap00pintgoog/page/n27/mode/1up",
        "reception": "https://www.gov.si/en/topics/national-symbols/",
        "searchAliases": ["Zdravica", "A Toast"],
        "detail": (
            "This complete eight-stanza 1914 reading is not the 1848 newspaper text or a modern anthem "
            "transcription. Its seventh stanza is the basis of Slovenia's national anthem; the stanza, "
            "other editions and musical settings are not separate works. The printed subtitle "
            "'Ob novíni leta 1844' is not another poem. The source reads 'Ki dôbro' in the last stanza."
        ),
    },
    {
        **PRESEREN, "key": "preseren-povodnji-moz", "title": "Povodnji mož", "stanzas": [6] * 14,
        "sourceTitle": "Dóktorja Francéta Prešérna poezije · third impression, 1914, pp. 54–57",
        "source": "https://archive.org/details/dktorjafranctap00pintgoog/page/n64/mode/1up",
        "reception": "https://www.sng-mb.si/program-opera-balet-sng-mb/povodni-moz/",
        "searchAliases": ["Povodni mož", "The Water Man"],
        "detail": (
            "This complete fourteen-stanza ballad is headed 'Povôdnji mož' in the 1914 printing; "
            "'Povodni mož' is a modern title for the same work. Earlier versions name the woman Zalika "
            "rather than Urška. On p. 55 a tiny mark after 'mizi' is unclear in the scan; it is not "
            "treated as punctuation here. The Slovenian National Theatre documents a later ballet adaptation, "
            "not an additional work in this catalogue."
        ),
    },
    {
        "key": "anonymous-wilhelmus", "title": "Wilhelmus", "author": "Anonymous (Wilhelmus)",
        "authorId": "anonymous-wilhelmus", "authorYears": "Author not established", "anonymous": True,
        "country": "Netherlands", "language": "Dutch", "lang": "nl", "year": 1911,
        "era": "Renaissance", "collection": "Wilhelmus van Nassouwe · 1911", "stanzas": [8] * 15,
        "sourceTitle": "Wilhelmus van Nassouwe · second edition, 1911, pp. 5–7, text A",
        "source": "https://archive.org/details/wilhelmusvannass00sgra/page/n8/mode/1up",
        "reception": "https://www.koninklijkhuis.nl/onderwerpen/koninklijk-huis/volkslied",
        "searchAliases": ["Wilhelmus van Nassouwe", "Willem van Nassov"],
        "detail": (
            "The complete Dutch text A has fifteen eight-line stanzas; its last stanza crosses the "
            "two columns on p. 7. The German text B and the music are not included. The poem became "
            "the Dutch national anthem in 1932; usually the first, sometimes also the sixth, is sung. Authorship "
            "is disputed; the record does not assert a named author. The editor cites an earlier source, "
            "but this reading follows his 1911 edition rather than an independently inspected 1581 copy."
        ),
        "rights": (
            "The 1911 printing is public domain in the United States; editor Florimond van Duyse died "
            "in 1910 and the historical poem's authorship is disputed. Copyright and moral rights vary "
            "by jurisdiction, so check local law. The scan is linked, not republished; the verse was "
            "transcribed from its historical pages. No translation or recording is included."
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
            "id": "recognized-european-classics-" + work["key"], "title": work["title"],
            "author": work["author"], "authorId": work["authorId"], "authorYears": work["authorYears"],
            "country": work["country"], "language": work["language"], "lang": work["lang"], "direction": "ltr",
            "year": work["year"], "yearLabel": f"{work['year']} printing · not necessarily composition date",
            "era": work["era"], "form": "Verse", "collection": work["collection"], "themes": [], "mood": "paper",
            "context": work["detail"] + (
                " Title accents, typography, spacing and indentation are normalized; "
                "the associated country is not a claim about where the poem was composed."
            ),
            "sourceTitle": work["sourceTitle"], "source": work["source"],
            "contextSourceTitle": "Individual reception and context", "contextSource": work["reception"],
            "rights": work["rights"], "searchAliases": work["searchAliases"], "text": text, "translations": [],
        }
        for key in ("authorAliases", "anonymous"):
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

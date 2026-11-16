#!/usr/bin/env python3
"""Reproduce two individually documented Slovenian historical readings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-slovenian-classics-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-slovenian-classics.json"
READINGS_SHA256 = "f90c773c42b266f84a2a179348d420d0f841d20f6033c224350b4b476ac22c31"

# This identifies the consulted copy, not the accuracy of the transcription.
EVIDENCE = {
    "preseren-poezije-1914.pdf": "68518428b3ccf8ff10e316a81ae4066174508446f7c742249751b667abf606c9",
}
SCAN = "https://archive.org/details/dktorjafranctap00pintgoog/page/"
COMMON = {
    "author": "France Prešeren", "authorId": "france-preseren", "authorYears": "1800–1849",
    "authorAliases": ["France Prešerin"], "country": "Slovenia", "language": "Slovenian", "lang": "sl",
    "direction": "ltr", "year": 1914, "yearLabel": "1914 printing · not necessarily composition date",
    "era": "19th century", "form": "Verse", "collection": "Dóktorja Francéta Prešérna poezije · 1914",
    "themes": [], "mood": "paper",
    "rights": (
        "The 1914 printing is public domain in the United States; Prešeren died in 1849 and editor "
        "Luka Pintar in 1915. Copyright, edition-related and moral rights vary by jurisdiction; check local law. "
        "The scan is linked, not republished. No translation or recording is included."
    ),
}
WORKS = [
    {
        "key": "preseren-kam", "title": "Kam?", "blocks": [2] * 6,
        "sourceTitle": "Dóktorja Francéta Prešérna poezije · third impression, 1914, p. 7 / PDF p. 18",
        "source": SCAN + "n17/mode/1up",
        "contextSourceTitle": "Osnovna šola Metlika · France Prešeren",
        "contextSource": "https://www.osmetlika.si/files/2021/02/FRANCE-PRE%C5%A0EREN-%C5%BEivljenje-in-delo.pdf",
        "searchAliases": ["Kam", "Where"],
        "context": (
            "The complete 1914 reading has six couplets on p. 7, between Prošnja and Ukazi. "
            "The printed title is Kám?; this reading retains Prijatli, raj’ / raji and sèmtertjè. "
            "A Slovenian school selection names the individual poem among Prešeren's known works. "
            "Title accent, apostrophe typography, spacing and indentation are normalized; "
            "Slovenia is an associated place, not a composition-location claim."
        ),
    },
    {
        "key": "preseren-slovo-od-mladosti", "title": "Slovo od mladosti", "blocks": [8] * 5,
        "sourceTitle": "Dóktorja Francéta Prešérna poezije · third impression, 1914, pp. 87–89 / PDF pp. 98–100",
        "source": SCAN + "n97/mode/1up",
        "contextSourceTitle": "Encyclopaedia Britannica · France Prešeren",
        "contextSource": "https://www.britannica.com/biography/France-Preseren",
        "searchAliases": ["Farewell to Youth"],
        "context": (
            "The complete 1914 reading has five eight-line stanzas on pp. 87–89; the second and fifth "
            "cross page turns and Glosa follows. The printing retains solnce, d’janje, zanič’vati, "
            "golj’fijami and ’Zučé. Britannica discusses this individual poem among Prešeren's important works. "
            "Title accent, apostrophe typography, spacing and indentation are normalized; "
            "Slovenia is an associated place, not a composition-location claim."
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
        record.update({"id": "recognized-slovenian-classics-" + work["key"], "text": text, "translations": []})
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

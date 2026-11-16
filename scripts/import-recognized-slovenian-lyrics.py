#!/usr/bin/env python3
"""Reproduce seven Prešeren lyrics from a specified 1914 printing."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-slovenian-lyrics-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-slovenian-lyrics.json"
READINGS_SHA256 = "20507610a577accb5e9234d613c355630c205f7373d15b9e16a2e96d0ea7ab2c"

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
    "themes": [], "mood": "paper", "translations": [],
    "rights": (
        "The 1914 printing is public domain in the United States; Prešeren died in 1849 and editor "
        "Luka Pintar in 1915. Copyright, edition-related and moral rights vary by jurisdiction; check local law. "
        "The scan is linked, not republished. No translation or recording is included."
    ),
    "contextSourceTitle": "Gorenjski muzej · Dr. France Prešeren exhibition",
    "contextSource": "https://www.meer.com/en/42760-dr-france-preseren",
}
DISCLOSURE = (
    " The Gorenjski Museum exhibition names this among Prešeren's well-known poems. "
    "Title accent, apostrophe typography, spacing and indentation are normalized; "
    "Slovenia is an associated place, not a composition-location claim."
)
WORKS = [
    {
        "key": "pod-oknom", "title": "Pod oknom", "blocks": [6] * 7,
        "sourceTitle": "Dóktorja Francéta Prešérna poezije · 1914 · pp. 3–5 / PDF pp. 14–16",
        "source": SCAN + "n13/mode/1up",
        "searchAliases": ["Pod oknam", "Luna sije", "Below the window"],
        "context": (
            "The separately headed 1914 reading has seven six-line stanzas on pp. 3–5, before Prošnja. "
            "Its printed title is Pod ôknom; the text retains 'Kladvo', 'nevsmiljena' and 'po sili'."
            + DISCLOSURE
        ),
    },
    {
        "key": "prosnja", "title": "Prošnja", "blocks": [4] * 9,
        "sourceTitle": "Dóktorja Francéta Prešérna poezije · 1914 · pp. 5–7 / PDF pp. 16–18",
        "source": SCAN + "n15/mode/1up",
        "searchAliases": ["Prosnja", "The Plea"],
        "context": (
            "The 1914 reading has nine quatrains on pp. 5–7, between Pod oknom and Kam?. "
            "The printed title is Prôšnja; 'repetnic' and 'solnca' are retained."
            + DISCLOSURE
        ),
    },
    {
        "key": "ukazi", "title": "Ukazi", "blocks": [4] * 6,
        "sourceTitle": "Dóktorja Francéta Prešérna poezije · 1914 · pp. 8–9 / PDF pp. 19–20",
        "source": SCAN + "n18/mode/1up",
        "searchAliases": ["Orders"],
        "context": (
            "The 1914 reading has six quatrains on pp. 8–9, after Kam? and before K slovesu. "
            "The final stanza appears on p. 9; the repeated lines and 'vstvari' are retained."
            + DISCLOSURE
        ),
    },
    {
        "key": "k-slovesu", "title": "K slovesu", "blocks": [4] * 6,
        "sourceTitle": "Dóktorja Francéta Prešérna poezije · 1914 · pp. 9–10 / PDF pp. 20–21",
        "source": SCAN + "n19/mode/1up",
        "searchAliases": ["Bog te obar", "Saying Goodbye"],
        "context": (
            "The separately headed 1914 reading has six quatrains on pp. 9–10, before Sila spomina. "
            "Slovenska biografija identifies the earlier title Bog te obar’; it is not a separate work. "
            "This printing retains 'Žàl-besede' and 'Dòkler'."
            + DISCLOSURE
        ),
    },
    {
        "key": "sila-spomina", "title": "Sila spomina", "blocks": [4] * 7,
        "sourceTitle": "Dóktorja Francéta Prešérna poezije · 1914 · pp. 10–11 / PDF pp. 21–22",
        "source": SCAN + "n20/mode/1up",
        "searchAliases": ["The Power of Memory"],
        "context": (
            "The 1914 reading has seven quatrains on pp. 10–11, before Izgubljena vera. "
            "Its second stanza reads 'tvôje srce me pogreša'; a different online reading has "
            "'tvoje oko me pogreša'. The readings are not combined."
            + DISCLOSURE
        ),
    },
    {
        "key": "izgubljena-vera", "title": "Izgubljena vera", "blocks": [2] * 11,
        "sourceTitle": "Dóktorja Francéta Prešérna poezije · 1914 · pp. 11–12 / PDF pp. 22–23",
        "source": SCAN + "n21/mode/1up",
        "searchAliases": ["Zgubljena vera", "Lost Faith"],
        "context": (
            "The 1914 printing titles this eleven-couplet poem Izgubljêna vera; Zgubljena vera is "
            "another title for the same work. Its final 'oltár', 'bogstvo' and 'stvár' are letter-spaced "
            "in the printing and rendered without that emphasis here."
            + DISCLOSURE
        ),
    },
    {
        "key": "mornar", "title": "Mornar", "blocks": [6] * 7,
        "sourceTitle": "Dóktorja Francéta Prešérna poezije · 1914 · pp. 13–14 / PDF pp. 24–25",
        "source": SCAN + "n23/mode/1up",
        "searchAliases": ["The Sailor", "Nezvesta bodi zdrava"],
        "context": (
            "The 1914 reading has seven six-line stanzas on pp. 13–14; the fourth crosses the page turn. "
            "The printing retains 'poročêno', '’zročimo' and the opening's return in the last stanza."
            + DISCLOSURE
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
        record.update({"id": "recognized-slovenian-lyrics-preseren-" + work["key"], "text": text})
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

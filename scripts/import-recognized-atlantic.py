#!/usr/bin/env python3
"""Reproduce two complete, individually documented historical readings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-atlantic-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-atlantic.json"
READINGS_SHA256 = "2f13dcf464d243f5781442d25680b9da1a5cd2ad705a6ec28efb3a19bca7ffa6"

# These identify the consulted scans, not the accuracy of the transcriptions.
EVIDENCE = {
    "rimbaud-1895-archive.pdf": "7263a4a93ecf8d1c42be3375c93c85c48835cf73b1d272b30d45731be9d75259",
    "mistral-desolacion-1922-research.djvu": "50e8e3e0ac1bd6f895c9110e33a21b67e94240a7100ddc674e975e72b6999fef",
}

WORKS = [
    {
        "key": "rimbaud-bateau-ivre", "title": "Bateau ivre", "displayTitle": "Le Bateau ivre",
        "displayTitleLang": "fr", "author": "Arthur Rimbaud", "authorId": "arthur-rimbaud",
        "authorYears": "1854–1891", "country": "France", "language": "French", "lang": "fr",
        "year": 1895, "yearLabel": "1895 printing · first published in 1883", "era": "19th century",
        "form": "Verse", "collection": "Poésies complètes · 1895", "lines": 100,
        "sourceTitle": "Poésies complètes · 1895, pp. 17–22",
        "source": "https://archive.org/details/bub_gb_EZA7AQAAMAAJ/page/n37/mode/1up",
        "reception": "https://www.britannica.com/topic/The-Drunken-Boat",
        "detail": (
            "This complete 25-quatrain reading follows the University of Michigan copy of the Vanier "
            "volume whose publisher's wrapper is dated 1895; its exact impression is not established. "
            "The printed heading is 'Bateau ivre'; the familiar title 'Le Bateau ivre' aids discovery. "
            "This copy prints 'vos lyres', 'Sons songer' and 'Planche folle'; a separate Gallica-based "
            "Wikisource witness has 'nos lyres', 'Sans songer' and 'Plante folle'. These potentially "
            "erroneous readings are retained, not silently corrected. The printings are one work."
        ),
        "rights": (
            "The 1895 French printing is public domain in the United States; copyright and moral rights "
            "vary by jurisdiction, so check local law. The scan is linked, not republished. The verse "
            "was transcribed from the historical pages with OCR assistance; spacing and typography are "
            "normalized. No modern translation, notes or recording is included."
        ),
    },
    {
        "key": "mistral-sonetos", "title": "Los sonetos de la muerte", "author": "Gabriela Mistral",
        "authorId": "gabriela-mistral", "authorYears": "1889–1957", "country": "Chile",
        "language": "Spanish", "lang": "es", "year": 1922,
        "yearLabel": "1922 printing · not necessarily composition date", "era": "20th century",
        "form": "Verse", "collection": "Desolación · 1922", "lines": 45,
        "sourceTitle": "Desolación · New York, 1922, pp. 118–120",
        "source": "https://commons.wikimedia.org/wiki/File:Desolaci%C3%B3n_(colecci%C3%B3n_de_Mistral,_1922).djvu?page=140",
        "reception": "https://www.poetryfoundation.org/poets/gabriela-mistral",
        "detail": (
            "The complete numbered three-sonnet cycle occupies printed pages 118–120 of the first "
            "New York book printing. Its three parts are presented and counted together, not as three "
            "additional works; the displayed line count includes the three Roman numeral headings. "
            "The linked Poetry Foundation biography discusses the cycle's 1914 prize and reception."
        ),
        "rights": (
            "The 1922 U.S. printing is public domain in the United States; copyright and moral rights "
            "vary by jurisdiction, so check local law, including in Chile. The scan is linked, not "
            "republished. This reading adapts Spanish Wikisource contributors under CC BY-SA 4.0 "
            "(https://creativecommons.org/licenses/by-sa/4.0/) and was checked against the scan. "
            "Pinned page revisions: https://es.wikisource.org/w/index.php?title=Página:Desolación_(colección_de_Mistral,_1922).djvu/140&oldid=1604047 ; "
            "https://es.wikisource.org/w/index.php?title=Página:Desolación_(colección_de_Mistral,_1922).djvu/141&oldid=1604046 ; "
            "https://es.wikisource.org/w/index.php?title=Página:Desolación_(colección_de_Mistral,_1922).djvu/142&oldid=1604045."
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
        if sum(bool(line.strip()) for line in text.splitlines()) != work["lines"]:
            raise ValueError(f"Unexpected reading length: {work['key']}")
        records.append({
            "id": "recognized-atlantic-" + work["key"], "title": work["title"],
            **{key: work[key] for key in ("displayTitle", "displayTitleLang") if key in work},
            "author": work["author"], "authorId": work["authorId"], "authorYears": work["authorYears"],
            "country": work["country"], "language": work["language"], "lang": work["lang"],
            "direction": "ltr", "year": work["year"], "yearLabel": work["yearLabel"], "era": work["era"],
            "form": work["form"], "collection": work["collection"], "themes": [], "mood": "paper",
            "context": work["detail"] + (
                " Spacing and indentation are normalized; the associated country is not a claim "
                "about the place of composition."
            ),
            "sourceTitle": work["sourceTitle"], "source": work["source"],
            "contextSourceTitle": "Individual reception and context", "contextSource": work["reception"],
            "rights": work["rights"], "text": text, "translations": [],
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

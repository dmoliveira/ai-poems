#!/usr/bin/env python3
"""Reproduce two German poems from identified historical printings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-german-women-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-german-women.json"
READINGS_SHA256 = "2394472ebd6e407218f84682595b10ea2725c2aa0629f809159ab7d07b3e44e3"

# Hashes identify consulted copies, not the accuracy of their transcription.
EVIDENCE = {
    "brun-gedichte-1795-leaf-018.jpg": "e4a393a801fbe683f49ec6788a99faef20655f940d6eb3be0c0641f4b8ce61ef",
    "brun-gedichte-1795-leaf-019.jpg": "762d3e0e91baf17dbbca264aa1528294a250205f0dec56de731be41c958d45bb",
    "brun-gedichte-1795-leaf-020.jpg": "981c22afaf441fafa5215425f0598627fb3520b98cec8373b76804e0086ef879",
    "guenderrode-melete-1906-research.pdf": "4a6187e9a339706ef2baf862d8f8be3530755592e9737ae80cafaf7ee75e023e",
}
COMMON = {
    "language": "German", "lang": "de", "direction": "ltr", "form": "Verse",
    "themes": [], "mood": "paper", "translations": [],
}
RIGHTS = (
    "This historical printing is public domain in the United States. {deaths} "
    "Copyright, edition-related and moral rights vary by jurisdiction; check local law. "
    "Scans are linked, not republished; no translation, score or recording is included."
)
WORKS = [
    {
        "key": "chamounix", "blocks": [4] * 5,
        "id": "recognized-german-women-brun-chamounix",
        "title": "Chamounix beym Sonnenaufgange", "author": "Friederike Brun",
        "authorId": "friederike-brun", "authorYears": "1765–1835",
        "authorAliases": ["Frederikke Brun", "Friederike Münter", "Friederike Muenther"],
        "country": "Denmark / Germany", "year": 1795,
        "yearLabel": "1795 printing · dated May 1791", "era": "18th century",
        "collection": "Gedichte · 1795",
        "sourceTitle": "Gedichte · 1795 · pp. 1–3 · scan-linked Wikisource",
        "source": "https://de.wikisource.org/wiki/Chamounix_beym_Sonnenaufgange",
        "contextSourceTitle": "The Coleridge Bulletin · poetic indebtedness",
        "contextSource": "https://friendsofcoleridge.com/wp-content/uploads/2025/03/CB31Hall.pdf",
        "searchAliases": ["Chamouny", "Chamonix", "Chamounix beim Sonnenaufgang"],
        "context": (
            "The 1795 printing dates this complete poem May 1791 and prints five quatrains. "
            "Its separately attributed Metastasio motto and three prose notes are not verse here. "
            "The scan has 'Euch' and a colon after 'hinab'; a modern transcription has 'euch' "
            "and a semicolon. One study describes 26 lines, but this printing has 20. "
            "Coleridge's later Hymn has been described as a recast of Brun's poem, not an "
            "additional work here. Denmark and Germany are associated places, not composition claims."
        ),
        "rights": RIGHTS.format(deaths="Brun died in 1835 and editor Friedrich Matthisson in 1831."),
    },
    {
        "key": "die-eine-klage", "blocks": [6] * 4,
        "id": "recognized-german-women-guenderrode-die-eine-klage",
        "title": "Die eine Klage", "author": "Karoline von Günderrode",
        "authorId": "karoline-von-guenderrode", "authorYears": "1780–1806",
        "authorAliases": [
            "Karoline von Günderode", "Caroline von Günderrode", "Caroline von Günderode",
            "Karoline von Guenderrode", "Karoline von Guenderode",
        ],
        "country": "Germany", "year": 1906,
        "yearLabel": "1906 printing · written by 1806", "era": "19th century",
        "collection": "Melete · 1906",
        "sourceTitle": "Melete · 1906 · pp. 15–16 · Internet Archive facsimile",
        "source": "https://archive.org/download/meletegun00gnuoft/meletegun00gnuoft.pdf#page=31",
        "contextSourceTitle": "University of Göttingen · Karoline von Günderrode",
        "contextSource": "https://www.uni-goettingen.de/en/710964.html",
        "searchAliases": ["Die eine Klage", "Wer die tiefste aller Wunden"],
        "context": (
            "This separately headed 24-line poem ends before 'Ägypten' in the 1906 Melete printing. "
            "Melete's planned 1806 publication was suppressed and its surviving larger contents "
            "are incomplete; this poem itself has four complete stanzas. Göttingen presents it "
            "individually while calling Melete a cycle. The 1906 reading has 'verlohren', "
            "'erkohren' and 'Giebt'; some modern texts regularize these spellings. "
            "Germany is an associated place, not a composition-location claim."
        ),
        "rights": RIGHTS.format(deaths="Günderrode died in 1806 and editor Leopold Hirschberg in 1929."),
    },
]
NORMALIZATION = " Historical spelling is retained; typeface, indentation and punctuation typography are normalized."


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
        record["context"] += NORMALIZATION
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

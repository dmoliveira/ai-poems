#!/usr/bin/env python3
"""Reproduce two scan-compared Cavafy readings from a 1927 periodical."""

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-greek-classics-2-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-greek-classics-2.json"
READINGS_SHA256 = "446b769ccbdbeeffa10185b56dca49aa7eeb067aca69f6e86a084ebd2f89a20a"

# Hashes identify consulted scans; they do not establish transcription accuracy.
EVIDENCE = {
    "cavafy-1927-01.jpg": "6719624feb0e46fca8d0a6b59100154302546b3ffa1251983a914a5fbb1d099a",
    "cavafy-1927-02.jpg": "2c6454181eed3e792015774d304c5943a7d5623cb21f892c5d47d7f79f2fed4c",
    "cavafy-1927-03.jpg": "5d9baf9cd54ed442f33746c13feb8d050b549d6f55886b8915d24a31a12c49a8",
    "cavafy-trojans-skokos-1908.pdf": "220820cf7f79e118e410c8ff7f503991b37ac23757a5e6195cc38d2b96edf9f7",
}


def commons(title):
    return "https://commons.wikimedia.org/wiki/File:" + quote(title.replace(" ", "_"))


def wiki(title, revision):
    return "https://el.wikisource.org/w/index.php?title=" + quote(title.replace(" ", "_")) + f"&oldid={revision}"


WORKS = [
    {
        "key": "trojans", "title": "Τρώες", "displayTitle": "Trojans", "page": 2, "revision": 149663,
        "blocks": [1, 4, 3, 1, 3, 3, 3, 4],
        "contextSourceTitle": "Lund University · study of Cavafy's Trojans",
        "contextSource": "https://lup.lub.lu.se/student-papers/record/4359487",
        "context": (
            "The entire 1927 printed reading has two numbered sections on page 2, counted as one work. "
            "It begins ‘Εἶν’ ἡ προσπάθειές μας σὰν τῶν Τρώων’. A 1908 printing also begins with the Trojan "
            "comparison in two numbered parts, though its wording differs; the modern edition quoted in "
            "the linked Lund study has an additional opening line. The reason for the difference is uncertain. "
            "The periodical appears to end the "
            "last line with a comma, retained here; a separately headed poem follows on page 3. The study "
            "discusses Trojans individually and calls it among Cavafy's better-known poems."
        ),
    },
    {
        "key": "first-step", "title": "Το πρώτο σκαλί", "displayTitle": "The First Step", "page": 3,
        "revision": 130131, "blocks": [26],
        "contextSourceTitle": "Greek digital schoolbook · Το πρώτο σκαλί",
        "contextSource": (
            "https://ebooks.edu.gr/ebooks/v/html/8547/2700/"
            "Keimena-Neoellinikis-Logotechnias_A-Lykeiou_html-empl/extras/texts/IndexD3_parallilokeimeno1.html"
        ),
        "context": (
            "The complete 26-line reading appears on page 3. This printing has ‘ἀναιβῶ’, ‘εἶν’ and ‘νᾶσαι’; "
            "the linked schoolbook selects the poem using a modern edition, not the 1927 transcription. "
            "The scan comparison corrects the pinned page transcription's ‘εἲν’ and ‘νἆσαι’."
        ),
    },
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build():
    if digest(READINGS) != READINGS_SHA256:
        raise ValueError("Reading snapshot changed")
    parts = [part.strip() for part in re.split(r"(?m)^## ", READINGS.read_text(encoding="utf-8")) if part.strip()]
    readings = {}
    for part in parts:
        key, text = part.split("\n", 1)
        if key in readings:
            raise ValueError(f"Duplicate reading: {key}")
        readings[key] = text.strip()
    if list(readings) != [work["key"] for work in WORKS]:
        raise ValueError("Unexpected reading selection or order")
    records = []
    for work in WORKS:
        text = readings[work["key"]]
        if [len(block.splitlines()) for block in text.split("\n\n")] != work["blocks"]:
            raise ValueError(f"Unexpected printed boundaries: {work['key']}")
        filename = f"Αλεξανδρινή Τέχνη Τομ.1 Αρ.2 - {work['page']:02d}.jpg"
        transcription = wiki(f"Σελίδα:{filename}", work["revision"])
        records.append({
            "id": f"recognized-greek-classics-2-cavafy-{work['key']}",
            "title": work["title"], "displayTitle": work["displayTitle"],
            "author": "C. P. Cavafy", "authorOriginal": "Κωνσταντίνος Π. Καβάφης",
            "authorId": "c-p-cavafy", "authorYears": "1863–1933", "country": "Egypt",
            "language": "Greek", "lang": "el", "direction": "ltr", "year": 1927,
            "yearLabel": "January 1927 printing · not necessarily composition date", "era": "20th century",
            "form": "Lyric", "collection": "Alexandriní Téchnē · 1927", "themes": [], "mood": "paper",
            "context": (
                f"{work['context']} The reading adapts the cited Greek Wikisource page transcription, "
                "compared with the periodical scan; spacing, indentation and some punctuation are normalized. "
                "The issue's first page prints January 1927, although Commons image metadata says December. "
                "Egypt is an associated place, not a composition-location claim."
            ),
            "sourceTitle": f"Alexandriní Téchnē · issue 2, page {work['page']} (January 1927)",
            "source": commons(filename), "contextSourceTitle": work["contextSourceTitle"],
            "contextSource": work["contextSource"],
            "rights": (
                "Greek original printed in 1927; public domain in the United States. The reading adapts the "
                f"Greek Wikisource page transcription by Ntetos and contributors, revision {work['revision']}, "
                "under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/): "
                f"{transcription}. Copyright and moral rights vary; check local law. "
                "The scan is linked, not republished; no translation or recording is included."
            ),
            "text": text, "translations": [],
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

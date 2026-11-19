#!/usr/bin/env python3
"""Reproduce five complete Edward Thomas poems from identified 1917 printings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/edward-thomas-1917-readings.txt"
OUTPUT = ROOT / "content/poems/edward-thomas-1917.json"
READINGS_SHA256 = "9826d6ef71767c5fce554ed58d12cb0fc7759d55bbc8cb40409cfce0db65510a"
# Identifies consulted copies, not textual accuracy or copyright status.
EVIDENCE = {
    "edward-thomas-poems-1917.pdf": "bda6554773c091e5f990fd7a841859b2a0a4c595aa4c7efd764ea07315e6bfbc",
    "annual-new-poetry-1917.pdf": "1c060cc1323887abc3f1fb4126ff15fea2c4b48926bd2fed0747b62f3e963d8a",
}
BOOK = "https://archive.org/download/poemsthomasedwar00thomrich/poemsthomasedwar00thomrich.pdf#page="
ANNUAL = "https://archive.org/download/annualofnewpoetr01londuoft/annualofnewpoetr01londuoft.pdf#page=61"
SAMPLER = "https://www.poetryfoundation.org/articles/101643/edward-thomas-selections"
COMMON = {
    "author": "Edward Thomas",
    "authorId": "edward-thomas",
    "authorYears": "1878–1917",
    "authorAliases": ["Philip Edward Thomas", "Edward Eastaway"],
    "country": "England",
    "language": "English",
    "lang": "en",
    "direction": "ltr",
    "year": 1917,
    "yearLabel": "1917 printing · not necessarily composition date",
    "era": "20th century",
    "form": "Verse",
    "themes": [],
    "mood": "paper",
    "translations": [],
    "contextSourceTitle": "Poetry Foundation · Edward Thomas selections",
    "contextSource": SAMPLER,
    "rights": (
        "This 1917 printing is public domain in the United States; Edward Thomas died in 1917. "
        "Editorial contributions and copyright, edition-related and moral rights can differ "
        "by jurisdiction; check local law. The scan is linked, not republished. "
        "Transcription error is possible; no translation, score or recording is included."
    ),
}
CONTEXT_END = (
    " Typeface, indentation and punctuation typography are normalized. "
    "England is an associated place, not an assertion of where the poem was written."
)
WORKS = [
    {
        "key": "the-owl", "blocks": [4, 4, 4, 4],
        "id": "edward-thomas-1917-the-owl", "title": "The Owl",
        "collection": "Poems · 1917", "sourceTitle": "Poems · 1917 · pp. 12–13 / PDF pp. 18–19",
        "source": BOOK + "18", "searchAliases": ["Downhill I came hungry", "Soldiers and poor unable to rejoice"],
        "context": (
            "This separately headed poem runs across pp. 12–13 and ends before Swedes. "
            "A stanza break is supplied at the page turn to follow its quatrain pattern; "
            "the page turn does not itself establish spacing. Poetry Foundation identifies "
            "The Owl as among Thomas's most read poems."
        ) + CONTEXT_END,
    },
    {
        "key": "in-memoriam", "blocks": [4],
        "id": "edward-thomas-1917-in-memoriam", "title": "In Memoriam (Easter, 1915)",
        "collection": "Poems · 1917", "sourceTitle": "Poems · 1917 · p. 26 / PDF p. 32",
        "source": BOOK + "32", "searchAliases": ["In Memoriam Easter 1915", "The flowers left thick at nightfall"],
        "context": (
            "The four-line poem is separately headed and complete on p. 26 before Fifty Faggots. "
            "The heading follows this 1917 printing: a scholar reports a manuscript dated 6.IV.15 "
            "and attributes the familiar title to later editorial naming, but who supplied the "
            "1917 heading and when are uncertain. Poetry Foundation describes this individual "
            "poem as well known."
        ) + CONTEXT_END,
    },
    {
        "key": "adlestrop", "blocks": [4, 4, 4, 4],
        "id": "edward-thomas-1917-adlestrop", "title": "Adlestrop",
        "collection": "Poems · 1917", "sourceTitle": "Poems · 1917 · pp. 40–41 / PDF pp. 46–47",
        "source": BOOK + "46", "searchAliases": ["Yes I remember Adlestrop", "Oxfordshire and Gloucestershire"],
        "context": (
            "This four-quatrain poem ends on p. 41 before The Green Roads. A stanza break is "
            "supplied at the page turn to follow the quatrain pattern. The 1917 book opens "
            "'Yes. I remember'; the 1920 reading cited by Representative Poetry Online "
            "instead begins 'Yes, I remember'. Poetry Foundation calls Adlestrop Thomas's "
            "most famous poem; this is not a global ranking."
        ) + CONTEXT_END,
    },
    {
        "key": "lights-out", "blocks": [6, 6, 6, 6, 6],
        "id": "edward-thomas-1917-lights-out", "title": "Lights Out",
        "collection": "Poems · 1917", "sourceTitle": "Poems · 1917 · pp. 59–60 / PDF pp. 65–66",
        "source": BOOK + "65", "searchAliases": ["I have come to the borders of sleep", "I must enter and leave alone"],
        "context": (
            "The separately headed poem occupies pp. 59–60 in five six-line stanzas. A break "
            "is supplied at the page turn to follow that pattern. The 1917 printing has no "
            "comma after 'travellers' or within 'I must enter and leave alone'; other editions "
            "differ. Poetry Foundation individually discusses the poem in its selection."
        ) + CONTEXT_END,
    },
    {
        "key": "aspens", "blocks": [4, 4, 4, 4, 4, 4],
        "id": "edward-thomas-1917-aspens", "title": "Aspens",
        "collection": "An Annual of New Poetry · 1917",
        "sourceTitle": "An Annual of New Poetry · 1917 · p. 49 / PDF p. 61",
        "source": ANNUAL, "searchAliases": ["All day and night save winter", "The aspens at the crossroads talk together"],
        "context": (
            "This separately titled six-quatrain poem is printed under Thomas's pseudonym "
            "Edward Eastaway in the 1917 annual. Thomas saw proofs, although that does not "
            "prove he approved every printed mark. The reading has 'every other sound'; "
            "some modern transcriptions differ. Poetry Foundation individually discusses "
            "Aspens in its selection."
        ) + CONTEXT_END,
    },
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build():
    if digest(READINGS) != READINGS_SHA256:
        raise ValueError("Reading snapshot changed")
    sections = [section for section in re.split(r"(?m)^## ", READINGS.read_text(encoding="utf-8")) if section.strip()]
    readings = {}
    for section in sections:
        key, text = section.split("\n", 1)
        if key in readings:
            raise ValueError(f"Duplicate reading: {key}")
        readings[key] = text.strip("\n")
    if list(readings) != [work["key"] for work in WORKS]:
        raise ValueError("Unexpected reading selection or order")
    records = []
    for work in WORKS:
        text = readings[work["key"]]
        if [len(stanza.splitlines()) for stanza in text.split("\n\n")] != work["blocks"]:
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

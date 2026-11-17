#!/usr/bin/env python3
"""Reproduce seven complete Housman poems from the 1914 Riccardi printing."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/housman-riccardi-1914-readings.txt"
OUTPUT = ROOT / "content/poems/housman-riccardi-1914.json"
READINGS_SHA256 = "244266dfea226a6a170cb0e24c01da3df7fbfc477204c9e03769ea9d537f02f8"
# The witness hash identifies the consulted copy, not transcription accuracy.
EVIDENCE = {
    "housman-shropshire-riccardi-1914-research.pdf":
        "333a20168299e570a766e4af563ca5c0231b9e61bcd3de7fab7fecaf3a062546"
}
SOURCE = "https://archive.org/download/shropshirelad00housrich/shropshirelad00housrich.pdf#page="
COMMON = {
    "author": "A. E. Housman",
    "authorId": "a-e-housman",
    "authorYears": "1859–1936",
    "authorAliases": ["Alfred Edward Housman", "A E Housman"],
    "country": "England",
    "language": "English",
    "lang": "en",
    "direction": "ltr",
    "year": 1914,
    "yearLabel": "1914 printing · collection first published 1896",
    "era": "19th century",
    "form": "Verse",
    "collection": "A Shropshire Lad · 1914 Riccardi Press",
    "themes": [],
    "mood": "paper",
    "translations": [],
    "rights": (
        "This 1914 historical printing is public domain in the United States; Housman died in 1936. "
        "Copyright, edition-related and moral rights vary by jurisdiction; check local law. "
        "The scan is linked, not republished; no translation, score or recording is included."
    ),
}
CONTEXT_END = (
    " Typeface, indentation and punctuation typography are normalized. "
    "England is an associated place, not a claim about where the poem was written."
)
WORKS = [
    {
        "key": "ii-loveliest", "blocks": [4, 4, 4],
        "id": "recognized-housman-1914-loveliest",
        "title": "Loveliest of trees, the cherry now",
        "sourceTitle": "A Shropshire Lad · 1914 · II · p. 2 / PDF p. 18",
        "source": SOURCE + "18",
        "contextSourceTitle": "Poetry Foundation · Housman and the cherry lyric",
        "contextSource": "https://www.poetryfoundation.org/poets/a-e-housman",
        "searchAliases": ["Loveliest of trees", "A Shropshire Lad II", "cherry hung with snow"],
        "context": (
            "The 1914 Riccardi printing gives this complete lyric as number II without a title; "
            "the opening line is used here. Poetry Foundation describes the individual cherry "
            "lyric as famous, not as a global ranking."
        ) + CONTEXT_END,
    },
    {
        "key": "xiii-one-and-twenty", "blocks": [8, 8],
        "id": "recognized-housman-1914-one-and-twenty",
        "title": "When I was one-and-twenty",
        "sourceTitle": "A Shropshire Lad · 1914 · XIII · p. 11 / PDF p. 27",
        "source": SOURCE + "27",
        "contextSourceTitle": "Britannica · A Shropshire Lad",
        "contextSource": "https://www.britannica.com/topic/A-Shropshire-Lad",
        "searchAliases": ["When I was one and twenty", "A Shropshire Lad XIII", "I heard a wise man say"],
        "context": (
            "The 1914 printing gives this untitled number XIII in two eight-line stanzas; "
            "the opening line is used as its title. Some secondary accounts describe three "
            "stanzas. Britannica names the individual poem among the collection's familiar works."
        ) + CONTEXT_END,
    },
    {
        "key": "xix-athlete", "blocks": [4, 4, 4, 4, 4, 4, 4],
        "id": "recognized-housman-1914-athlete",
        "title": "To an Athlete Dying Young",
        "sourceTitle": "A Shropshire Lad · 1914 · XIX · p. 14 / PDF p. 30",
        "source": SOURCE + "30",
        "contextSourceTitle": "Housman Society · textual comparison",
        "contextSource": "https://www.housman-society.co.uk/to-an-athlete-dying-young/",
        "searchAliases": ["The time you won your town the race", "A Shropshire Lad XIX"],
        "context": (
            "The 1914 printing separately titles this seven-stanza poem. It reads 'its echoes' "
            "and has no comma after 'dead'; the Housman Society transcription reads 'the echoes' "
            "and includes a comma there. Britannica names the individual poem among the "
            "collection's familiar works."
        ) + CONTEXT_END,
    },
    {
        "key": "xxi-bredon-hill", "blocks": [5, 5, 5, 5, 5, 5, 5],
        "id": "recognized-housman-1914-bredon-hill",
        "title": "Bredon Hill",
        "sourceTitle": "A Shropshire Lad · 1914 · XXI · pp. 15–16 / PDF pp. 31–32",
        "source": SOURCE + "31",
        "contextSourceTitle": "American Literature · Housman profile",
        "contextSource": "https://americanliterature.com/author/a-e-housman",
        "searchAliases": ["In summertime on Bredon", "Breedon Hill", "A Shropshire Lad XXI"],
        "context": (
            "The 1914 printing titles this complete seven-stanza poem and notes separately "
            "that Bredon is pronounced 'Breedon'; the footnote is not a verse line. American "
            "Literature names the individual poem among Housman's notable works."
        ) + CONTEXT_END,
    },
    {
        "key": "xxxi-wenlock", "blocks": [4, 4, 4, 4, 4],
        "id": "recognized-housman-1914-wenlock",
        "title": "On Wenlock Edge the wood’s in trouble",
        "sourceTitle": "A Shropshire Lad · 1914 · XXXI · pp. 23–24 / PDF pp. 39–40",
        "source": SOURCE + "39",
        "contextSourceTitle": "Interesting Literature · On Wenlock Edge",
        "contextSource": "https://interestingliterature.com/2018/05/a-short-analysis-of-a-e-housmans-on-wenlock-edge-the-woods-in-trouble/",
        "searchAliases": ["On Wenlock Edge", "A Shropshire Lad XXXI", "His forest fleece the Wrekin heaves"],
        "context": (
            "The 1914 printing gives this complete untitled lyric as number XXXI, with its "
            "last quatrain on the next page; the opening line is used as the title. A literary "
            "analysis identifies the individual poem as one of Housman's famous lyrics."
        ) + CONTEXT_END,
    },
    {
        "key": "xl-blue-hills", "blocks": [4, 4],
        "id": "recognized-housman-1914-blue-hills",
        "title": "Into my heart an air that kills",
        "sourceTitle": "A Shropshire Lad · 1914 · XL · p. 29 / PDF p. 45",
        "source": SOURCE + "45",
        "contextSourceTitle": "Boydell & Brewer · Housman's legacy",
        "contextSource": "https://boydellandbrewer.com/blog/world-literature/a-e-housmans-legacy/",
        "searchAliases": ["blue remembered hills", "land of lost content", "A Shropshire Lad XL"],
        "context": (
            "The 1914 printing gives this complete untitled lyric as number XL; its opening "
            "line is used as the title. A Boydell & Brewer article identifies this individual "
            "poem with some of Housman's most loved and quoted lines."
        ) + CONTEXT_END,
    },
    {
        "key": "liv-rue", "blocks": [4, 4],
        "id": "recognized-housman-1914-rue",
        "title": "With rue my heart is laden",
        "sourceTitle": "A Shropshire Lad · 1914 · LIV · p. 42 / PDF p. 58",
        "source": SOURCE + "58",
        "contextSourceTitle": "Britannica · A Shropshire Lad",
        "contextSource": "https://www.britannica.com/topic/A-Shropshire-Lad",
        "searchAliases": ["golden friends I had", "lightfoot boys are laid", "A Shropshire Lad LIV"],
        "context": (
            "The 1914 printing gives this complete untitled two-quatrain lyric as number LIV; "
            "the opening line is used as its title. Britannica names the individual poem among "
            "the collection's familiar works."
        ) + CONTEXT_END,
    },
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build():
    if digest(READINGS) != READINGS_SHA256:
        raise ValueError("Reading snapshot changed")
    sections = [block.strip() for block in re.split(r"(?m)^## ", READINGS.read_text(encoding="utf-8")) if block.strip()]
    readings = {}
    for section in sections:
        key, text = section.split("\n", 1)
        if key in readings:
            raise ValueError(f"Duplicate reading: {key}")
        readings[key] = text.strip()
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
              ("; witness hash matches." if args.evidence_dir else "."))


if __name__ == "__main__":
    main()

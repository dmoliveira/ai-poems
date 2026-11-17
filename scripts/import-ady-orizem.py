#!/usr/bin/env python3
"""Reproduce Ady's complete Őrizem a szemed from the 1918 printing."""

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READING = ROOT / "scripts/sources/ady-orizem-1918.txt"
OUTPUT = ROOT / "content/poems/ady-orizem.json"
READING_SHA256 = "3d392ed117dc7f755f9166446e0b375f011041466bdf21c48158fed1a28bc5dd"
# The witness hash identifies the consulted copy, not transcription accuracy.
EVIDENCE = {
    "ady-halottak-elen-1918.pdf": "524b8da5da07105da5638f5700925a6a990f1123896bb1b1bef807e1a4895a08"
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build():
    if digest(READING) != READING_SHA256:
        raise ValueError("Reading snapshot changed")
    text = READING.read_text(encoding="utf-8").strip()
    if [len(stanza.splitlines()) for stanza in text.split("\n\n")] != [4, 4, 4, 4]:
        raise ValueError("Unexpected reading boundaries")
    return [{
        "id": "recognized-ady-1918-orizem",
        "title": "Őrizem a szemed",
        "author": "Endre Ady",
        "authorId": "endre-ady",
        "authorYears": "1877–1919",
        "authorAliases": ["Ady Endre"],
        "country": "Hungary",
        "language": "Hungarian",
        "lang": "hu",
        "direction": "ltr",
        "year": 1918,
        "yearLabel": "1918 printing · separately published 1916",
        "era": "20th century",
        "form": "Verse",
        "collection": "A halottak élén · 1918",
        "sourceTitle": "A halottak élén · 1918 · p. 193 / PDF p. 199",
        "source": "https://archive.org/download/halottakln00adyeuoft/halottakln00adyeuoft.pdf#page=199",
        "contextSourceTitle": "OSZK · Nyugat · 1916, no. 2 transcription",
        "contextSource": "https://epa.oszk.hu/00000/00022/00190/05976.htm",
        "searchAliases": ["Már vénülő kezemmel", "Orizem a szemed"],
        "context": (
            "The 1918 scan prints this complete poem in four quatrains, repeating the first as "
            "the third. The National Library's online transcription of its separately headed "
            "1916 Nyugat appearance agrees in wording, punctuation and stanza breaks; that "
            "online transcription is not a facsimile. Lajos Hatvany and the poet's brother "
            "Lajos Ady helped prepare the 1918 volume; specific edits to this poem are not "
            "attributed to either. The Petőfi Literary "
            "Museum names the individual poem among Ady's periodical works. Hungary is an "
            "associated place, not a claim about where it was written."
        ),
        "rights": (
            "The 1918 printing of this poem is public domain in the United States; Ady died "
            "in 1919. Hatvany died in 1961 and Lajos Ady in 1940. Copyright, "
            "edition-related and moral rights vary by jurisdiction; check local law. The scan "
            "is linked, not republished; no translation, score or recording is included."
        ),
        "themes": [],
        "mood": "paper",
        "translations": [],
        "text": text,
    }]


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
        print("Wrote one historical reading.")
    else:
        if json.loads(OUTPUT.read_text(encoding="utf-8")) != records:
            raise ValueError("Catalogue differs from the reviewed reading")
        print("Verified one historical reading" + ("; witness hash matches." if args.evidence_dir else "."))


if __name__ == "__main__":
    main()

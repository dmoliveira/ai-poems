#!/usr/bin/env python3
"""Reproduce four Danish poems from identified historical printings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-danish-classics-2-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-danish-poems.json"
READINGS_SHA256 = "f4ac38d3e7bebc16d48d4520b28e517a8be89d2a355de1e09b85d281f50cb9fc"

# Hashes identify the consulted copies; they do not prove transcription accuracy.
EVIDENCE = {
    "oehlenschlaeger-1803-page-075.jpg": "bd5e7eaa754f77869cef81acbd7994695f59cc9692baab0f5cb65ec34d83dbea",
    "oehlenschlaeger-1803-page-076.jpg": "48285dcfad3957db57e6da873e4761d5f7aafae0f7e8543981e1ee32eefd88e1",
    "oehlenschlaeger-1803-page-077.jpg": "7eb4d71a14b775a9d3e7254cb6f81b5637f5ec07e4c4624e278785eb8fc70177",
    "oehlenschlaeger-1803-page-078.jpg": "6e0a821af9aa51f47ba0403b62c21a2ae2022d16692923f58e360cf184a1d08b",
    "oehlenschlaeger-1803-page-079.jpg": "f6e87c88185f1dd92a52da3281bef7a389f03e1256672942528004f5ed729b86",
    "oehlenschlaeger-1803-page-080.jpg": "636b572b76d826064fd552b4c2a2796c3a517235995e4adfbef8683a7295643f",
    "oehlenschlaeger-1803-page-081.jpg": "6a30011c5c02589f96537edc0658ca6b083c2e746abf7e47c4ba30958133a299",
    "oehlenschlaeger-1803-page-082.jpg": "1dc195ac07d6631d8374b5149b0dc1d49ad80f8c93a01452b7ae08fcb78f26af",
    "aakjaer-rugens-sange-1906-leaf-125.jpg": "588e71463c99daf3d079a612e46f1716679dd1f82dfda37b2a26b7d97ec936e4",
    "aakjaer-rugens-sange-1906-leaf-126.jpg": "893ba280418b4d5d1ab9c335cbae28a78ba36a74f7c22a291c270a6dbbdf7430",
    "aakjaer-rugens-sange-1906-leaf-127.jpg": "3b67b070f76401f0e55230f1e1b7ff7dece368a1c709370db6406b931966f17b",
    "aakjaer-vejr-1916-leaf-143.jpg": "e07045ca143ecf7590781a8ae102f9b25df3ad4bfddd0d3e7bb56a8e076e7768",
    "aakjaer-vejr-1916-leaf-144.jpg": "0e0e37d31549583f9d783c14328206fa6e6ff355a38df2c98f3c01d3e5958b40",
    "aakjaer-vejr-1916-leaf-145.jpg": "c5d3190baaa02afa3e4fab864c9cc0d82ef1131da49c837756f414c833790b87",
    "aakjaer-vejr-1916-leaf-146.jpg": "0cbf06eb5001dd1c3fa84816b7c7ecd9fe8523b7e02e6a1dbca216379fe5fda7",
    "borup-dansk-sangbog-1914-kb.pdf": "fc10b3d01f47b4948c71fd82ac9c2f9834e36296faf23b3b93f9a0d12b7599e0",
}
COMMON = {
    "country": "Denmark", "language": "Danish", "lang": "da", "direction": "ltr",
    "form": "Verse", "themes": [], "mood": "paper", "translations": [],
}
RIGHTS = (
    "This historical printing is public domain in the United States. {deaths} "
    "Copyright, edition-related and moral rights vary by jurisdiction; check local law. "
    "Scans are linked, not republished; no translation, score or recording is included."
)
WORKS = [
    {
        "key": "guldhornene", "id": "recognized-danish-poems-oehlenschlaeger-guldhornene",
        "blocks": [8, 12, 10, 15, 8, 24, 4, 8, 1, 9, 26, 8, 4, 7, 2, 4, 4, 4, 4, 4],
        "title": "Guldhornene", "author": "Adam Oehlenschläger",
        "authorId": "adam-oehlenschlaeger", "authorYears": "1779–1850",
        "authorAliases": ["Adam Oehlenschlaeger", "Adam Oehlenschlager"],
        "year": 1803, "yearLabel": "1803 imprint · publication also dated 1802", "era": "19th century",
        "collection": "Digte · 1803 imprint",
        "sourceTitle": "Digte · 1803 imprint · pp. 75–82 · Kalliope facsimile",
        "source": "https://kalliope.org/da/text/guldhornene",
        "contextSourceTitle": "Danmarkshistorien · Guldhornene",
        "contextSource": "https://danmarkshistorien.lex.dk/Adam_Oehlenschl%C3%A4ger_%E2%80%9CGuldhornene%E2%80%9D,_1802",
        "searchAliases": ["De higer og søger", "De higer og soger"],
        "context": (
            "The 1803-imprint book prints this complete 166-line poem on pp. 75–82. "
            "Danmarkshistorien calls it a key work of Danish Romanticism; its biography dates the "
            "book's appearance to December 1802, while its poem article gives 1803. The scan has "
            "no closing quotation mark after 'giv et Glimt tilbage!', no comma after 'Fædre', and "
            "a period after 'hædre'; some electronic readings differ. Page-turn paragraph breaks "
            "are editorial where the scan cannot establish spacing."
        ),
        "rights": RIGHTS.format(deaths="Oehlenschläger died in 1850."),
    },
    {
        "key": "jens-vejmand", "id": "recognized-danish-poems-aakjaer-jens-vejmand",
        "blocks": [8] * 6, "title": "Jens Vejmand", "author": "Jeppe Aakjær",
        "authorId": "jeppe-aakjaer", "authorYears": "1866–1930",
        "authorAliases": ["Jeppe Aakjaer", "Jeppe Aakjær"],
        "year": 1906, "yearLabel": "1906 printing · first published 1905", "era": "20th century",
        "collection": "Rugens Sange · 1906",
        "sourceTitle": "Rugens Sange · 1906 · pp. 120–122 · Kalliope facsimile",
        "source": "https://kalliope.org/da/text/jens-vejmand",
        "contextSourceTitle": "Højskolesangbogen · Jens Vejmand",
        "contextSource": "https://hojskolesangbogen.dk/om-sangbogen/historier-om-sangene/j-l/jens-vejmand",
        "searchAliases": ["Hvem sidder der bag skærmen", "Hvem sidder der bag skaermen"],
        "context": (
            "This complete six-stanza poem was first printed in Politiken in 1905, according to "
            "Højskolesangbogen; the reading follows the separately headed 1906 book printing. "
            "It has 'dér' in the first line, no comma after 'det var saamænd Jens Vejmand', and "
            "ends 'en', unlike some electronic readings. The 1907 musical setting is not a separate work."
        ),
        "rights": RIGHTS.format(deaths="Aakjær died in 1930."),
    },
    {
        "key": "havren", "id": "recognized-danish-poems-aakjaer-havren",
        "blocks": [4] * 12, "title": "Havren", "author": "Jeppe Aakjær",
        "authorId": "jeppe-aakjaer", "authorYears": "1866–1930",
        "authorAliases": ["Jeppe Aakjaer", "Jeppe Aakjær"],
        "year": 1916, "yearLabel": "1916 printing", "era": "20th century",
        "collection": "Vejr og Vind og Folkesind · 1916",
        "sourceTitle": "Vejr og Vind og Folkesind · 1916 · pp. 136–139 · Kalliope facsimile",
        "source": "https://kalliope.org/da/text/havren",
        "contextSourceTitle": "Højskolesangbogen · Jeg er havren",
        "contextSource": "https://hojskolesangbogen.dk/om-sangbogen/historier-om-sangene/j-l/jeg-er-havren-jeg-har-bjaelder-paa",
        "searchAliases": ["Jeg er havren", "Jeg er lærkesangen på et strå"],
        "context": (
            "The 1916 book prints twelve quatrains under a separate title, followed by the date "
            "8 May 1916. Højskolesangbogen discusses its popular reception but uses only eight "
            "stanzas. The scan reads 'Bøgetrær', 'gi' without an apostrophe, and a colon after "
            "'forstaa'; the electronic comparison differs. The musical setting is not a separate work."
        ),
        "rights": RIGHTS.format(deaths="Aakjær died in 1930."),
    },
    {
        "key": "bornenes-julesang", "id": "recognized-danish-poems-ingemann-boernenes-julesang",
        "blocks": [8] * 3, "title": "Børnenes Julesang", "author": "Bernhard Severin Ingemann",
        "authorId": "bernhard-severin-ingemann", "authorYears": "1789–1862",
        "authorAliases": ["B. S. Ingemann", "B.S. Ingemann", "Bernhard Severin Ingemann"],
        "year": 1914, "yearLabel": "1914 printing · first published 1840", "era": "19th century",
        "collection": "Dansk Sangbog · 1914",
        "sourceTitle": "Dansk Sangbog · 1914 · pp. 318–319 / PDF pp. 343–344",
        "source": "https://www.kb.dk/e-mat/dod/115308028746-bw.pdf#page=343",
        "contextSourceTitle": "Højskolesangbogen · Julen har bragt velsignet bud",
        "contextSource": "https://hojskolesangbogen.dk/om-sangbogen/historier-om-sangene/j-l/julen-har-bragt-velsignet-bud",
        "searchAliases": ["Julen har bragt velsignet bud", "Bornenes Julesang"],
        "context": (
            "Borup's 1914 songbook prints the complete 24-line text in three eight-line stanzas. "
            "Højskolesangbogen explains that the original six quatrains were first published in 1840 "
            "and later regrouped for music; these are one poem, not multiple works. This Christmas "
            "poem explicitly names Jesus; no denomination is inferred."
        ),
        "rights": RIGHTS.format(deaths="Ingemann died in 1862 and editor Johan Borup in 1946."),
    },
]
NORMALIZATION = (
    " Historical spelling is retained; typeface, indentation and punctuation typography are normalized. "
    "Denmark is an associated place, not a claim about composition location."
)


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

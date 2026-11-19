#!/usr/bin/env python3
"""Reproduce four complete poems from Obstfelder's 1893 Digte."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/obstfelder-1893-readings.txt"
OUTPUT = ROOT / "content/poems/obstfelder-1893.json"
READINGS_SHA256 = "962e10482d914704a88231fec20bff66af0c08c0bbd0e9545061b5700837c3ad"
# Identifies the consulted images; hashes do not establish accuracy or rights.
EVIDENCE = {
    "obstfelder-1893-0005.jpg": "3db9ccca5546b0b543b909d4c19c611c5e3cb3e4d69359ca95aff2d77e2c73af",
    "obstfelder-1893-0007.jpg": "cd2d095a800531ab46cdafeafa815b053321974a1b7644c9354a9212e9f9968f",
    "obstfelder-1893-0017.jpg": "7fa529e9469b5a4c4bbfb83e0cdffc69d8fcb1bb9855f740cc94c6da635db498",
    "obstfelder-1893-0018.jpg": "f51d40577e8d71341af8de322977701a2da5270cc6ebcc97552f04993a67b987",
    "obstfelder-1893-0019.jpg": "274ed094da6819f0654b735270f34c9deacc8b43e99dfb49818a9b13953ee185",
    "obstfelder-1893-0020.jpg": "562ea2db9ffa463990bad96847b7592025fae879dc87274458474062bdb89e1c",
    "obstfelder-1893-0037.jpg": "06a03757ed63c8b7212b0885864969a439fa8057c366c94f676c5639da88f008",
    "obstfelder-1893-0038.jpg": "f068dd93b6698c645f799f515a2d18832a2d99f6eeca3bbc944d4b94c76600cf",
    "obstfelder-1893-0065.jpg": "1861e9e72efa7ffbabfc6419ad915d44f7cd9e52cac99b683a222b0944031c34",
    "obstfelder-1893-0076.jpg": "e3af22b68f2089ae0f8e17bab0519c92d91a47b2db7b537d70a005ea9afbf23e",
    "obstfelder-1893-0077.jpg": "c6183b0c9355c79d8527435d13495007dc6231abafec803dd8d8c375dddb789c",
    "obstfelder-1893-0078.jpg": "b11851cc84e0d308cc58003c86b6fad0713e3c56769c44fabf0ea93dec40d7ad",
    "obstfelder-samtiden-1892-0262.jpg": "f71c3175fda54f41b6606adaa4edc0af9f0dc59b28a4d2f4ae4d12046c7df53e",
    "obstfelder-samtiden-1892-0263.jpg": "15f90087e59bec0da94ba4d650dfe2c3c2f718a23e2e08e7f6a6eed1dba280cd",
    "obstfelder-samtiden-1892-0264.jpg": "1dc77654b41431b53f3490a646d6addce6e92756e6fb0297c9bb2df6a9345029",
}
NRK = "https://arkiv.nrk.no/blogg.nrk.no/bok/2016/07/07/de-100-beste-norske-diktene/index.html"
BOOK = "https://www.nb.no/items/URN:NBN:no-nb_digibok_2009010803011"
COMMON = {
    "author": "Sigbjørn Obstfelder", "authorId": "sigbjorn-obstfelder",
    "authorYears": "1866–1900", "authorAliases": ["Sigbjorn Obstfelder"],
    "country": "Norway", "language": "Norwegian", "lang": "nb", "direction": "ltr",
    "era": "19th century", "form": "Lyric", "themes": [], "mood": "paper", "translations": [],
    "year": 1893, "yearLabel": "1893 printing · not necessarily composition date",
    "collection": "Digte · 1893", "contextSourceTitle": "NRK · 2016 Norwegian poetry selection",
    "contextSource": NRK,
}
LANGUAGE = (
    " The National Library catalogues this Danish-based historical Norwegian written language"
    " as nob; the nb tag is a practical discovery and reading aid, not a claim that its"
    " spelling is modern Bokmål. Historical spelling is retained; typography and spacing"
    " are normalized. Norway is an associated place, not a claim about composition location."
)
RIGHTS = (
    "Published in 1893, this original is public domain in the United States; Obstfelder died"
    " in 1900. The linked National Library of Norway scan is marked public domain and is"
    " linked, not republished. Copyright, edition and moral rights differ by jurisdiction;"
    " check local law. Transcription error is possible. No translation, score or recording"
    " is included."
)
WORKS = [
    {
        "key": "jeg-ser", "title": "Jeg ser", "page": 18, "pages": "15–16",
        "blocks": [3, 2, 1, 3, 2, 1, 3, 1, 3],
        "searchAliases": ["Jeg ser på den hvite himmel", "Jeg er visst kommet på en feil klode"],
        "context": (
            "The separately titled poem runs across pp. 15–16, ending before Navnløs."
            " A blank line at the page turn is an editorial choice; the printing does not"
            " establish the spacing there. NRK's 2016 expert selection names this work from the 1893 collection; that"
            " selection is regional evidence, not a global ranking."
        ),
    },
    {
        "key": "navnlos", "title": "Navnløs", "page": 20, "pages": "17–18",
        "blocks": [7, 4, 4, 4, 4, 8],
        "searchAliases": ["Navnlos", "Mørkets taage sænker sig", "Mørkets tåke senker seg"],
        "context": (
            "The separately titled poem occupies pp. 17–18. It is uncertain whether a stanza"
            " break falls at the page turn after 'et menneske'; here the"
            " lines continue without an inserted blank line. NRK's 2016 expert selection"
            " identifies this work from the 1893 collection."
        ),
    },
    {
        "key": "vaar", "title": "Vaar", "page": 38, "pages": "35–36",
        "blocks": [1, 7, 7, 7, 6],
        "searchAliases": ["Vår", "Faen i støbejernssøilerne", "Faen i støpejernssøylene"],
        "context": (
            "The complete poem occupies pp. 35–36; the printed '(Fra mine teknikerdage,"
            " 1890.)' is retained, not treated as an additional work. Relative verse"
            " indentation and interrupted words are approximated in plain text, not silently"
            " joined. A stanza break at the page turn is uncertain; no blank line is inserted."
            " NRK's 2016 selection names 'Vår'"
            " from this collection; its contents lists only this Vaar."
        ),
    },
    {
        "key": "regn", "title": "Regn", "page": 77, "pages": "74–75",
        "blocks": [1, 20],
        "searchAliases": ["En er en og to er to", "Zik zak", "Det regner i dag"],
        "context": (
            "The complete poem runs across pp. 74–75, retaining the printed subtitle"
            " '(Impromptu.)' and the repeated opening passage on p. 75. The page turn"
            " does not create another work; a stanza break there is uncertain and no blank"
            " line is inserted. The separately titled 1892 Samtiden printing has 'tik, tak'"
            " and 'regn, regn' where the 1893 book has 'tik tak' and 'regn regn';"
            " the readings are not combined. NRK's 2016 expert selection names this work"
            " from the 1893 collection."
        ),
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
        if [len(block.splitlines()) for block in text.split("\n\n")] != work["blocks"]:
            raise ValueError(f"Unexpected reading boundaries: {work['key']}")
        record = {
            **COMMON,
            "id": "obstfelder-1893-" + work["key"],
            "title": work["title"],
            "sourceTitle": f"Digte · 1893 · pp. {work['pages']}",
            "source": f"{BOOK}?page={work['page']}",
            "searchAliases": work["searchAliases"],
            "context": work["context"] + LANGUAGE,
            "rights": RIGHTS,
            "text": text,
        }
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

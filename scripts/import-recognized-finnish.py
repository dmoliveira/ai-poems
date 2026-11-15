#!/usr/bin/env python3
"""Reproduce four complete Finnish readings from reviewed historical scans."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-finnish-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-finnish.json"
READINGS_SHA256 = "6a387bb6ea2f9c54cd12e75682f8f1396f60f6e13be457a73c18687688fb24bb"

# Hashes identify the scanned witnesses, not the accuracy of a transcription.
EVIDENCE = {
    "leino-talvi-yo-1905.pdf": "4ff8b2dae88022f4f80ebc83ab6745fedff65248bb84dd081e24569bcd76b319",
    "kivi-kirjallinen-1866-08.pdf": "c22de1cbf0c3aa674ca8d515d302060a4c344b410a84c3cfd525e7743f1b9e4c",
}

WORKS = [
    {
        "key": "leino-nocturne", "title": "Nocturne", "author": "Eino Leino",
        "authorId": "eino-leino", "authorYears": "1878–1926", "year": 1905, "lines": 20,
        "collection": "Talvi-yö · 1905", "sourceTitle": "Talvi-yö · Helsinki, 1905, pp. 34–35",
        "source": "https://digi.kansalliskirjasto.fi/teos/binding/1907397?page=42",
        "reception": "https://yle.fi/a/20-150917",
        "detail": (
            "The complete reading follows the two pages of the 1905 printing. The scan prints "
            "'En ma', not the 'En mä' found in some transcriptions; both appearances here follow "
            "the scan. The stanza break at the page boundary is editorial. Other versions, "
            "including a manuscript, differ and are not counted as additional works. "
            "Yle calls this individual poem one of Leino's best loved."
        ),
    },
    {
        "key": "kivi-kaukametsa", "title": "Kaukametsä", "author": "Aleksis Kivi",
        "authorId": "aleksis-kivi", "authorYears": "1834–1872", "year": 1866, "lines": 28,
        "collection": "Kirjallinen Kuukauslehti · 1866", "sourceTitle": "Kirjallinen Kuukauslehti · 1 August 1866, p. 185",
        "source": "https://digi.kansalliskirjasto.fi/aikakausi/binding/111042?page=11",
        "reception": "https://journal.fi/joutsen-svanen-erikois-special/article/view/100563/58086",
        "detail": (
            "The seven complete stanzas are separately titled in the 1866 journal under the "
            "initials A. K. Later editions differ; the scan prints 'ilmanrannat', which is retained "
            "rather than silently replaced with a later reading. The linked literary study calls "
            "this one of Kivi's best-known poems. This journal poem is not from Kanervala."
        ),
    },
    {
        "key": "kivi-sunnuntai", "title": "Sunnuntai", "author": "Aleksis Kivi",
        "authorId": "aleksis-kivi", "authorYears": "1834–1872", "year": 1866, "lines": 36,
        "collection": "Kirjallinen Kuukauslehti · 1866", "sourceTitle": "Kirjallinen Kuukauslehti · 1 August 1866, p. 185",
        "source": "https://digi.kansalliskirjasto.fi/aikakausi/binding/111042?page=11",
        "reception": "https://www.ts.fi/a/80057",
        "detail": (
            "The six complete stanzas are separately titled in the 1866 journal, continuing "
            "from the left column into the right. The scan prints 'oil' where some later editions "
            "read 'oli', and 'Kultaset santarannat' where they differ; these readings are retained. "
            "The linked 2009 review names "
            "this individual poem among Kivi's much-loved works. This journal poem is not from Kanervala."
        ),
    },
    {
        "key": "kivi-onnelliset", "title": "Onnelliset", "author": "Aleksis Kivi",
        "authorId": "aleksis-kivi", "authorYears": "1834–1872", "year": 1866, "lines": 35,
        "collection": "Kirjallinen Kuukauslehti · 1866", "sourceTitle": "Kirjallinen Kuukauslehti · 1 August 1866, p. 186",
        "source": "https://digi.kansalliskirjasto.fi/aikakausi/binding/111042?page=12",
        "reception": "https://www.ts.fi/a/80057",
        "detail": (
            "The five complete stanzas are separately titled in the 1866 journal. The scan's "
            "third refrain reads 'Ja linnut laulelee' without 'ne', and its punctuation varies "
            "between stanzas; these are retained. Later editions differ. The linked 2009 review "
            "names this individual poem among Kivi's much-loved works. This journal poem is "
            "not from Kanervala."
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
            "id": "recognized-finnish-" + work["key"], "title": work["title"],
            "author": work["author"], "authorId": work["authorId"], "authorYears": work["authorYears"],
            "country": "Finland", "language": "Finnish", "lang": "fi", "direction": "ltr",
            "year": work["year"], "yearLabel": f"{work['year']} printing · not necessarily composition date",
            "era": "19th century" if work["year"] == 1866 else "20th century", "form": "Verse",
            "collection": work["collection"], "themes": [], "mood": "paper",
            "context": work["detail"] + (
                " Spacing, indentation and quotation-mark typography are normalized; "
                "the associated country is not a claim about the place of composition."
            ),
            "sourceTitle": work["sourceTitle"], "source": work["source"],
            "contextSourceTitle": "Individual reception and context", "contextSource": work["reception"],
            "rights": (
                f"The {work['year']} printing is public domain in the United States; the author died "
                f"in {1926 if work['authorId'] == 'eino-leino' else 1872}, more than 70 years ago. "
                "Copyright and moral rights vary by jurisdiction, so check local law. The National "
                "Library of Finland scan is linked, not republished; the verse was independently "
                "transcribed from the historical pages. No translation or recording is included."
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

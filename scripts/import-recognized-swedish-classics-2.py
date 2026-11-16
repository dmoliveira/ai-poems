#!/usr/bin/env python3
"""Reproduce three complete Swedish readings from a 1921 printing."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-swedish-classics-2-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-swedish-classics-2.json"
READINGS_SHA256 = "10178ff5c291df1ac2b6c776eab991acedc13edbd78566f3d44ac9e99a7ba9a4"

# Hashes identify consulted copies, not transcription accuracy.
EVIDENCE = {
    "andersson-visor-1921-scan-0005-future.png": "a996fb288a99f85cc752a83ad94e2d6a335943ea7df45822a41ef8ff697eac77",
    "andersson-visor-1921-scan-0089-future.png": "cd4c83a1367c75a3ca70cf8aae2e7f9acc4ed5bb9693c56adf42b663aaca502f",
    "andersson-visor-1921-scan-0090-future.png": "81bd51a73af8e9cfe264e55559f88193deecb367f74fe8c577be81d33f5d3f0f",
    "andersson-visor-1921-scan-0117-future.png": "4b5fe68d7174f5e6dbf02ff559f124bbe755267c17574c07782d612c8abec429",
    "andersson-visor-1921-scan-0118-future.png": "e20203e4f5dccbfbac1ba7f22251685169e4040fe6015653a5c48e6cfe1d0074",
    "andersson-visor-1921-scan-0158-future.png": "6ba474c5911242f4ee4d75dfe4574120eeefcfa2c9c10b6a5989dedcd7b4cd7a",
    "andersson-visor-1921-scan-0159-future.png": "5d42621a7b0d24655343e67ab7530d01a351b35a9c2f1a4eb92307a5f33953aa",
    "andersson-visor-1921-scan-0248-future.png": "a2930daa631948b193d61cb14e88f8234ffcb856dc3f0659f5ceba9221161216",
}
SCHOOL = "https://litteraturbanken.se/skolan/poesi-forfattare-dan-andersson-"
RIGHTS = (
    "The 1921 printing is public domain in the United States; Andersson died in 1920. "
    "Copyright, edition-related and moral rights vary by jurisdiction; check local law. "
    "The facsimile is linked, not republished. No translation or recording is included."
)
WORKS = [
    {
        "key": "spelmannen", "title": "Spelmannen", "pages": "87–88", "firstPage": "0089",
        "school": "spelmannen/", "blocks": [4] * 6,
        "aliases": ["Jag är spelman, jag skall spela på gravöl och på dans"],
        "detail": (
            "The complete poem has six quatrains on pp. 87–88. It is distinct from "
            "En spelmans jordafärd, which precedes it. "
        ),
    },
    {
        "key": "minnet", "title": "Minnet", "pages": "115–116", "firstPage": "0117",
        "school": "minnet/", "blocks": [8, 8, 2],
        "aliases": ["Vi gingo över Raiskis frusna, vida vatten"],
        "detail": (
            "The complete 18-line poem crosses pp. 115–116. The page turn is not treated as "
            "a stanza break; the final couplet is separated by a smaller printed gap. "
            "It is distinct from Andersson's posthumous poem also titled Minnet. "
        ),
    },
    {
        "key": "jag-har-dromt", "title": "Jag har drömt…", "pages": "156–157", "firstPage": "0158",
        "school": "jag-har-dromt/", "blocks": [4] * 8,
        "aliases": ["Jag har drömt", "Jag har drömt jag skulle sjunga vad jag känner"],
        "detail": (
            "The complete poem has eight quatrains on pp. 156–157, before Vaggsången vid Kestina. "
            "The 1921 printing reads ‘en liten, liten kvinna’; the school text omits that comma. "
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
            raise ValueError(f"Unexpected stanza boundaries: {work['key']}")
        records.append({
            "id": "recognized-swedish-classics-2-andersson-" + work["key"], "title": work["title"],
            "author": "Dan Andersson", "authorId": "dan-andersson", "authorYears": "1888–1920",
            "country": "Sweden", "language": "Swedish", "lang": "sv", "direction": "ltr",
            "year": 1921, "yearLabel": "1921 printing · not necessarily composition date",
            "era": "20th century", "form": "Verse", "collection": "Svarta ballader · Visor och ballader, 1921",
            "themes": [], "mood": "paper", "searchAliases": work["aliases"],
            "context": work["detail"] + (
                "Litteraturbanken discusses the individual poem for school readers. "
                "Printed line wraps are rejoined; spacing, indentation and dash typography are normalized. "
                "Sweden is an associated place, not a claim about composition."
            ),
            "sourceTitle": f"Visor och ballader · Stockholm, 1921, pp. {work['pages']}",
            "source": f"https://runeberg.org/danvob/{work['firstPage']}.html",
            "contextSourceTitle": "Litteraturbanken · individual teaching selection",
            "contextSource": SCHOOL + work["school"], "rights": RIGHTS,
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

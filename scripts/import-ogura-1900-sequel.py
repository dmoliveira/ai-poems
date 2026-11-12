#!/usr/bin/env python3
"""Reproduce scan-reviewed Ogura waka 41–65 from Keichū's 1900 edition."""

import argparse
import json
import re
import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMMON = runpy.run_path(str(ROOT / "scripts/import-ogura-1900.py"))
MANIFEST = ROOT / "scripts/sources/ogura-1900-sequel-reviewed.json"
OUTPUT = ROOT / "content/poems/ogura-1900-sequel-reviewed.json"
PAGES = (89, 90, 91, 92, 93, 94, 96, 97, 100, 102, 104, 106, 106, 107, 108, 110, 111, 112, 114, 117, 118, 119, 121, 124, 125)


def make_records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    scan = (directory / COMMON["PDF"]).read_bytes()
    comparison = (directory / COMMON["COMPARISON"]).read_bytes()
    if COMMON["sha256"](scan) != manifest["scanSha256"]:
        raise ValueError("Historical scan changed")
    if COMMON["sha256"](comparison) != manifest["comparisonSha256"]:
        raise ValueError("Comparison snapshot changed")
    rows = COMMON["comparison_rows"](comparison)
    items = manifest["poems"]
    if [(item["number"], item["page"]) for item in items] != list(enumerate(PAGES, 41)):
        raise ValueError("Unexpected reviewed selection, page or order")
    if len({item["text"] for item in items}) != len(items) or len({item["authorId"] for item in items}) != len(items):
        raise ValueError("Duplicate reviewed poem or poet")

    records = []
    for item in items:
        number = item["number"]
        label, _, _, _, _, author = rows[number - 1]
        target = re.search(r"\[\[(?:w:|作者:)?([^|\]]+)", author)
        if not target:
            raise ValueError(f"Missing comparison attribution: {number}")
        comparison_name = re.sub(r" \([^)]*\)$", "", target.group(1))
        if comparison_name != item["authorOriginal"]:
            raise ValueError(f"Comparison attribution changed: {number}")
        lines = item["text"].split("\n")
        if len(lines) != 5 or any(not line.strip() or line != line.strip() for line in lines):
            raise ValueError(f"Incomplete waka: {number}")
        context = (
            f"Traditionally numbered {number} in the Ogura Hyakunin Isshu anthology; "
            "the attributed poet and a corresponding reading are also listed in Japanese Wikisource. "
            "The text follows Keichū's 1900 printing, not the modern card-text comparison. "
            "Voicing is clarified where needed, some character forms are normalized, "
            "and repetition marks are expanded; the five line breaks are editorial. "
            "Composition date and place are not established here."
        )
        if item.get("note"):
            context += " " + item["note"]
        records.append({
            "id": f"ogura-1900-{number:03}",
            "title": lines[0],
            "author": item["author"],
            "authorOriginal": item["authorOriginal"],
            "authorId": item["authorId"],
            "authorYears": "Classical Japan · dates not established here",
            "country": "Japan", "language": "Japanese", "lang": "ja", "direction": "ltr",
            "year": None, "yearLabel": "1900 edition · composition date not established here",
            "era": "Classical Japan", "form": "Waka",
            "collection": "Ogura Hyakunin Isshu · 1900 Keichū edition",
            "themes": [], "mood": "paper", "context": context,
            "contextSource": f"{COMMON['COMPARISON_URL']}#{label}",
            "contextSourceTitle": f"Japanese Wikisource · Ogura Hyakunin Isshu, no. {number} (comparison)",
            "sourceTitle": f"Keichū · Hyakunin Isshu Kaikanshō (1900), PDF p. {item['page']}",
            "source": f"{COMMON['PDF_URL']}#page={item['page']}",
            "rights": (
                "Historical original and the 1900 edition are public domain in the United States. "
                "Internet Archive marks this scan public domain. Check local law before reuse."
            ),
            "text": item["text"], "translations": [],
        })
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the reviewed PDF and comparison snapshot")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(make_records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Committed records differ from the reviewed transcriptions")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

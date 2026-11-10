#!/usr/bin/env -S uv run --no-project --with beautifulsoup4 python
"""Reproduce the scan-reviewed Issa selection using saved comparison evidence."""

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/issa-1902-reviewed.json"
OUTPUT = ROOT / "content/poems/issa-1902-reviewed.json"


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def make_records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    items = manifest["poems"]
    if len(items) != 39 or len({item["text"] for item in items}) != len(items):
        raise ValueError("Unexpected reviewed selection")
    if {str(item["scan"]) for item in items} != set(manifest["scanSha256"]):
        raise ValueError("The reviewed scan list does not match the selection")
    if {item["comparison"] for item in items} != set(manifest["comparisons"]):
        raise ValueError("The comparison list does not match the selection")

    for page, expected in manifest["scanSha256"].items():
        image = directory / f"issa-1902-{int(page):03}.jpg"
        if sha256(image.read_bytes()) != expected:
            raise ValueError(f"Scan image changed: {page}")

    comparisons = {}
    for key, evidence in manifest["comparisons"].items():
        html = (directory / f"issa-comparison-{key}.html").read_bytes()
        if sha256(html) != evidence["sha256"]:
            raise ValueError(f"Comparison snapshot changed: {key}")
        soup = BeautifulSoup(html, "html.parser")
        comparisons[key] = Counter(
            sha256("".join(str(child) for child in element.children if isinstance(child, NavigableString))
                   .strip().encode("utf8"))
            for element in soup.select(".haiku-result p.japanese")
        )

    records = []
    for number, item in enumerate(items, 1):
        if comparisons[item["comparison"]][item["comparisonSha256"]] != 1:
            raise ValueError(f"Missing or ambiguous attribution comparison: {number}")
        if item["page"] not in (2 * item["scan"] - 6, 2 * item["scan"] - 5):
            raise ValueError(f"Unexpected printed page: {number}")
        text = item["text"]
        context = (
            "One separately printed hokku in Ōtsuka Kōzan's 1902 Issa anthology. "
            "David Lanoue's Issa archive also attributes a corresponding reading to Issa. "
            "Some character forms are normalized and printed repetition marks expanded; "
            "the composition date and place are not established here."
        )
        if item.get("note"):
            context += " " + item["note"]
        records.append({
            "id": f"issa-1902-{number:02}",
            "title": text,
            "author": "Kobayashi Issa",
            "authorOriginal": "小林一茶",
            "authorId": "kobayashi-issa",
            "authorYears": "1763–1827/28",
            "country": "Japan",
            "language": "Japanese",
            "lang": "ja",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Edo period · exact year not established here",
            "era": "Edo period",
            "form": "Haiku",
            "collection": "Issa Haiku Collection (1902 edition)",
            "themes": [],
            "mood": "paper",
            "context": context,
            "contextSource": manifest["comparisons"][item["comparison"]]["url"],
            "contextSourceTitle": "David Lanoue · Issa archive comparison",
            "sourceTitle": f"National Diet Library · Ōtsuka, Issa Haiku Collection (1902), p. {item['page']}",
            "source": f"https://dl.ndl.go.jp/pid/874848/1/{item['scan']}",
            "rights": (
                "Historical original and 1902 edition are public domain in the United States; "
                "the National Diet Library marks its scan public domain. Check local law before reuse."
            ),
            "text": text,
            "translations": [],
        })
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing reviewed scans and comparison snapshots")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(make_records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Committed records differ from the reviewed transcription")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

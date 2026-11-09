#!/usr/bin/env -S uv run --no-project --with beautifulsoup4 python
"""Reproduce manually scan-reviewed Buson verses using saved comparison evidence."""

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/buson-1926-reviewed.json"
OUTPUT = ROOT / "content/poems/buson-1926-reviewed.json"


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def make_records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    items = manifest["poems"]
    if len(items) != 32 or len({item["text"] for item in items}) != len(items):
        raise ValueError("Unexpected reviewed selection")
    soup = BeautifulSoup((directory / "buson-kigosai.html").read_bytes(), "html.parser")
    comparison = Counter(
        cells[-1].get_text("", strip=True)
        for row in soup.select("table tr")
        if (cells := row.select("td"))
    )
    if sum(comparison.values()) != 868:
        raise ValueError("Kigosai comparison list changed")
    for page, expected in manifest["scanSha256"].items():
        image = directory / f"buson-1926-{int(page):02}.jpg"
        if sha256(image.read_bytes()) != expected:
            raise ValueError(f"Scan image changed: {page}")
    if {str(item["scan"]) for item in items} != set(manifest["scanSha256"]):
        raise ValueError("The reviewed scan list does not match the selection")
    records = []
    for number, item in enumerate(items, 1):
        text = item["text"]
        if comparison[item.get("comparison", text)] != 1:
            raise ValueError(f"Missing or ambiguous independent comparison: {number}")
        context = (
            "One of Yosa Buson's hokku in Ozawa Takeji's 1926 anthology. "
            "The Kigosai poetry association also includes it in its Buson collection. "
            "The composition date and place are not established here."
        )
        if item.get("note"):
            context += " " + item["note"]
        records.append({
            "id": f"buson-1926-{number:02}",
            "title": text,
            "author": "Yosa Buson",
            "authorOriginal": "与謝蕪村",
            "authorId": "yosa-buson",
            "authorYears": "1716–1783/84",
            "country": "Japan",
            "language": "Japanese",
            "lang": "ja",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Edo period · exact year not established here",
            "era": "Edo period",
            "form": "Haiku",
            "collection": "Buson Haiku Collection (1926 edition)",
            "themes": [],
            "mood": "paper",
            "context": context,
            "contextSource": "https://kigosai.sub.jp/bs/?page_id=25582",
            "contextSourceTitle": "Kigosai · Buson haiku by season",
            "sourceTitle": f"National Diet Library · Ozawa, Buson Haiku Collection (1926), p. {item['page']}",
            "source": f"https://dl.ndl.go.jp/pid/1019573/1/{item['scan']}",
            "rights": (
                "Historical original and 1926 edition are public domain in the United States; "
                "the National Diet Library marks its scan public domain. Check local law before reuse."
            ),
            "text": text,
            "translations": [],
        })
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory with the reviewed scan images and comparison HTML")
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

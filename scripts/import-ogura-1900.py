#!/usr/bin/env python3
"""Reproduce scan-reviewed waka from a 1900 Keichū edition of Ogura poetry."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/ogura-1900-reviewed.json"
OUTPUT = ROOT / "content/poems/ogura-1900-reviewed.json"
PDF = "keichu-1900-text.pdf"
COMPARISON = "wikisource-ja-revision-240235.json"
PDF_URL = "https://archive.org/download/hyakuninkeichu/hyakuninkeichu_text.pdf"
COMPARISON_URL = (
    "https://ja.wikisource.org/w/index.php?title=%E5%B0%8F%E5%80%89%E7%99%BE%E4%BA%BA%E4%B8%80%E9%A6%96"
    "&oldid=240235"
)
PAGES = (
    21, 23, 27, 31, 32, 35, 36, 39, 41, 43, 44, 47, 49, 50, 52, 53, 55, 58, 59, 60,
    61, 62, 65, 68, 70, 71, 73, 74, 76, 77, 78, 79, 80, 81, 82, 85, 85, 86, 87, 88,
)
# Display name and linked comparison target when they differ.
AUTHOR_ALIASES = {
    3: ("柿本人麿", "柿本人麻呂"),
    5: ("猿丸大夫", "猿丸太夫"),
    7: ("安倍仲麻呂", "阿倍仲麻呂"),
    8: ("喜撰法師", "喜撰"),
    13: ("陽成院", "陽成天皇"),
    21: ("素性法師", "素性"),
}
ROW = re.compile(
    r'!style="vertical-align:top"\|<span id="(.*?)">.*?</span>\n'
    r'\|style="vertical-align:top"\|(.*?)<br />(.*?)<br />（(.*?)<br />(.*?)）\n'
    r'\|style="vertical-align:top"\|(.*?)<br />',
)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def japanese_number(number):
    digits = "一二三四五六七八九"
    if number == 100:
        return "百"
    tens, units = divmod(number, 10)
    return (f"{digits[tens - 1] if tens > 1 else ''}十" if tens else "") + (digits[units - 1] if units else "")


def comparison_rows(data):
    parsed = json.loads(data)["parse"]
    if parsed["revid"] != 240235 or parsed["title"] != "小倉百人一首":
        raise ValueError("Unexpected Japanese comparison revision")
    rows = ROW.findall(parsed["wikitext"]["*"])
    if len(rows) != 100 or [row[0] for row in rows] != [japanese_number(number) for number in range(1, 101)]:
        raise ValueError("Unexpected comparison poem boundaries")
    return rows


def make_records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    scan = (directory / PDF).read_bytes()
    comparison = (directory / COMPARISON).read_bytes()
    if sha256(scan) != manifest["scanSha256"]:
        raise ValueError("Historical scan changed")
    if sha256(comparison) != manifest["comparisonSha256"]:
        raise ValueError("Comparison snapshot changed")
    rows = comparison_rows(comparison)
    items = manifest["poems"]
    if [(item["number"], item["page"]) for item in items] != list(enumerate(PAGES, 1)):
        raise ValueError("Unexpected reviewed selection, page or order")
    if len({item["text"] for item in items}) != len(items) or len({item["authorId"] for item in items}) != len(items):
        raise ValueError("Duplicate reviewed poem or poet")

    records = []
    for item, row in zip(items, rows, strict=False):
        number = item["number"]
        label, _, _, _, _, author = row
        target = re.search(r"\[\[(?:w:|作者:)?([^|\]]+)", author)
        if not target:
            raise ValueError(f"Missing comparison attribution: {number}")
        comparison_name = re.sub(r" \([^)]*\)$", "", target.group(1))
        display_name, expected_target = AUTHOR_ALIASES.get(number, (item["authorOriginal"], item["authorOriginal"]))
        if item["authorOriginal"] != display_name or comparison_name != expected_target:
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
            "country": "Japan",
            "language": "Japanese",
            "lang": "ja",
            "direction": "ltr",
            "year": None,
            "yearLabel": "1900 edition · composition date not established here",
            "era": "Classical Japan",
            "form": "Waka",
            "collection": "Ogura Hyakunin Isshu · 1900 Keichū edition",
            "themes": [],
            "mood": "paper",
            "context": context,
            "contextSource": f"{COMPARISON_URL}#{label}",
            "contextSourceTitle": f"Japanese Wikisource · Ogura Hyakunin Isshu, no. {number} (comparison)",
            "sourceTitle": f"Keichū · Hyakunin Isshu Kaikanshō (1900), PDF p. {item['page']}",
            "source": f"{PDF_URL}#page={item['page']}",
            "rights": (
                "Historical original and the 1900 edition are public domain in the United States. "
                "Internet Archive marks this scan public domain. Check local law before reuse."
            ),
            "text": item["text"],
            "translations": [],
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

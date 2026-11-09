#!/usr/bin/env -S uv run --no-project --with beautifulsoup4 python
"""Reproduce manually scan-reviewed Arabic poems using saved comparison evidence."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/mutanabbi-1890-reviewed.json"
OUTPUT = ROOT / "content/poems/mutanabbi-1890-reviewed.json"
PDF_URL = "https://odyssee.univ-amu.fr/files/original/1/15/Mutanabbi-Vol1.pdf"


def digest_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def without_vowels(text):
    text = unicodedata.normalize("NFC", text)
    text = re.sub(r"[\u0610-\u061a\u064b-\u0652\u0670\u0640]", "", text)
    return " ".join(text.strip("[] ").split())


def comparison_lines(soup, anchors):
    lines = []
    for anchor in anchors:
        marker = soup.select_one(f"div.nass > p > span.anchor#p{anchor}")
        if marker is None:
            raise ValueError(f"Missing comparison paragraph p{anchor}")
        text = " ".join(marker.parent.get_text(" ", strip=True).split()).strip("[] ")
        parts = text.split(" ... ")
        if len(parts) != 2:
            raise ValueError(f"Unexpected comparison paragraph p{anchor}: {text}")
        lines.extend(without_vowels(part) for part in parts)
    return lines


def make_records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    items = manifest["poems"]
    if len(items) != 10 or len({item["text"] for item in items}) != len(items):
        raise ValueError("Unexpected reviewed selection")
    if digest_file(directory / "mutanabbi-1890.pdf") != manifest["scanSha256"]:
        raise ValueError("The reviewed PDF scan has changed")
    comparisons = {}
    for page in {item["comparisonPage"] for item in items}:
        path = directory / f"wahidi-{page:03}.html"
        comparisons[page] = BeautifulSoup(path.read_bytes(), "html.parser")

    records = []
    for number, item in enumerate(items, 1):
        text = item["text"]
        primary = text.split("\n")
        alternatives = item.get("comparisonVariants", {})
        if not primary or len(primary) != 2 * len(item["anchors"]):
            raise ValueError(f"Unexpected number of half-lines: {number}")
        actual = comparison_lines(comparisons[item["comparisonPage"]], item["anchors"])
        expected = [alternatives.get(str(i), line) for i, line in enumerate(primary, 1)]
        if actual != [without_vowels(line) for line in expected]:
            raise ValueError(f"Comparison changed or differs from reviewed reading: {number}")
        if any(int(i) < 1 or int(i) > len(primary) or value == primary[int(i) - 1]
               for i, value in alternatives.items()):
            raise ValueError(f"Invalid or redundant comparison variant: {number}")
        pages = item["pages"]
        if pages != list(range(pages[0], pages[-1] + 1)):
            raise ValueError(f"Nonconsecutive print pages: {number}")
        page_label = f"p. {pages[0]}" if len(pages) == 1 else f"pp. {pages[0]}–{pages[-1]}"
        context = (
            "A separately headed poem in the 1890–91 Cairo printing of al-Mutanabbī's dīwān. "
            "The linked al-Wāḥidī transcription is a comparison of uncertain edition and textual "
            "independence. Vowel marks are omitted; the composition date and place are not established here."
        )
        if item.get("note"):
            context += " " + item["note"]
        records.append({
            "id": f"mutanabbi-1890-{number:02}",
            "title": primary[0],
            "author": "al-Mutanabbī",
            "authorOriginal": "المتنبي",
            "authorId": "al-mutanabbi",
            "authorYears": "c. 915–965",
            "country": "Not established",
            "language": "Arabic",
            "lang": "ar",
            "direction": "rtl",
            "year": None,
            "yearLabel": "Abbasid era · exact year not established here",
            "era": "Abbasid era",
            "form": "Poetry",
            "collection": "Dīwān of al-Mutanabbī (1890–91 edition)",
            "themes": [],
            "mood": "sand",
            "context": context,
            "contextSource": f"https://shamela.ws/book/754/{item['comparisonPage']}",
            "contextSourceTitle": "Al-Wāḥidī · digitized commentary (edition unspecified)",
            "sourceTitle": f"Aix-Marseille University · al-Mutanabbī, Dīwān (1890–91), {page_label}",
            "source": f"{PDF_URL}#page={482 - pages[0]}",
            "rights": (
                "Historical original in a pre-1931 edition; public domain in the United States. "
                "Aix-Marseille University marks its scan public domain. Check local law before reuse."
            ),
            "text": text,
            "translations": [],
        })
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory with the reviewed PDF and comparison HTML")
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

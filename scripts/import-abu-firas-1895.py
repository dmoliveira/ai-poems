#!/usr/bin/env python3
"""Reproduce manually scan-reviewed Abū Firās poems from the pinned manifest."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/abu-firas-1895-reviewed.json"
OUTPUT = ROOT / "content/poems/abu-firas-1895-reviewed.json"
DVORAK = "https://archive.org/download/abfirseinara00abfi/abfirseinara00abfi.pdf"
COMPARISONS = {
    "diwan": (
        "https://archive.org/download/diwanabifiras00abufuoft/diwanabifiras00abufuoft.pdf",
        "Internet Archive · Abū Firās, Dīwān (1910), comparison",
    ),
    "ahlwardt": (
        "https://archive.org/download/chalefelahmarsq00ahlwgoog/chalefelahmarsq00ahlwgoog.pdf",
        "Internet Archive · Ahlwardt (1859), comparison",
    ),
}


def digest_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def page_label(pages):
    return f"p. {pages[0]}" if len(pages) == 1 else f"pp. {pages[0]}–{pages[-1]}"


def make_records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    for name, expected in manifest["scanSha256"].items():
        if digest_file(directory / name) != expected:
            raise ValueError(f"The reviewed scan has changed: {name}")
    items = manifest["poems"]
    if len(items) != 10 or len({item["slug"] for item in items}) != len(items):
        raise ValueError("Unexpected reviewed selection")

    records = []
    for item in items:
        text = item["text"]
        lines = text.split("\n")
        pages = item["pages"]
        if (
            len(lines) != 2 * item["couplets"]
            or any(not line or line != line.strip() for line in lines)
            or text != unicodedata.normalize("NFC", text)
            or re.search(r"[\u0610-\u061a\u064b-\u0652\u0670\u0640]", text)
        ):
            raise ValueError(f"Unexpected reading transcription: {item['slug']}")
        if pages != list(range(pages[0], pages[-1] + 1)):
            raise ValueError(f"Nonconsecutive printed pages: {item['slug']}")
        comparison_pages = item["comparisonPrintedPages"]
        if comparison_pages != list(range(comparison_pages[0], comparison_pages[-1] + 1)):
            raise ValueError(f"Nonconsecutive comparison pages: {item['slug']}")
        if len(comparison_pages) != len(item["comparisonPages"]):
            raise ValueError(f"Mismatched comparison page numbers: {item['slug']}")
        comparison, comparison_title = COMPARISONS[item["comparison"]]
        context = (
            "A separately headed selection attributed to Abū Firās in Dvořák's 1895 "
            "edition of al-Thaʿālibī's anthology. Its boundaries were compared with the "
            "linked historical printing; other traditions may differ. The printings are not "
            "claimed to have independent manuscript descent. Vowel marks are omitted; the "
            "composition date and place are not established here. " + item["note"]
        )
        records.append({
            "id": f"abu-firas-1895-{item['slug']}",
            "title": lines[0],
            "author": "Abū Firās al-Ḥamdānī",
            "authorOriginal": "أبو فراس الحمداني",
            "authorId": "abu-firas-al-hamdani",
            "authorYears": "c. 932–968",
            "country": "Not established",
            "language": "Arabic",
            "lang": "ar",
            "direction": "rtl",
            "year": None,
            "yearLabel": "Abbasid era · exact year not established here",
            "era": "Abbasid era",
            "form": "Poetry",
            "collection": "Abū Firās in al-Thaʿālibī (Dvořák, 1895)",
            "themes": [],
            "mood": "sand",
            "context": context,
            "contextSource": f"{comparison}#page={item['comparisonPages'][0]}",
            "contextSourceTitle": f"{comparison_title}, {page_label(comparison_pages)}",
            "sourceTitle": f"Internet Archive · Dvořák, Abû Firâs (1895), {page_label(pages)}",
            "source": f"{DVORAK}#page={pages[0] + 6}",
            "rights": (
                "Historical original and pre-1931 edition are public domain in the United States. "
                "Check local law before reuse."
            ),
            "text": text,
            "translations": [],
        })
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the three reviewed PDFs")
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

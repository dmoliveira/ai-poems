#!/usr/bin/env python3
"""Reproduce Sabri reading texts from reviewed magazine and comparison scans."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/sabri-magazines-reviewed.json"
READINGS = ROOT / "scripts/sources/sabri-magazines-reviewed.txt"
OUTPUT = ROOT / "content/poems/sabri-magazines-reviewed.json"
EXPECTED_SCANS = {"zouhour-1910.pdf", "zouhour-1911.pdf", "zouhour-1913.pdf", "sabri-1357.pdf"}
EXPECTED_SLUGS = ("tear", "saba", "thaman", "opposition", "friend", "tusun")


def digest_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def scan_url(witness, page):
    filename = quote(witness["archiveFile"], safe="")
    return f"https://archive.org/download/{witness['archiveId']}/{filename}#page={page}"


def page_label(pages):
    return f"p. {pages[0]}" if len(pages) == 1 else f"pp. {pages[0]}–{pages[-1]}"


def consecutive(pages):
    return bool(pages) and pages == list(range(pages[0], pages[-1] + 1))


def reading_texts():
    source = READINGS.read_text(encoding="utf8")
    if source != unicodedata.normalize("NFC", source):
        raise ValueError("Reading file must use NFC")
    sections = re.split(r"(?m)^=== ([a-z]+) ===\n", source)
    if sections[0] or len(sections) != 2 * len(EXPECTED_SLUGS) + 1:
        raise ValueError("Unexpected reading sections")
    if tuple(sections[1::2]) != EXPECTED_SLUGS:
        raise ValueError("Unexpected reading order")
    result = {}
    for slug, section in zip(sections[1::2], sections[2::2], strict=True):
        rows = section.strip().split("\n")
        if any(
            row and (row.count(" | ") != 1 or any(part != part.strip() or not part for part in row.split(" | ")))
            for row in rows
        ) or re.search(r"[\u0610-\u061a\u064b-\u065f\u0670\u0640]", section):
            raise ValueError(f"Unexpected reading transcription: {slug}")
        result[slug] = "\n".join(row.replace(" | ", "\n") for row in rows)
    return result


def make_records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    witnesses = manifest["witnesses"]
    if set(witnesses) != EXPECTED_SCANS:
        raise ValueError("All reviewed scans are required")
    for name, witness in witnesses.items():
        if digest_file(directory / name) != witness["sha256"]:
            raise ValueError(f"The reviewed scan has changed: {name}")

    readings = reading_texts()
    items = manifest["poems"]
    if tuple(item["slug"] for item in items) != EXPECTED_SLUGS:
        raise ValueError("Unexpected reviewed selection")
    records = []
    for item in items:
        slug = item["slug"]
        text = readings[slug]
        if len([line for line in text.split("\n") if line]) != 2 * item["couplets"]:
            raise ValueError(f"Unexpected couplet count: {slug}")
        for field in ("printedPages", "pdfPages", "comparisonPrintedPages", "comparisonPdfPages"):
            if not consecutive(item[field]):
                raise ValueError(f"Nonconsecutive {field}: {slug}")
        comparison = witnesses["sabri-1357.pdf"]
        records.append({
            "id": f"sabri-magazines-{slug}",
            "title": item["title"],
            "author": "Ismail Sabri",
            "authorOriginal": "إسماعيل صبري",
            "authorId": "ismail-sabri",
            "authorYears": "1854–1923",
            "country": "Egypt",
            "language": "Arabic",
            "lang": "ar",
            "direction": "rtl",
            "year": None,
            "yearLabel": item["yearLabel"],
            "era": "Date not established",
            "form": "Poetry",
            "collection": "Ismail Sabri · early magazine poems",
            "themes": [],
            "mood": "sand",
            "context": (
                item["note"] + " Matching boundaries establish completeness in the named "
                "printings, not all traditions or independent textual descent. Vowel marks "
                "and ornamental dividers are omitted, spelling and spacing normalized, "
                "and each printed half-line is on a separate line except where a word is "
                "split. Egypt is associated with the poet, not asserted as the place of composition."
            ),
            "contextSource": scan_url(comparison, item["comparisonPdfPages"][0]),
            "contextSourceTitle": (
                "Internet Archive · Dīwān Ismāʿīl Ṣabrī Bāshā (1938), "
                + page_label(item["comparisonPrintedPages"])
            ),
            "sourceTitle": f"Internet Archive · {item['sourceLabel']}, {page_label(item['printedPages'])}",
            "source": scan_url(witnesses[item["sourceFile"]], item["pdfPages"][0]),
            "rights": (
                "The original as published before 1931 is public domain in the United States. "
                "Reading transcription made from the historical magazine scan; the 1938 "
                "edition is linked for comparison, not reproduced. Scans are linked, not "
                "republished; check local law before reuse."
            ),
            "text": text,
            "translations": [],
        })
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the four reviewed PDFs")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(make_records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Records differ from the reviewed transcriptions")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

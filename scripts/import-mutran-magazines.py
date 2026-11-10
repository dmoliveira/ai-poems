#!/usr/bin/env python3
"""Reproduce Mutran reading texts from the reviewed magazine and book scans."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/mutran-magazines-reviewed.json"
READINGS = ROOT / "scripts/sources/mutran-magazines-reviewed.txt"
OUTPUT = ROOT / "content/poems/mutran-magazines-reviewed.json"
AUTHORITY = "https://catalogue.bnf.fr/ark:/12148/cb11288236s"
EXPECTED_SCANS = {
    "muqtabas-1908.pdf",
    "zouhour-1910.pdf",
    "zouhour-1911.pdf",
    "zouhour-1912.pdf",
    "mutran-1928.pdf",
    "mutran-volume1.pdf",
    "mutran-vol2.pdf",
    "mutran-vol3.pdf",
    "mutran-complete-vol3.pdf",
}
EXPECTED_SLUGS = (
    "baalbek", "flowers", "musset", "jasmine", "blood", "saba", "zurayq", "tears"
)


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
        if not consecutive(item["printedPages"]) or not consecutive(item["pdfPages"]):
            raise ValueError(f"Nonconsecutive source pages: {slug}")
        if item["comparisonFile"]:
            if not consecutive(item["comparisonPdfPages"]) or not item["comparisonLabel"]:
                raise ValueError(f"Missing comparison pages: {slug}")
            context_source = scan_url(witnesses[item["comparisonFile"]], item["comparisonPdfPages"][0])
            context_title = f"Internet Archive · {item['comparisonLabel']}"
        else:
            if item["comparisonPdfPages"] or item["comparisonLabel"]:
                raise ValueError(f"Unexpected comparison pages: {slug}")
            context_source = AUTHORITY
            context_title = "Bibliothèque nationale de France · Khalil Mutran authority record"

        rights = "The original as published before 1931 is public domain in the United States. "
        if item["wikiRevisions"]:
            revisions = ", ".join(
                f"https://ar.wikisource.org/w/index.php?curid={page}&oldid={revision}"
                for page, revision in item["wikiRevisions"]
            )
            rights += (
                "Reading transcription informed by Wikisource contributors and adapted to the "
                "magazine; CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). "
                f"Revisions and contributor histories: {revisions}. "
            )
        else:
            rights += "Reading transcription made from the historical magazine scan. "
        rights += "Scans are linked, not republished; check local law before reuse."

        records.append({
            "id": f"mutran-magazines-{slug}",
            "title": item["title"],
            "author": "Khalil Mutran",
            "authorOriginal": "خليل مطران",
            "authorId": "khalil-mutran",
            "authorYears": "1872–1949",
            "country": "Lebanon / Egypt",
            "language": "Arabic",
            "lang": "ar",
            "direction": "rtl",
            "year": None,
            "yearLabel": item["yearLabel"],
            "era": "Date not established",
            "form": "Poetry",
            "collection": "Khalil Mutran · early magazine poems",
            "themes": [],
            "mood": "sand",
            "context": (
                item["note"] + " Vowel marks and ornamental dividers are omitted, spelling "
                "conventions and spacing normalized, and each printed half-line is on a "
                "separate line except where a word is split. Lebanon and Egypt are associated "
                "with the poet, not asserted as the place of composition."
            ),
            "contextSource": context_source,
            "contextSourceTitle": context_title,
            "sourceTitle": f"Internet Archive · {item['sourceLabel']}, {page_label(item['printedPages'])}",
            "source": scan_url(witnesses[item["sourceFile"]], item["pdfPages"][0]),
            "rights": rights,
            "text": text,
            "translations": [],
        })
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the nine reviewed PDFs")
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

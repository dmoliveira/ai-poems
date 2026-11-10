#!/usr/bin/env python3
"""Reproduce Arabic readings after checking the reviewed edition scans."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/al-maarri-1901-reviewed.json"
READINGS = ROOT / "scripts/sources/al-maarri-1901-reviewed.txt"
OUTPUT = ROOT / "content/poems/al-maarri-1901-reviewed.json"
PRIMARY = "https://dlib.nyu.edu/files/books/columbia_aco000324/columbia_aco000324_lo.pdf"
CRITICAL = "https://dlib.nyu.edu/files/books/columbia_aco001465/columbia_aco001465_lo.pdf"
EXPECTED_SLUGS = ("farewell", "candle", "mother-elegy", "gifts", "past-endeavors", "armor")


def digest_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as scan:
        for block in iter(lambda: scan.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def reading_texts():
    source = READINGS.read_text(encoding="utf8")
    if source != unicodedata.normalize("NFC", source) or not source.endswith("\n"):
        raise ValueError("Readings must use NFC and end with a newline")
    sections = re.split(r"(?m)^=== ([a-z-]+) ===\n", source)
    if sections[0] or tuple(sections[1::2]) != EXPECTED_SLUGS:
        raise ValueError("Unexpected reading sections")
    readings = {}
    for slug, section in zip(sections[1::2], sections[2::2], strict=True):
        rows = section.strip().split("\n")
        if any(
            row.count(" | ") != 1
            or any(part != part.strip() or not part for part in row.split(" | "))
            for row in rows
        ) or re.search(r"[\u0610-\u061a\u064b-\u065f\u0670\u0640]", section):
            raise ValueError(f"Unexpected reading transcription: {slug}")
        readings[slug] = "\n".join(row.replace(" | ", "\n") for row in rows)
    return readings


def consecutive(pages):
    return bool(pages) and pages == list(range(pages[0], pages[-1] + 1))


def page_label(pages):
    return f"p. {pages[0]}" if len(pages) == 1 else f"pp. {pages[0]}–{pages[-1]}"


def make_records(scans):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    if set(scans) != set(manifest["scanSha256"]):
        raise ValueError("Unexpected reviewed scans")
    for name, path in scans.items():
        if digest_file(path) != manifest["scanSha256"][name]:
            raise ValueError(f"The reviewed scan has changed: {name}")
    items = manifest["poems"]
    if tuple(item["slug"] for item in items) != EXPECTED_SLUGS:
        raise ValueError("Unexpected reviewed selection")
    readings = reading_texts()
    records = []
    for item in items:
        slug = item["slug"]
        text = readings[slug]
        primary = item["printedPages"]
        bulaq = item["bulaqPrintedPages"]
        critical = item["criticalPrintedPages"]
        if (
            not all(consecutive(pages) for pages in (primary, bulaq, critical))
            or item["pdfPages"] != [page + 4 for page in primary]
            or item["bulaqPdfPages"] != [233 - page for page in bulaq]
            or item["criticalPdfPages"] != [page - 1446 for page in critical]
            or len(text.split("\n")) != 2 * item["couplets"]
            or hashlib.sha256(text.encode("utf8")).hexdigest() != item["textSha256"]
        ):
            raise ValueError(f"Unexpected reviewed source or transcription: {slug}")
        records.append({
            "id": f"al-maarri-1901-{slug}",
            "title": text.split("\n")[0],
            "author": "Abu al-Ala al-Maarri",
            "authorOriginal": "أبو العلاء المعري",
            "authorId": "abu-al-ala-al-maarri",
            "authorYears": "973–1057 or 1058",
            "country": "Syria",
            "language": "Arabic",
            "lang": "ar",
            "direction": "rtl",
            "year": None,
            "yearLabel": "10th–11th century · exact year not established here",
            "era": "Abbasid era",
            "form": "Poetry",
            "collection": "Saqṭ al-zand (1901 edition)",
            "themes": [],
            "mood": "sand",
            "context": (
                "A separately headed work by Abū al-ʿAlāʾ al-Maʿarrī in the 1901 "
                "Hindiyya printing. The 1869 Bulāq printing and the linked 1948 critical "
                f"edition also separately present {item['couplets']} couplets. Bibliographer "
                "Ṣalāḥ Kazzāra describes the 1901 printing as derived from Bulāq; they are "
                "not independent witnesses. The 1948 edition was prepared using manuscripts "
                "and commentaries. These are boundaries in the named printings, not a claim "
                "about every textual tradition. The reading follows the 1901 scan, omitting "
                "vowel marks and ornamental dividers and normalizing spacing and some spelling; "
                "lines represent printed half-lines. Syria is associated with the poet, not "
                "an asserted composition place. The Academy of American Poets gives his dates "
                "as 973–1057; the Encyclopedia of World Biography gives 1058 for his death. "
                + item["note"]
            ),
            "contextSource": f"{CRITICAL}#page={item['criticalPdfPages'][0]}",
            "contextSourceTitle": (
                "NYU Arabic Collections Online · Shurūḥ Saqṭ al-zand (1948), "
                + page_label(critical)
            ),
            "sourceTitle": (
                "NYU Arabic Collections Online · Saqṭ al-zand (1901), "
                + page_label(primary)
            ),
            "source": f"{PRIMARY}#page={item['pdfPages'][0]}",
            "rights": (
                "The original and 1901 printing are public domain in the United States. "
                "This reading is transcribed from the 1901 scan; the 1948 scholarly edition "
                "is linked for comparison, not reproduced. Check local law before reuse."
            ),
            "text": text,
            "translations": [],
        })
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("hindiyya", type=Path, help="reviewed 1901 Hindiyya PDF")
    parser.add_argument("bulaq", type=Path, help="reviewed 1869 Bulāq PDF")
    parser.add_argument("critical", type=Path, help="reviewed 1948 scholarly PDF")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    scans = {
        "siqt-hindiyya-1901.pdf": args.hindiyya,
        "siqt-bulaq-1869.pdf": args.bulaq,
        "shuruh-1948-vol4.pdf": args.critical,
    }
    rendered = json.dumps(make_records(scans), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Records differ from the reviewed transcriptions")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

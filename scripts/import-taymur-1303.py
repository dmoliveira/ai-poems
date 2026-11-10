#!/usr/bin/env python3
"""Reproduce Taymur reading texts from the reviewed historical scans."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/taymur-1303-reviewed.json"
OUTPUT = ROOT / "content/poems/taymur-1303-reviewed.json"
PRIMARY = (
    "https://archive.org/download/AAlexandrina-149309/149309%20-%20"
    "%D8%AF%D9%8A%D9%88%D8%A7%D9%86%20%D8%AD%D9%84%D9%8A%D8%A9%20"
    "%D8%A7%D9%84%D8%B7%D8%B1%D8%A7%D8%B2.pdf"
)
COMPARISON = (
    "https://archive.org/download/KitabAlDorAlManthorFeyTabaqatRabaatAlKhodoor/"
    "KitabAlDorAlManthorFeyTabaqatRabaatAlKhodoor.pdf"
)


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
    if set(manifest["scanSha256"]) != {
        "taymur-1303.pdf",
        "taymur-other.pdf",
        "fawwaz-1895.pdf",
    }:
        raise ValueError("All reviewed scans are required")
    for name, expected in manifest["scanSha256"].items():
        if digest_file(directory / name) != expected:
            raise ValueError(f"The reviewed scan has changed: {name}")

    items = manifest["poems"]
    if len(items) != 7 or len({item["slug"] for item in items}) != len(items):
        raise ValueError("Unexpected reviewed selection")

    records = []
    for item in items:
        lines = item["text"].split("\n")
        if (
            len(lines) != 2 * item["couplets"]
            or any(not line or line != line.strip() for line in lines)
            or item["text"] != unicodedata.normalize("NFC", item["text"])
            or re.search(r"[\u0610-\u061a\u064b-\u065f\u0670\u0640]", item["text"])
        ):
            raise ValueError(f"Unexpected reading transcription: {item['slug']}")
        pages = item["printedPages"]
        comparison = item["comparisonPrintedPages"]
        for group in (pages, comparison):
            if not group or group != list(range(group[0], group[-1] + 1)):
                raise ValueError(f"Nonconsecutive printed pages: {item['slug']}")
        if not item.get("wikiPageId") or not item.get("wikiRevision") or not item.get("note"):
            raise ValueError(f"Missing attribution or editorial note: {item['slug']}")
        revision = (
            "https://ar.wikisource.org/w/index.php?"
            f"curid={item['wikiPageId']}&oldid={item['wikiRevision']}"
        )

        records.append({
            "id": f"taymur-1303-{item['slug']}",
            "title": lines[0],
            "author": "Aisha Taymur",
            "authorOriginal": "عائشة التيمورية",
            "authorId": "aisha-taymur",
            "authorYears": "1840–1902",
            "country": "Egypt",
            "language": "Arabic",
            "lang": "ar",
            "direction": "rtl",
            "year": None,
            "yearLabel": "Published by 1303 AH (1885–86) · composition date not established here",
            "era": "Date not established",
            "form": "Poetry",
            "collection": "Ḥilyat al-ṭirāz (1303 AH)",
            "themes": [],
            "mood": "sand",
            "context": (
                "A separately headed poem in the 1303 AH printing of ʿĀʾisha Taymur's "
                "collection, compared with Zaynab Fawwaz's separately printed 1312 AH anthology. "
                "Both printings give the same number of couplets; this establishes the boundaries "
                "in these printings, not in every tradition, and their textual relationship is "
                "not established. The 1303 AH reading is retained, with vowel marks, spelling "
                "conventions and spacing normalized for reading; lines follow the printed "
                "half-lines except where a word is split. Egypt is associated with the poet, "
                "not an asserted place of composition. The exact composition date is not "
                "established here. " + item["note"]
            ),
            "contextSource": f"{COMPARISON}#page={comparison[0] + 40}",
            "contextSourceTitle": (
                "Internet Archive · Zaynab Fawwaz, al-Durr al-manthūr (1312 AH), "
                f"{page_label(comparison)}"
            ),
            "sourceTitle": (
                f"Internet Archive · Ḥilyat al-ṭirāz (1303 AH), {page_label(pages)}"
            ),
            "source": f"{PRIMARY}#page={pages[0] + 4}",
            "rights": (
                "The original and the 1303 AH printing are public domain in the United States. "
                "Reading transcription informed by Wikisource contributors and adapted to "
                "the historical printing; CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). "
                f"Revision and contributor history: {revision}. "
                "Scans are linked, not republished; check local law before reuse."
            ),
            "text": item["text"],
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
            raise ValueError("Records differ from the reviewed transcription")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

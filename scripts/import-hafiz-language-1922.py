#!/usr/bin/env python3
"""Reproduce a reviewed 1922 Ḥāfiẓ Ibrāhīm reading from pinned scans."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/hafiz-language-1922.json"
READING = ROOT / "scripts/sources/hafiz-language-1922.txt"
OUTPUT = ROOT / "content/poems/hafiz-language-1922.json"
SCANS = {"aub_aco003437_lo.pdf", "collected-125963.pdf", "almanar10.pdf"}


def digest_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def reading(item):
    source = READING.read_text(encoding="utf8")
    if source != unicodedata.normalize("NFC", source) or not source.endswith("\n"):
        raise ValueError("Reading must be NFC and end with a newline")
    rows = source.removesuffix("\n").split("\n")
    if len(rows) != item["couplets"]:
        raise ValueError("Unexpected couplet count")
    for row in rows:
        halves = row.split(" | ")
        if len(halves) != 2 or any(not half or half != half.strip() or "  " in half for half in halves):
            raise ValueError("Unexpected couplet")
        if re.search(r"[\u0610-\u061a\u064b-\u065f\u0670\u0640]", row):
            raise ValueError("Unexpected vowel mark or ornament")
    text = "\n".join(row.replace(" | ", "\n") for row in rows)
    if hashlib.sha256(text.encode("utf8")).hexdigest() != item["textSha256"]:
        raise ValueError("The reviewed reading changed")
    return text


def records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    witnesses = manifest["witnesses"]
    if set(witnesses) != SCANS:
        raise ValueError("All three reviewed scans are required")
    for name, witness in witnesses.items():
        if digest_file(directory / name) != witness["sha256"]:
            raise ValueError(f"The reviewed scan has changed: {name}")
    item = manifest["poem"]
    for field in ("printedPages", "pdfPages", "comparisonPrintedPages", "comparisonPdfPages", "magazinePrintedPages", "magazinePdfPages"):
        pages = item[field]
        if not pages or pages != list(range(pages[0], pages[-1] + 1)):
            raise ValueError(f"Nonconsecutive {field}")
    text = reading(item)
    return [{
        "id": "hafiz-ibrahim-language-1922",
        "title": item["title"],
        "displayTitle": item["displayTitle"],
        "displayTitleLang": "ar",
        "author": "Ḥāfiẓ Ibrāhīm",
        "authorOriginal": "حافظ إبراهيم",
        "authorId": "hafiz-ibrahim",
        "authorYears": "Born 1871 or 1872; died 1932",
        "country": "Egypt",
        "language": "Arabic",
        "lang": "ar",
        "direction": "rtl",
        "year": None,
        "yearLabel": "Published by June 1907 · composition date not established",
        "era": "Date not established",
        "form": "Poetry",
        "collection": "Ḥāfiẓ Ibrāhīm · Dīwān Ḥāfiẓ (1922)",
        "themes": [],
        "mood": "sand",
        "context": (
            "Ibrāhīm speaks in the person of the Arabic language. The 1922 author-authorized "
            "edition titles the poem لسان حال اللغة العربية; the display title follows "
            "a separately printed collected edition, which states it was published in 1903. "
            "A June 1907 al-Manār review names his earlier dīwān and prints the same 23 "
            "couplets as a sample. The 1922 and collected printings share those verse "
            "boundaries; this does not establish independent textual descent or completeness "
            "in every tradition. The 1922 scan reads لقوم عداتي, while al-Manār and the "
            "collected printing read لقول عداتي. The three scans print فإني, while a modern "
            "al-Diwan transcription reads فإنني. We retain the 1922 readings. Vowel marks, "
            "footnotes, ornaments and some punctuation are omitted; some spelling and "
            "spacing are normalized, and each printed half-line is a reading line. This is "
            "a reading transcription, not a fully vocalized diplomatic edition. Egypt is "
            "associated with the poet, not asserted as the poem's composition place; "
            "its exact composition date is not established here. His birth year is given "
            "as 1871 by Britannica and as approximately 1872 by the National Library of Israel."
        ),
        "contextSource": f"{witnesses['almanar10.pdf']['url']}#page={item['magazinePdfPages'][0]}",
        "contextSourceTitle": "Internet Archive · al-Manār, June 1907, pp. 308–309",
        "sourceTitle": "Arabic Collections Online · Dīwān Ḥāfiẓ, vol. II (1922), pp. 16–19",
        "source": f"https://aco.dlib.nyu.edu/book/aub_aco003437/{item['pdfPages'][0]}",
        "rights": (
            "The original as published before 1931 is public domain in the United States. "
            "The reading is transcribed from the author-authorized 1922 edition; comparison "
            "scans are linked, not republished. Check local law before reuse."
        ),
        "text": text,
        "translations": [],
    }]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the three reviewed PDFs")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Record differs from the reviewed transcription")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Reproduce the reviewed Shawqi poem from its 1927 school printing."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/shawqi-schools-1927.json"
READING = ROOT / "scripts/sources/shawqi-schools-1927.txt"
OUTPUT = ROOT / "content/poems/shawqi-schools-1927.json"
SCHOOL = "schools-unknown.pdf"
COMPARISON = "correct-137947.pdf"


def digest_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def scan_url(witness, page):
    filename = quote(witness["archiveFile"], safe="")
    return f"https://archive.org/download/{witness['archiveId']}/{filename}#page={page}"


def reading_text(item):
    source = READING.read_text(encoding="utf8")
    if source != unicodedata.normalize("NFC", source):
        raise ValueError("Reading file must use NFC")
    prefix = f"=== {item['slug']} ===\n"
    if not source.startswith(prefix) or not source.endswith("\n"):
        raise ValueError("Unexpected reading section")
    sections = source[len(prefix):].strip().split("\n\n")
    if [len(section.splitlines()) for section in sections] != item["coupletsBySection"]:
        raise ValueError("Unexpected section or couplet count")
    for row in (row for section in sections for row in section.splitlines()):
        if row.count(" | ") != 1 or any(not part or part != part.strip() for part in row.split(" | ")):
            raise ValueError("Unexpected couplet transcription")
        if re.search(r"[\u0610-\u061a\u064b-\u065f\u0670\u0640]", row):
            raise ValueError("Unexpected vowel mark or ornamental elongation")
    text = "\n\n".join(section.replace(" | ", "\n") for section in sections)
    if hashlib.sha256(text.encode("utf8")).hexdigest() != item["textSha256"]:
        raise ValueError("The reviewed reading has changed")
    return text


def make_records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    witnesses = manifest["witnesses"]
    if set(witnesses) != {SCHOOL, COMPARISON}:
        raise ValueError("Both reviewed scans are required")
    for name, witness in witnesses.items():
        if digest_file(directory / name) != witness["sha256"]:
            raise ValueError(f"The reviewed scan has changed: {name}")
    item = manifest["poem"]
    if item["slug"] != "aviation":
        raise ValueError("Unexpected reviewed selection")
    for field in ("printedPages", "pdfPages", "comparisonPrintedPages", "comparisonPdfPages"):
        pages = item[field]
        if not pages or pages != list(range(pages[0], pages[-1] + 1)):
            raise ValueError(f"Nonconsecutive {field}")
    return [{
        "id": "shawqi-schools-aviation",
        "title": item["title"],
        "author": "Ahmad Shawqi",
        "authorOriginal": "أحمد شوقي",
        "authorId": "ahmad-shawqi",
        "authorYears": "1868–1932",
        "country": "Egypt",
        "language": "Arabic",
        "lang": "ar",
        "direction": "rtl",
        "year": None,
        "yearLabel": "Published 1927 · composition date not independently established",
        "era": "Date not established",
        "form": "Poetry",
        "collection": "Ahmad Shawqi · al-Shawqiyyāt li-l-madāris",
        "themes": [],
        "mood": "sand",
        "context": (
            "The 1927 school edition introduces this poem as a welcome for two French "
            "aviators arriving in Egypt in 1914; this occasion is not independent proof "
            "of its exact composition date. It prints 58 couplets in three sections. "
            "A separately printed, undated posthumous volume also heads the same 58 "
            "couplets as one poem. Their matching boundaries establish completeness "
            "in these printings, not all traditions or independent textual descent. "
            "The school edition prints الأنس where the posthumous volume has الإنس. "
            "The school scan appears to read حطنا الدهر where the posthumous "
            "volume appears to read حظنا الدهر; the school reading is retained. "
            "A Wikisource transcription of an article labelled 1914 reads في يمين الله "
            "where the school edition has في عين الله; the magazine scan has not "
            "been verified, so whether this is a variant or a transcription error is "
            "unresolved. "
            "This reading follows the 1927 scan: vowel marks, footnotes and ornaments "
            "are omitted, some spelling, spacing and punctuation normalized, and each half-line is "
            "placed on a separate line. Egypt is associated with the poet, not asserted "
            "as the poem's place of composition."
        ),
        "contextSource": scan_url(witnesses[COMPARISON], item["comparisonPdfPages"][0]),
        "contextSourceTitle": "Internet Archive · al-Shawqiyyāt (al-ṣaḥīḥa), vol. II, pp. 3–6",
        "sourceTitle": "Internet Archive · al-Shawqiyyāt li-l-madāris (1927), pp. 8–12",
        "source": scan_url(witnesses[SCHOOL], item["pdfPages"][0]),
        "rights": (
            "The original as published before 1931 is public domain in the United States. "
            "The reading is transcribed from the 1927 school edition; the undated "
            "posthumous edition is linked for comparison, not reproduced. Scans are "
            "linked, not republished; check local law before reuse."
        ),
        "text": reading_text(item),
        "translations": [],
    }]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the two reviewed PDFs")
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

#!/usr/bin/env python3
"""Reproduce reviewed Shawqi readings from the pinned historical scans."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/shawqi-schools-more-1927.json"
READING = ROOT / "scripts/sources/shawqi-schools-more-1927.txt"
OUTPUT = ROOT / "content/poems/shawqi-schools-more-1927.json"
SCHOOL = "schools-1927.pdf"
COMPARISON = "collected-101217.pdf"


def digest_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def scan_url(witness, page):
    return f"https://archive.org/download/{witness['archiveId']}/{quote(witness['archiveFile'], safe='')}#page={page}"


def readings(items):
    source = READING.read_text(encoding="utf8")
    if source != unicodedata.normalize("NFC", source) or not source.endswith("\n"):
        raise ValueError("Reading must be NFC and end with a newline")
    parts = re.split(r"^=== ([a-z]+) ===\n", source, flags=re.MULTILINE)
    if parts.pop(0) or len(parts) != 2 * len(items):
        raise ValueError("Unexpected reading sections")
    output = {}
    for item in items:
        slug, raw = parts.pop(0), parts.pop(0)
        if slug != item["slug"]:
            raise ValueError("Unexpected reading order")
        sections = raw.strip().split("\n\n")
        if [len(section.splitlines()) for section in sections] != item["coupletsBySection"]:
            raise ValueError(f"Unexpected section or couplet count: {slug}")
        for row in (row for section in sections for row in section.splitlines()):
            if row.count(" | ") != 1 or any(not part or part != part.strip() for part in row.split(" | ")):
                raise ValueError(f"Unexpected couplet: {slug}")
            if re.search(r"[\u0610-\u061a\u064b-\u065f\u0670\u0640]", row):
                raise ValueError(f"Unexpected vowel mark or ornament: {slug}")
        text = "\n\n".join(section.replace(" | ", "\n") for section in sections)
        if hashlib.sha256(text.encode("utf8")).hexdigest() != item["textSha256"]:
            raise ValueError(f"The reviewed reading changed: {slug}")
        output[slug] = text
    return output


def records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    witnesses = manifest["witnesses"]
    if set(witnesses) != {SCHOOL, COMPARISON}:
        raise ValueError("Both reviewed scans are required")
    for name, witness in witnesses.items():
        if digest_file(directory / name) != witness["sha256"]:
            raise ValueError(f"The reviewed scan has changed: {name}")
    items = manifest["poems"]
    if [item["slug"] for item in items] != ["bank", "exile"]:
        raise ValueError("Unexpected reviewed selection")
    text = readings(items)
    output = []
    for item in items:
        for field in ("printedPages", "pdfPages", "comparisonPrintedPages", "comparisonPdfPages"):
            pages = item[field]
            if not pages or pages != list(range(pages[0], pages[-1] + 1)):
                raise ValueError(f"Nonconsecutive {field}: {item['slug']}")
        first, last = item["printedPages"][0], item["printedPages"][-1]
        comp_first, comp_last = item["comparisonPrintedPages"][0], item["comparisonPrintedPages"][-1]
        if item["slug"] == "bank":
            event = (
                "The school edition says this poem was recited at the Royal Opera in 1920 "
                "for the establishment of Bank Misr; that occasion does not independently "
                "establish its exact composition date. Its 17 couplets form one work. "
                "The school scan prints بينكمو, retained here; a modern Hindawi "
                "transcription reads بينكم. "
            )
        else:
            event = (
                "The school edition says this poem was recited at an opera gathering in 1920 "
                "after the poet's return from exile; that occasion does not independently "
                "establish its exact composition date. Its 60 couplets and four printed "
                "section breaks form one work. The school scan and comparison read "
                "نثرت الدمع; a modern Hindawi reading has فنثري الدمع. "
            )
        context = (
            event
            + "The reading follows the author-credited 1927 school scan. Its couplets "
            "and boundaries were compared in order with a separately printed collected "
            "edition, whose date is not established here. Matching boundaries establish "
            "completeness in these printings, not in every tradition or independent "
            "manuscript descent. A modern transcription was used as an aid; the wording "
            "was checked against the school scan, not assumed from the modern text. "
            "Vowel marks, footnotes and "
            "ornaments are omitted; some spelling, spacing and punctuation are normalized, "
            "and each half-line is placed on a separate line. This is a reading "
            "transcription, not a fully vocalized diplomatic edition. Egypt is associated "
            "with the poet, not asserted as the poem's composition place."
        )
        output.append({
            "id": f"shawqi-schools-{item['slug']}",
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
            "context": context,
            "contextSource": scan_url(witnesses[COMPARISON], item["comparisonPdfPages"][0]),
            "contextSourceTitle": f"Internet Archive · al-Shawqiyyāt, vol. I, pp. {comp_first}–{comp_last}",
            "sourceTitle": f"Internet Archive · al-Shawqiyyāt li-l-madāris (1927), pp. {first}–{last}",
            "source": scan_url(witnesses[SCHOOL], item["pdfPages"][0]),
            "rights": (
                "The original as published before 1931 is public domain in the United States. "
                "The reading is transcribed from the 1927 school edition; the separately "
                "printed collected edition is linked for comparison, not reproduced. "
                "Scans are linked, not republished; check local law before reuse."
            ),
            "text": text[item["slug"]],
            "translations": [],
        })
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the two reviewed PDFs")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Records differ from the reviewed transcriptions")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

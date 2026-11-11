#!/usr/bin/env python3
"""Reproduce complete Shawqi readings from the pinned historical scans."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/shawqi-schools-historical-1927.json"
READING = ROOT / "scripts/sources/shawqi-schools-historical-1927.txt"
OUTPUT = ROOT / "content/poems/shawqi-schools-historical-1927.json"
SCHOOL = "schools-1927.pdf"
COMPARISONS = {"correct-137947.pdf", "collected-101217.pdf"}


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
        text = raw.strip()
        sections = text.split("\n\n")
        if [len(section.splitlines()) for section in sections] != item["coupletsBySection"]:
            raise ValueError(f"Unexpected section or couplet count: {slug}")
        for row in (row for section in sections for row in section.splitlines()):
            if not row or row != row.strip() or "  " in row or "|" in row:
                raise ValueError(f"Unexpected couplet: {slug}")
            if re.search(r"[\u0610-\u061a\u064b-\u065f\u0670\u0640]", row):
                raise ValueError(f"Unexpected vowel mark or ornament: {slug}")
        if hashlib.sha256(text.encode("utf8")).hexdigest() != item["textSha256"]:
            raise ValueError(f"The reviewed reading changed: {slug}")
        output[slug] = text
    return output


def records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    witnesses = manifest["witnesses"]
    if set(witnesses) != {SCHOOL} | COMPARISONS:
        raise ValueError("All three reviewed scans are required")
    for name, witness in witnesses.items():
        if digest_file(directory / name) != witness["sha256"]:
            raise ValueError(f"The reviewed scan has changed: {name}")
    items = manifest["poems"]
    if [item["slug"] for item in items] != ["anas", "women"]:
        raise ValueError("Unexpected reviewed selection")
    text = readings(items)
    output = []
    for item in items:
        for field in ("printedPages", "pdfPages", "comparisonPrintedPages", "comparisonPdfPages"):
            pages = item[field]
            if not pages or pages != list(range(pages[0], pages[-1] + 1)):
                raise ValueError(f"Nonconsecutive {field}: {item['slug']}")
        if item["comparison"] not in COMPARISONS:
            raise ValueError(f"Unexpected comparison: {item['slug']}")
        first, last = item["printedPages"][0], item["printedPages"][-1]
        comp_first, comp_last = item["comparisonPrintedPages"][0], item["comparisonPrintedPages"][-1]
        if item["slug"] == "anas":
            event = (
                "The school heading says this poem was presented to former US president "
                "Roosevelt during an Egyptian visit in 1912. A contemporary newspaper and "
                "Roosevelt's published addresses document a 1910 Egyptian visit; the "
                "reason for the discrepancy and the poem's composition date are unresolved. "
                "The school printing has 42 couplets; the separately printed comparison "
                "precedes its verse with a prose dedication absent from the school poem. "
                "The school and comparison print بالسعد والنحس, while a modern al-Diwan "
                "transcription has بالسعد والنخس. "
            )
            comparison_title = f"Internet Archive · al-Shawqiyyāt al-ṣaḥīḥa, pp. {comp_first}–{comp_last}"
        else:
            event = (
                "The school heading dates a women's gathering at the Azbakeya theatre "
                "to 1920, while a later account dates it to 1924; the occasion and "
                "composition date are not independently resolved here. Its 43 couplets "
                "and printed division form one work. The school prints عامت بناته; the "
                "collected comparison has علمت بناته and a modern Hindawi reading has "
                "علت ببناته. The school also reads عندهمو, أقبلن ... المآثر and المحسنات, "
                "where the modern aid reads عندهم, أقبل ... المنائر and المحصنات. "
            )
            comparison_title = f"Internet Archive · al-Shawqiyyāt, vol. I, pp. {comp_first}–{comp_last}"
        context = (
            event
            + "The reading follows the author-credited 1927 school scan. Each complete "
            "couplet and its boundaries were compared in order with a separately printed "
            "edition of unestablished date; matching verse boundaries establish "
            "completeness in these printings, not independent manuscript descent or "
            "completeness in every tradition. Modern transcriptions were aids, not the "
            "historical or rights basis. Vowel marks, footnotes, ornaments and some "
            "punctuation are omitted; some spelling and spacing are normalized. Each "
            "couplet is one line and words split across printed half-lines are rejoined; "
            "blank lines retain the school edition's divisions. This is a reading "
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
            "contextSource": scan_url(witnesses[item["comparison"]], item["comparisonPdfPages"][0]),
            "contextSourceTitle": comparison_title,
            "sourceTitle": f"Internet Archive · al-Shawqiyyāt li-l-madāris (1927), pp. {first}–{last}",
            "source": scan_url(witnesses[SCHOOL], item["pdfPages"][0]),
            "rights": (
                "The original as published before 1931 is public domain in the United States. "
                "The reading is transcribed from the 1927 school edition; the separately "
                "printed comparison is linked, not reproduced. Scans are linked, not "
                "republished; check local law before reuse."
            ),
            "text": text[item["slug"]],
            "translations": [],
        })
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the three reviewed PDFs")
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

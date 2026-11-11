#!/usr/bin/env python3
"""Reproduce two reviewed 1922 Ḥāfiẓ Ibrāhīm readings from pinned scans."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/hafiz-virtues-1922.json"
READING = ROOT / "scripts/sources/hafiz-virtues-1922.txt"
OUTPUT = ROOT / "content/poems/hafiz-virtues-1922.json"
SCANS = {"aub_aco003437_lo.pdf", "collected-125963.pdf"}


def digest_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


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
        rows = text.splitlines()
        if len(rows) != item["couplets"]:
            raise ValueError(f"Unexpected couplet count: {slug}")
        for row in rows:
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
    if set(witnesses) != SCANS:
        raise ValueError("Both reviewed scans are required")
    for name, witness in witnesses.items():
        if digest_file(directory / name) != witness["sha256"]:
            raise ValueError(f"The reviewed scan has changed: {name}")
    items = manifest["poems"]
    if [item["slug"] for item in items] != ["virtues", "privileges"]:
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
        if item["slug"] == "virtues":
            note = (
                "The 1922 printing titles this poem الأخلاق الفاضلة; the separately "
                "printed collected edition calls it سجن الفضائل. The 1922 scan reads "
                "فرويتهن وأظمأني; the collected printing and modern al-Diwan aid read "
                "فروينهن وأظمأنني. We retain the 1922 wording, without silently "
                "replacing it with the other reading. "
            )
        else:
            note = (
                "The 1922 printing titles this poem الامتيازات; the separately printed "
                "collected edition calls it الامتيازات الأجنبية. The 1922 scan reads "
                "لهذا الفخر من سباب; the collected printing and modern al-Diwan aid "
                "read من سبب. We retain the 1922 wording, without silently "
                "replacing it with the other reading. "
            )
        context = (
            note
            + "The author-authorized 1922 edition and the separately printed collected "
            "edition, whose publication date is not established here, have the same "
            "opening, ending and couplet count. Each couplet was compared in order; "
            "the boundaries hold in these printings, not necessarily in every tradition, "
            "and do not establish independent textual descent. Modern transcriptions "
            "were collation aids, not the historical or rights basis. Vowel marks, "
            "footnotes, ornaments and some punctuation are omitted; some spelling and "
            "spacing are normalized. Each complete couplet is a reading line, and "
            "words split across printed lines are rejoined. This is a reading "
            "transcription, not a fully vocalized diplomatic edition. Egypt is "
            "associated with the poet, not asserted as the poem's composition place; "
            "its exact composition date is not established here. His birth year is given "
            "as 1871 by Britannica and as approximately 1872 by the National Library of Israel."
        )
        output.append({
            "id": f"hafiz-ibrahim-1922-{item['slug']}",
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
            "yearLabel": "Published 1922 · composition date not established",
            "era": "Date not established",
            "form": "Poetry",
            "collection": "Ḥāfiẓ Ibrāhīm · Dīwān Ḥāfiẓ (1922)",
            "themes": [],
            "mood": "sand",
            "context": context,
            "contextSource": f"{witnesses['collected-125963.pdf']['url']}#page={item['comparisonPdfPages'][0]}",
            "contextSourceTitle": f"Internet Archive · collected Dīwān, vol. II, pp. {comp_first}–{comp_last} (date uncertain)",
            "sourceTitle": f"Arabic Collections Online · Dīwān Ḥāfiẓ, vol. II (1922), pp. {first}–{last}",
            "source": f"https://aco.dlib.nyu.edu/book/aub_aco003437/{item['pdfPages'][0]}",
            "rights": (
                "The original as published before 1931 is public domain in the United States. "
                "The reading is transcribed from the author-authorized 1922 edition; the "
                "comparison scan is linked, not republished. Check local law before reuse."
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

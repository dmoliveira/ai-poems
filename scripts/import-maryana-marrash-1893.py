#!/usr/bin/env python3
"""Reproduce reviewed Maryana Marrash readings after verifying the scan."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/maryana-marrash-bint-fikr-1893.json"
READINGS = ROOT / "scripts/sources/maryana-marrash-bint-fikr-1893.txt"
OUTPUT = ROOT / "content/poems/maryana-marrash-bint-fikr-1893.json"
SCAN = (
    "https://upload.wikimedia.org/wikipedia/commons/d/dd/"
    "%D8%A8%D9%86%D8%AA_%D9%81%D9%83%D8%B1.pdf"
)
AUTHORITY = "https://arabica.dohainstitute.org/pages/Maryana-Marrash.aspx"
EXPECTED_SLUGS = (
    "wise-praise", "reason-praise", "mary-inscription", "virtue", "francis-elegy",
    "salma-elegy", "literary-work", "friends-family", "captive-heart", "absent-friends",
    "lasting-affection", "friend-filmo",
)


def digest_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def reading_texts():
    source = READINGS.read_text(encoding="utf8")
    if source != unicodedata.normalize("NFC", source):
        raise ValueError("Reading file must use NFC")
    sections = re.split(r"(?m)^=== ([a-z-]+) ===\n", source)
    if sections[0] or tuple(sections[1::2]) != EXPECTED_SLUGS:
        raise ValueError("Unexpected reading sections")
    result = {}
    for slug, section in zip(sections[1::2], sections[2::2], strict=True):
        rows = section.strip().split("\n")
        if any(
            row.count(" | ") != 1
            or any(part != part.strip() or not part for part in row.split(" | "))
            for row in rows
        ) or re.search(r"[\u0610-\u061a\u064b-\u065f\u0670\u0640]", section):
            raise ValueError(f"Unexpected reading transcription: {slug}")
        result[slug] = "\n".join(row.replace(" | ", "\n") for row in rows)
    return result


def make_records(scan):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    if digest_file(scan) != manifest["scanSha256"]:
        raise ValueError("The reviewed Bint Fikr scan has changed")
    items = manifest["poems"]
    if tuple(item["slug"] for item in items) != EXPECTED_SLUGS:
        raise ValueError("Unexpected reviewed selection")
    readings = reading_texts()
    records = []
    for item in items:
        text = readings[item["slug"]]
        lines = text.split("\n")
        pages = item["printedPages"]
        wiki_pages = item["wikiPages"]
        if len(lines) != 2 * item["couplets"]:
            raise ValueError(f"Unexpected couplet count: {item['slug']}")
        if not pages or pages != list(range(pages[0], pages[-1] + 1)):
            raise ValueError(f"Nonconsecutive printed pages: {item['slug']}")
        if len(wiki_pages) != len(pages) or any(
            not page.get("pageId") or not page.get("revision") for page in wiki_pages
        ):
            raise ValueError(f"Missing Wikisource attribution: {item['slug']}")
        references = "; ".join(
            "https://ar.wikisource.org/w/index.php?"
            f"curid={page['pageId']}&oldid={page['revision']}"
            for page in wiki_pages
        )
        page_label = f"p. {pages[0]}" if len(pages) == 1 else f"pp. {pages[0]}–{pages[-1]}"
        records.append({
            "id": f"maryana-marrash-1893-{item['slug']}",
            "title": lines[0],
            "author": "Maryana Marrash",
            "authorOriginal": "مريانا مراش",
            "authorId": "maryana-marrash",
            "authorYears": "Born 1846 or 1848; died 1919",
            "country": "Syria",
            "language": "Arabic",
            "lang": "ar",
            "direction": "rtl",
            "year": None,
            "yearLabel": "Published by 1893 · composition date not established here",
            "era": "Date not established",
            "form": "Poetry",
            "collection": "Bint Fikr (1893)",
            "themes": ["Faith"] if item.get("faith") else [],
            "mood": "sand",
            "context": (
                "A separately headed work in Maryana Marrash's 1893 Beirut collection. "
                "The linked copy ends mid-work after p. 30; the boundaries here are those "
                "printed for this piece, not a claim about all textual traditions. "
                "The reading follows the scan with vowel marks, spacing and some spelling "
                "conventions normalized; lines represent printed half-lines. Syria is "
                "associated with the poet, not an asserted place of composition. Her birth "
                "year is disputed: the Library of Congress authority gives 1846; "
                "the linked Arabica encyclopedia gives 1848. The exact composition date is not "
                "established here. " + item["note"]
            ),
            "contextSource": AUTHORITY,
            "contextSourceTitle": "Arabica · Maryana Marrash biography",
            "sourceTitle": f"Wikimedia Commons · Bint Fikr (1893), {page_label}",
            "source": f"{SCAN}#page={pages[0]}",
            "rights": (
                "The original and 1893 edition are public domain in the United States. "
                "Reading transcription informed by Wikisource contributors and adapted to "
                "the 1893 printing; CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). "
                f"Page revisions and contributor histories: {references}. "
                "The scan is linked, not republished; check local law before reuse."
            ),
            "text": text,
            "translations": [],
        })
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scan", type=Path, help="the reviewed Bint Fikr PDF")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(make_records(args.scan), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Records differ from the reviewed transcriptions")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

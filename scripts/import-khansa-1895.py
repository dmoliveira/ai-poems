#!/usr/bin/env python3
"""Reproduce the al-Khansāʾ reading texts from a scan-reviewed manifest."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/khansa-1895-reviewed.json"
OUTPUT = ROOT / "content/poems/khansa-1895-reviewed.json"
PRIMARY = "https://archive.org/download/ansaljulasfmulak00khan/ansaljulasfmulak00khan.pdf"
COMPARISON = (
    "https://archive.org/download/AAlexandrina-186158/"
    "186158%20-%20%D8%AF%D9%8A%D9%88%D8%A7%D9%86%20%D8%A7%D9%84%D8%AE%D9%86%D8%B3%D8%A7%D8%A1.pdf"
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
    if set(manifest["scanSha256"]) != {"khansa-1895.pdf", "khansa-1929.pdf"}:
        raise ValueError("Both reviewed scans are required")
    for name, expected in manifest["scanSha256"].items():
        if digest_file(directory / name) != expected:
            raise ValueError(f"The reviewed scan has changed: {name}")

    items = manifest["poems"]
    if len(items) != 8 or len({item["slug"] for item in items}) != len(items):
        raise ValueError("Unexpected reviewed selection")

    records = []
    for item in items:
        lines = item["text"].split("\n")
        if (
            len(lines) != 2 * item["couplets"]
            or any(not line or line != line.strip() for line in lines)
            or item["text"] != unicodedata.normalize("NFC", item["text"])
            or re.search(r"[\u0610-\u061a\u064b-\u0652\u0670\u0640]", item["text"])
        ):
            raise ValueError(f"Unexpected reading transcription: {item['slug']}")
        pages = item["printedPages"]
        comparison = item["comparisonPrintedPages"]
        for group in (pages, comparison):
            if not group or group != list(range(group[0], group[-1] + 1)):
                raise ValueError(f"Nonconsecutive printed pages: {item['slug']}")

        rights = "Historical original and the 1895 edition are public domain in the United States. "
        if bool(item.get("wikiPageId")) != bool(item.get("wikiRevision")):
            raise ValueError(f"Incomplete Wikisource attribution: {item['slug']}")
        if item.get("wikiPageId"):
            revision = (
                "https://ar.wikisource.org/w/index.php?"
                f"curid={item['wikiPageId']}&oldid={item['wikiRevision']}"
            )
            rights += (
                "Reading transcription informed by Wikisource contributors and adapted to the 1895 "
                "printing, with vowel marks removed; CC BY-SA 4.0 "
                "(https://creativecommons.org/licenses/by-sa/4.0/). Revision and contributor "
                f"history: {revision}. "
            )
        rights += "Scans are linked, not republished; check local law before reuse."

        records.append({
            "id": f"khansa-1895-{item['slug']}",
            "title": lines[0],
            "author": "al-Khansāʾ",
            "authorOriginal": "الخنساء",
            "authorId": "al-khansa",
            "authorYears": "c. 575–c. 645",
            "country": "Not established",
            "language": "Arabic",
            "lang": "ar",
            "direction": "rtl",
            "year": None,
            "yearLabel": "Late 6th–7th century · exact year not established here",
            "era": "Late 6th–7th century",
            "form": "Poetry",
            "collection": "Al-Khansāʾ, Anīs al-julasāʾ (1895)",
            "themes": [],
            "mood": "sand",
            "context": (
                "A separately headed selection attributed to al-Khansāʾ in the 1895 Beirut "
                "abridgment edited by Louis Cheikho. The linked 1348 AH printing has the same "
                "printed boundaries; the printings are not claimed as independent manuscript "
                "witnesses, and other traditions may differ. This reading follows the 1895 "
                "printing; vowel marks and typographic spacing are normalized, and each "
                "hemistich appears on its own line. Its date and place of composition are not "
                "established here. " + item["note"]
            ),
            "contextSource": f"{COMPARISON}#page={comparison[0] + 4}",
            "contextSourceTitle": (
                "Internet Archive · al-Taqaddum printing, 1348 AH (c. 1929–30), "
                f"{page_label(comparison)}"
            ),
            "sourceTitle": f"Internet Archive · Cheikho, al-Khansāʾ (1895), {page_label(pages)}",
            "source": f"{PRIMARY}#page={157 - pages[0]}",
            "rights": rights,
            "text": item["text"],
            "translations": [],
        })
    return records


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

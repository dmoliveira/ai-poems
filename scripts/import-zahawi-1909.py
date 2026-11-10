#!/usr/bin/env python3
"""Reproduce two scan-reviewed al-Zahāwī readings after verifying both printings."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/zahawi-kalim-1909.json"
READINGS = ROOT / "scripts/sources/zahawi-kalim-1909.txt"
OUTPUT = ROOT / "content/poems/zahawi-kalim-1909.json"
PRIMARY = "https://archive.org/download/alkalimalmanm01zahwuoft/alkalimalmanm01zahwuoft.pdf"
COMPARISON = (
    "https://archive.org/download/3326pdf_202001/"
    "3326%20%D9%83%D8%AA%D8%A7%D8%A8%20%D8%A7%D9%82%D8%B1%D8%A7%20"
    "%D8%A7%D9%88%D9%86%D9%84%D8%A7%D9%8A%D9%86%20%20%20%20pdf%20%20%20"
    "%D8%AF%D9%8A%D9%88%D8%A7%D9%86%20%D8%A7%D9%84%D8%B2%D9%87%D8%A7%D9%88%D9%8A.pdf"
)
EXPECTED_SLUGS = ("weary-labors", "tumbler-pigeons")


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


def make_records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    for name, expected in manifest["scanSha256"].items():
        if digest_file(directory / name) != expected:
            raise ValueError(f"The reviewed scan has changed: {name}")
    items = manifest["poems"]
    if tuple(item["slug"] for item in items) != EXPECTED_SLUGS:
        raise ValueError("Unexpected reviewed selection")
    readings = reading_texts()
    records = []
    for item in items:
        text = readings[item["slug"]]
        if (
            len(text.split("\n")) != 2 * item["couplets"]
            or hashlib.sha256(text.encode("utf8")).hexdigest() != item["textSha256"]
        ):
            raise ValueError(f"Unexpected reviewed text: {item['slug']}")
        if item["pdfPage"] != 195 - item["printedPage"]:
            raise ValueError(f"Unexpected primary page: {item['slug']}")
        records.append({
            "id": f"zahawi-1909-{item['slug']}",
            "title": text.split("\n")[0],
            "author": "Jamīl Ṣidqī al-Zahāwī",
            "authorOriginal": "جميل صدقي الزهاوي",
            "authorId": "jamil-sidqi-al-zahawi",
            "authorYears": "1863–1936",
            "country": "Iraq",
            "language": "Arabic",
            "lang": "ar",
            "direction": "rtl",
            "year": None,
            "yearLabel": "Published in 1327 AH (1909–10) · composition date not established here",
            "era": "Date not established",
            "form": "Poetry",
            "collection": "Al-Kalim al-manẓūm (1327 AH)",
            "themes": [],
            "mood": "sand",
            "context": (
                "Al-Zahāwī's 1327 AH title page says he omitted some verses from his poems, "
                "without identifying every affected work. This reading follows the 1909–10 "
                "printing; the linked 1924 printing has the same separately bounded couplet "
                "count. Matching boundaries establish the texts as printed, not independent "
                "descent or completeness in every tradition. Vowel marks are omitted, some "
                "spelling and spacing are normalized, and printed half-lines are on separate "
                "lines. Iraq is associated with the poet, not an asserted composition place; "
                "the composition date is not established here. " + item["note"]
            ),
            "contextSource": f"{COMPARISON}#page={item['comparisonPdfPage']}",
            "contextSourceTitle": (
                f"Internet Archive · Dīwān al-Zahāwī (1924), p. {item['comparisonPrintedPage']}"
            ),
            "sourceTitle": (
                f"Internet Archive · Al-Kalim al-manẓūm (1327 AH), p. {item['printedPage']}"
            ),
            "source": f"{PRIMARY}#page={item['pdfPage']}",
            "rights": (
                "The historical original and pre-1931 printing are public domain in the United "
                "States. The scans are linked, not republished; check local law before reuse."
            ),
            "text": text,
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
            raise ValueError("Records differ from the reviewed transcriptions")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

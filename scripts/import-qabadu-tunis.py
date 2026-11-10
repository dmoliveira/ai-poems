#!/usr/bin/env python3
"""Reproduce the reviewed Qābāḍū readings from pinned historical scans."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/qabadu-tunis-reviewed.json"
READINGS = ROOT / "scripts/sources/qabadu-tunis-reviewed.txt"
OUTPUT = ROOT / "content/poems/qabadu-tunis-reviewed.json"
IMAGE = "https://api.digitale-sammlungen.de/iiif/image/v2/bsb11368507_{:05d}/full/full/0/default.jpg"
EXPECTED_SLUGS = (
    "reward", "toothache", "messenger", "couscous", "birth-chronogram", "visit",
    "almonds", "seal-chronogram",
)
EXPECTED_SCANS = {
    "tunis-library-1877-candidate.pdf", "bsb-v1-p21.jpg", "bsb-v1-p22.jpg",
    "bsb-v1-p23.jpg", "bsb-v1-p50.jpg", "bsb-v1-p51.jpg",
}


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
            or any(not part or part != part.strip() for part in row.split(" | "))
            for row in rows
        ) or re.search(r"[\u0610-\u061a\u064b-\u065f\u0670\u0640]", section):
            raise ValueError(f"Unexpected reading transcription: {slug}")
        readings[slug] = "\n".join(row.replace(" | ", "\n") for row in rows)
    return readings


def page_label(pages):
    return f"p. {pages[0]}" if len(pages) == 1 else f"pp. {pages[0]}–{pages[-1]}"


def make_records(scan_dir):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    scans = manifest["scanSha256"]
    if set(scans) != EXPECTED_SCANS:
        raise ValueError("Unexpected reviewed scans")
    for name, expected in scans.items():
        if digest_file(scan_dir / name) != expected:
            raise ValueError(f"The reviewed scan has changed: {name}")
    items = manifest["poems"]
    if tuple(item["slug"] for item in items) != EXPECTED_SLUGS:
        raise ValueError("Unexpected reviewed selection")
    readings = reading_texts()
    records = []
    for item in items:
        slug = item["slug"]
        text = readings[slug]
        pages = item["printedPages"]
        if (
            not pages
            or pages != list(range(pages[0], pages[-1] + 1))
            or item["tunisPdfPages"] != [page + 4 for page in pages]
            or item["bsbImages"] != [177 - page for page in pages]
            or len(text.split("\n")) != 2 * item["couplets"]
            or hashlib.sha256(text.encode("utf8")).hexdigest() != item["textSha256"]
        ):
            raise ValueError(f"Unexpected reviewed source or transcription: {slug}")
        comparison_source = item["comparison"]
        comparison_title = "al-Dīwān · online comparison, source edition not established"
        if len(pages) > 1:
            comparison_source = IMAGE.format(item["bsbImages"][1])
            comparison_title = f"Bayerische Staatsbibliothek · continuation, p. {pages[1]}"
        records.append({
            "id": f"qabadu-tunis-{slug}",
            "title": text.split("\n")[0],
            "author": "Mahmud Qabadu",
            "authorOriginal": "محمود قابادو",
            "authorId": "mahmud-qabadu",
            "authorYears": "c. 1815–1871",
            "country": "Tunisia",
            "language": "Arabic",
            "lang": "ar",
            "direction": "rtl",
            "year": None,
            "yearLabel": "19th century · exact year not established here",
            "era": "19th century",
            "form": "Poetry",
            "collection": "Dīwān Maḥmūd Qābāḍū, volume 1",
            "themes": [],
            "mood": "sand",
            "context": (
                "A separately headed work by Maḥmūd Qābāḍū in the Tunis printing "
                f"of his dīwān, {item['couplets']} couplets as bounded in that printing. "
                "The Tunisian National Library and Bavarian State Library scans are copies "
                "of the same typesetting, not independent editions. An online comparison "
                "presents the same count, but its source edition is not established; "
                "these boundaries do not establish every textual tradition. The reading "
                "omits vowel marks and decorative dividers, normalizes spacing and some "
                "spelling, and places printed half-lines separately. Tunisia is associated "
                "with the poet, not asserted as a composition place. " + item["note"]
            ),
            "contextSource": comparison_source,
            "contextSourceTitle": comparison_title,
            "sourceTitle": (
                "Bayerische Staatsbibliothek · Dīwān Maḥmūd Qābāḍū, vol. 1 "
                "(1294 AH / 1877–78), " + page_label(pages)
            ),
            "source": IMAGE.format(item["bsbImages"][0]),
            "rights": (
                "The historical original and pre-1931 printing are public domain in the "
                "United States; check local law. The Bavarian library marks its linked "
                "digital images NoC-NC; the scans are linked, not republished. Consult "
                "the library's conditions before reusing its images."
            ),
            "text": text,
            "translations": [],
        })
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scan_dir", type=Path, help="directory containing the six reviewed scan files")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(make_records(args.scan_dir), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Records differ from the reviewed transcriptions")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

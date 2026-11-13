#!/usr/bin/env python3
"""Reproduce reviewed Martí poems from pinned facsimile and comparison evidence."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/marti-1891-reviewed.json"
OUTPUT = ROOT / "content/poems/marti-1891-reviewed.json"
COMPARISON = ROOT / "scripts/sources/marti-1891-wikisource.json"
ROMANS = (
    "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV",
    "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI", "XXII", "XXIII", "XXIV", "XXV", "XXVI",
    "XXVII", "XXVIII", "XXIX", "XXX", "XXXI", "XXXII", "XXXIII", "XXXIV", "XXXV", "XXXVI",
    "XXXVII", "XXXVIII", "XXXIX", "XL", "XLI", "XLII", "XLIII", "XLIV", "XLV", "XLVI",
)
SPANS = (
    (17, 20), (21, 21), (22, 24), (25, 26), (27, 27), (28, 28), (29, 30), (31, 32),
    (33, 34), (35, 37), (38, 39), (40, 40), (41, 41), (42, 42), (43, 43), (44, 44),
    (45, 46), (47, 47), (48, 48), (49, 49), (50, 51), (52, 52), (53, 53), (54, 54),
    (55, 55), (56, 56), (57, 58), (59, 59), (60, 60), (61, 62), (63, 63), (64, 64),
    (65, 66), (67, 67), (68, 68), (69, 69), (70, 70), (71, 71), (72, 72), (73, 73),
    (74, 74), (75, 75), (76, 76), (77, 77), (78, 79), (80, 82),
)
LINE_COUNTS = (
    72, 16, 48, 36, 16, 12, 32, 24, 36, 52, 20, 8, 16, 8, 16, 8, 28, 12, 12, 8, 20, 12,
    8, 12, 8, 8, 24, 12, 8, 20, 16, 16, 20, 12, 8, 8, 8, 12, 8, 8, 12, 16, 18, 16, 38, 44,
)
IMAGE_NUMBERS = (9, *range(17, 85))


def digest(data):
    return hashlib.sha256(data).hexdigest()


def folded(text):
    normalized = unicodedata.normalize("NFD", text.casefold())
    return "".join(c for c in normalized if c.isalnum() and not unicodedata.combining(c))


def comparison_pages(data):
    pages = json.loads(data)["query"]["pages"]
    if len(pages) != 46:
        raise ValueError("Unexpected comparison page count")
    result = {}
    for page in pages:
        title = page["title"]
        if not title.startswith("Versos sencillos/"):
            raise ValueError("Unexpected comparison title")
        label = title.removeprefix("Versos sencillos/")
        if label not in ROMANS or label in result or len(page["revisions"]) != 1:
            raise ValueError("Unexpected comparison selection")
        revision = page["revisions"][0]
        source = revision["slots"]["main"]["content"]
        poem = re.search(r"<poem[^>]*>(.*?)</poem>", source, re.DOTALL | re.IGNORECASE)
        if "|autor=José Martí" not in source or not poem:
            raise ValueError(f"Missing comparison attribution or poem: {label}")
        result[label] = (revision["revid"], poem.group(1).strip())
    return result


def make_records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    images = manifest["imageSha256"]
    if set(images) != {str(number) for number in IMAGE_NUMBERS}:
        raise ValueError("Unexpected facsimile image selection")
    for number in IMAGE_NUMBERS:
        if digest((directory / f"page-{number:02}.jpg").read_bytes()) != images[str(number)]:
            raise ValueError(f"Historical image changed: {number}")
    comparison = COMPARISON.read_bytes()
    if digest(comparison) != manifest["comparisonSha256"]:
        raise ValueError("Comparison snapshot changed")
    pages = comparison_pages(comparison)
    items = manifest["poems"]
    expected = [
        (number, ROMANS[number - 1], *SPANS[number - 1])
        for number in range(1, 47) if number != 39
    ]
    actual = [(p["number"], p["roman"], p["firstImage"], p["lastImage"]) for p in items]
    if actual != expected:
        raise ValueError("Unexpected reviewed selection, image span or order")
    if len({item["text"] for item in items}) != len(items):
        raise ValueError("Duplicate reviewed poem")

    records = []
    for item in items:
        number, label = item["number"], item["roman"]
        revision, comparison_text = pages[label]
        if revision != item["comparisonRevision"]:
            raise ValueError(f"Comparison revision changed: {label}")
        text = item["text"]
        lines = text.splitlines()
        nonempty = [line for line in lines if line]
        if (text != text.strip() or any(line != line.strip() for line in lines)
                or "\n\n\n" in text or len(nonempty) != LINE_COUNTS[number - 1]):
            raise ValueError(f"Incomplete or malformed poem: {label}")
        if not folded(comparison_text).startswith(folded(nonempty[0])):
            raise ValueError(f"Unexpected opening: {label}")
        first, last = item["firstImage"], item["lastImage"]
        printed_pages = f"{first - 6}" if first == last else f"{first - 6}–{last - 6}"
        image_span = f"image {first}" if first == last else f"images {first}–{last}"
        context = (
            f"Poem {label} of Martí’s Versos sencillos, published in New York in 1891. "
            "This complete text is adapted from the linked Spanish Wikisource transcription and "
            "collated against the 1891 printing. Accents and punctuation are modernized or normalized; "
            "some historical spellings remain. The facsimile link opens the first page of the poem. "
            "The publication year does not establish the date or place of composition."
        )
        if item.get("note"):
            context += " " + item["note"]
        records.append({
            "id": f"marti-versos-sencillos-{number:03}",
            "title": f"Versos sencillos {label} · {nonempty[0].rstrip(',:;.!?¡¿—– ')}",
            "author": "José Martí", "authorId": "jose-marti", "authorYears": "1853–1895",
            "country": "Cuba", "language": "Spanish", "lang": "es", "direction": "ltr",
            "year": 1891, "yearLabel": "Published 1891", "era": "Modernismo",
            "form": "Verse", "collection": "Versos sencillos", "themes": [], "mood": "paper",
            "context": context,
            "contextSource": (
                "https://es.wikisource.org/w/index.php?title="
                f"{quote('Versos sencillos/' + label, safe='')}&oldid={revision}"
            ),
            "contextSourceTitle": f"Spanish Wikisource contributors · {label}, revision {revision}",
            "sourceTitle": f"Martí · Versos sencillos (1891), pp. {printed_pages} ({image_span})",
            "source": f"https://www.poesi.as/JoseMartiVersosSencillos-{first:02}foto.htm",
            "rights": (
                "Historical original published in 1891; public domain in the United States. "
                "Modernized transcription adapted from Spanish Wikisource contributors, CC BY-SA 4.0 "
                "(https://creativecommons.org/licenses/by-sa/4.0/), and altered against the 1891 printing. "
                "See the linked revision for attribution and check local law before reuse."
            ),
            "text": text, "translations": [],
        })
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory with the pinned page-NN.jpg facsimile images")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(make_records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Committed records differ from the reviewed transcriptions")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Reproduce complete, scan-reviewed poems from Darío's 1896 first edition."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/dario-1896-readings.txt"
OUTPUT = ROOT / "content/poems/dario-1896-reviewed.json"
PDF = "prosas-1896.pdf"
OCR = "prosas-1896-ocr.txt"
PDF_SHA = "a2330ec5c439fd11f761dfc39e491e8150de61ce67582c278026852ac8c32e4f"
OCR_SHA = "974ee89f399dd5ad89f5c7ddadece9bc1824341f18a106ab0abb03f7e4ad415c"
READINGS_SHA = "af274d9b0ea6c23790835a72105f72b0c207bd038d0e5ba72fc7c8618dbed57a"
PDF_URL = "https://archive.org/download/prosasprofanasyo00daro/prosasprofanasyo00daro.pdf"
SELECTION = (
    ("sonatina", "Sonatina", 45, 48, 48),
    ("blason", "Blasón", 49, 52, 36),
    ("del-campo", "Del campo", 53, 55, 32),
    ("ojos-negros-julia", "Alaba los ojos negros de Julia", 57, 59, 24),
    ("para-una-cubana", "Para una cubana", 67, 68, 14),
    ("para-la-misma", "Para la misma", 69, 70, 14),
    ("bouquet", "Bouquet", 71, 72, 20),
    ("margarita", "Margarita", 85, 86, 14),
    ("mia", "Mía", 87, 88, 14),
    ("dice-mia", "Dice Mía", 89, 90, 11),
    ("heraldos", "Heraldos", 91, 92, 19),
    ("ite-misa-est", "Ite misa est", 93, 94, 14),
)
NOTES = {
    "sonatina": (
        "The 1896 print has ‘pavos-reales’; the linked Wikisource transcription has ‘pavos reales’. "
        "Its header labels a 1917 edition, so it is a comparison rather than the 1896 witness."
    ),
    "blason": "The printing dedicates the poem ‘Para la condesa de Peralta’; the dedication is not a verse line.",
    "del-campo": "The print spells ‘ginete’; the linked modern transcription has ‘jinete’.",
    "para-una-cubana": "The print spells ‘finje’; the linked modern transcription has ‘finge’.",
    "margarita": "The printed heading includes ‘In memoriam’; it is not a verse line.",
    "ite-misa-est": (
        "The print titles this ‘Ite misa est’, dedicates it to Reynaldo de Rafael, and reads ‘convalesciente’; "
        "the linked modern transcription is titled ‘Ite, missa est’ and reads ‘convaleciente’."
    ),
}
COMPARISONS = {
    "sonatina": ("https://es.wikisource.org/w/index.php?title=Sonatina&oldid=1321030", "Spanish Wikisource · Sonatina (comparison)"),
    "del-campo": ("https://ciudadseva.com/texto/del-campo/", "Ciudad Seva · Del campo (modern comparison)"),
    "para-una-cubana": ("https://www.poesi.as/rd06pp009.htm", "Poesi.as · Para una cubana (modern comparison)"),
    "ite-misa-est": ("https://ciudadseva.com/texto/ite-missa-est/", "Ciudad Seva · Ite, missa est (modern comparison)"),
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def make_records(directory):
    if digest((directory / PDF).read_bytes()) != PDF_SHA:
        raise ValueError("Historical PDF changed")
    if digest((directory / OCR).read_bytes()) != OCR_SHA:
        raise ValueError("OCR evidence changed")
    raw = READINGS.read_bytes()
    if digest(raw) != READINGS_SHA:
        raise ValueError("Reviewed readings changed")
    pieces = re.split(r"(?m)^@@ ([a-z0-9-]+)\n", raw.decode("utf8"))
    if pieces[0] or len(pieces) != 2 * len(SELECTION) + 1:
        raise ValueError("Unexpected reading boundaries")
    readings = [(pieces[index], pieces[index + 1].strip()) for index in range(1, len(pieces), 2)]
    if [slug for slug, _ in readings] != [item[0] for item in SELECTION]:
        raise ValueError("Unexpected selection or order")
    if len({text for _, text in readings}) != len(readings):
        raise ValueError("Duplicate reviewed poem")

    records = []
    for (slug, title, first, last, expected_lines), (_, text) in zip(SELECTION, readings, strict=True):
        lines = text.splitlines()
        if (any(line != line.strip() for line in lines) or "\n\n\n" in text
                or len([line for line in lines if line]) != expected_lines):
            raise ValueError(f"Incomplete or malformed poem: {slug}")
        context = (
            "A complete poem in Rubén Darío’s Prosas profanas y otros poemas, published in Buenos Aires in 1896. "
            "This reading follows the linked first-edition scan, preserving historical spelling and punctuation "
            "while normalizing spacing, quotation marks and indentation; italics are not represented. "
            "The publication year does not establish the date or place of composition."
        )
        if slug in NOTES:
            context += " " + NOTES[slug]
        record = {
            "id": f"dario-1896-{slug}", "title": title,
            "author": "Rubén Darío", "authorId": "ruben-dario", "authorYears": "1867–1916",
            "country": "Nicaragua", "language": "Spanish", "lang": "es", "direction": "ltr",
            "year": 1896, "yearLabel": "Published 1896", "era": "Modernismo",
            "form": "Verse", "collection": "Prosas profanas y otros poemas", "themes": [], "mood": "paper",
            "context": context,
            "sourceTitle": f"Darío · Prosas profanas (1896), PDF pp. {first}–{last}",
            "source": f"{PDF_URL}#page={first}",
            "rights": (
                "Historical original published in 1896; public domain in the United States. "
                "The scan is linked, not republished; its image-reuse terms are not established here. "
                "Check local law before reuse."
            ),
            "text": text, "translations": [],
        }
        if slug == "ite-misa-est":
            record["displayTitle"] = "Ite, missa est"
            record["displayTitleLang"] = "la"
        if slug in COMPARISONS:
            record["contextSource"], record["contextSourceTitle"] = COMPARISONS[slug]
        records.append(record)
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the pinned PDF and OCR text")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(make_records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Committed records differ from the reviewed readings")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

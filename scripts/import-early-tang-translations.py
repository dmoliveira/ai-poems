#!/usr/bin/env python3
"""Reproduce reviewed 1862–1909 translations of existing Chinese poems."""

import argparse
import hashlib
import json
import re
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/early-tang-translation-readings.txt"
OUTPUT = ROOT / "content/early-tang-translations.mjs"
READINGS_SHA256 = "8fd67230c36a37ef02c4cf9653d7952744afae52d4845c9e6f1c33a5edf20703"
EVIDENCE = {
    "hervey-thang-1862.pdf": "60baa37f3ee772de6bb77fd751bdf3c6a5256305f7fe7c4b6e8951670fa279ca",
    "hervey-thang-1862-ocr.xml": "4b1212cb915e968df6395230741a8fb9cc559c44c3c6e4ef7889241608a90218",
    "giles-gems-1884.pdf": "8273aaf0a6f9794bccd657bd6e432fc4bf6ffb8d6d6eec4992c86e6ae6bb1713",
    "giles-gems-1884-ocr.xml": "d5eb9992a7606464e1b5d93138de1e516f51cd5e6403797d094d9964aed45e75",
    "lutejade-1909-london.pdf": "54c3454ab1332b04aa2a3f746df5636af757e228abc1abd05d3520ae64b4e73f",
    "lutejade-1909-london-ocr.xml": "b4f4d046387dbc4da7060ed64d1e3a89cc5a3fb148fbbfd291a22a691b5a7fb7",
    "gutenberg-390.txt": "afa6f9f0b62006fc41d6aa50fea47ea388fa01af72f0105d1d79f591753b4b44",
}
HERVEY = "https://archive.org/download/bub_gb_4vQSL2JfTZMC/bub_gb_4vQSL2JfTZMC.pdf"
GILES = "https://archive.org/download/gemsofchineselit00gilerich/gemsofchineselit00gilerich.pdf"
CRANMER = "https://archive.org/download/lutejade00cran/lutejade00cran.pdf"

# OCR is only a comparison aid. The readings and boundaries were checked
# visually against the separately pinned pages, including titles and notes.
SELECTION = (
    {
        "key": "tang-020-fr", "id": "tang-020", "language": "French",
        "title": "Le poète attend son ami Ting-Kong dans une grotte du mont Nié-Chy",
        "translator": "Léon d’Hervey de Saint-Denys · Paris 1862",
        "source": HERVEY + "#page=325", "ocr": "hervey-thang-1862-ocr.xml", "pages": (325,),
        "first": "Le soleil-a franchi", "last": "sentiers herbeux.", "corrections": (), "joins": 1,
        "stanzas": (4, 4),
        "sha256": "2b7160e0ccc191750ea5cc3b5dceb91ccd293e5ecf3925ecde8402a2da069c7b",
        "note": (
            "The translator’s Chinese source edition is not established here. His title names "
            "Ting-Kong and a particular cave and mountain; their exact relationship to the "
            "displayed Chinese title is not established."
        ),
    },
    {
        "key": "tang-020-en", "id": "tang-020", "language": "English",
        "title": "A Friend Expected", "translator": "L. Cranmer-Byng · London 1909",
        "source": CRANMER + "#page=48", "ocr": "lutejade-1909-london-ocr.xml", "pages": (48, 49),
        "first": "Over the chain of giant peaks.", "last": "Through the fragrant, dew-lit ways",
        "corrections": (("A. FRIEND EXPECTED 45", ""),), "joins": 0, "stanzas": (4, 4, 4, 4),
        "sha256": "558110adc7f5e86aa5f8c6121a8ad14765e412a1dba95d6ae91211514de31438",
        "note": (
            "Cranmer-Byng says his book draws largely on earlier English and French translations. "
            "His version resembles Hervey de Saint-Denys’s 1862 French rendering of this poem, "
            "but does not name its individual source. His Chinese source edition is not established. "
            "‘Lure him on’ is an interpretation; the displayed Chinese waits with a zither."
        ),
    },
    {
        "key": "tang-128-fr", "id": "tang-128", "language": "French",
        "title": "Visite à un ami dans sa maison de campagne",
        "translator": "Léon d’Hervey de Saint-Denys · Paris 1862",
        "source": HERVEY + "#page=323", "ocr": "hervey-thang-1862-ocr.xml", "pages": (323,),
        "first": "La ancien ami", "last": "vous*", "joins": 2,
        "corrections": (
            ("La ancien ami m’oilïe", "Un ancien ami m’offre"), ("11 m’invite", "Il m’invite"),
            ("verte ceinture f", "verte ceinture ;"), ("l’automne (a>", "l’automne"),
        ),
        "stanzas": (4, 4),
        "sha256": "21335adca8fb397531e2904d9cd284df3b8861270427717853464f17c2d1935e",
        "note": (
            "The translator’s Chinese source edition is not established. His ‘riz’ (rice) differs "
            "from the displayed ‘黍’ (millet); his note explains the autumn festival as the ninth "
            "day of the ninth month. His identification of the friend as Wang Wei is not "
            "established here."
        ),
    },
    {
        "key": "tang-041-en", "id": "tang-041", "language": "English",
        "title": "The Grass-Widow’s Song", "translator": "Herbert A. Giles · London and Shanghai 1884",
        "source": GILES + "#page=131", "ocr": "giles-gems-1884-ocr.xml", "pages": (131,),
        "first": "Beneath the light", "last": "And the return of my husband from the wars.",
        "corrections": (), "joins": 0, "stanzas": (6,),
        "sha256": "512a22b636a7b6486996aa37bf4430343abaca643841bb7d1330e989805727d9",
        "note": (
            "The translator’s Chinese source edition is not established. His ‘crescent’, ‘Kansuh’ "
            "and ‘Tartars’ are not explicit in the displayed Chinese; the historical ethnonym is "
            "retained as printed, not endorsed."
        ),
    },
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def reading_sections(raw, selection=SELECTION):
    parts = re.split(r"^=== ([a-z0-9-]+) ===\n", raw.decode("utf8"), flags=re.MULTILINE)
    if parts.pop(0) or len(parts) != len(selection) * 2:
        raise ValueError("Unexpected reading sections")
    entries = [(parts[i], parts[i + 1].strip()) for i in range(0, len(parts), 2)]
    if tuple(key for key, _ in entries) != tuple(row["key"] for row in selection):
        raise ValueError("Unexpected reading order")
    for row, (_, text) in zip(selection, entries, strict=True):
        if tuple(len(stanza.splitlines()) for stanza in text.split("\n\n")) != row["stanzas"]:
            raise ValueError(f"Unexpected reading boundaries: {row['key']}")
        if digest(text.encode("utf8")) != row["sha256"]:
            raise ValueError(f"Reviewed reading changed: {row['key']}")
    return entries


def normalize_words(text):
    return "".join(char for char in unicodedata.normalize("NFKD", text).casefold() if char.isalnum())


def excerpt(text, first, last):
    if text.count(first) != 1 or text.count(last) != 1:
        raise ValueError("Unexpected source boundaries")
    start = text.index(first)
    end = text.index(last) + len(last)
    if end <= start:
        raise ValueError("Unexpected source boundaries")
    return text[start:end]


def ocr_pages(data, pages):
    objects = ET.fromstring(data).findall(".//OBJECT")
    if not pages or tuple(sorted(set(pages))) != pages or any(page < 1 or page > len(objects) for page in pages):
        raise ValueError("Unexpected OCR page range")
    return "\n".join(
        " ".join("".join(word.itertext()).strip() for word in line.iter("WORD"))
        for page in pages for line in objects[page - 1].iter("LINE")
    )


def compare_ocr(source, text, row):
    source = excerpt(source, row["first"], row["last"])
    for old, new in row["corrections"]:
        if source.count(old) != 1:
            raise ValueError(f"Unexpected OCR correction: {row['key']}")
        source = source.replace(old, new, 1)
    if source.count("-\n") != row["joins"]:
        raise ValueError(f"Unexpected OCR line wraps: {row['key']}")
    source = source.replace("-\n", "")
    if normalize_words(source) != normalize_words(text):
        raise ValueError(f"OCR comparison differs: {row['key']}")


def records(directory):
    evidence = {name: (directory / name).read_bytes() for name in EVIDENCE}
    for name, expected in EVIDENCE.items():
        if digest(evidence[name]) != expected:
            raise ValueError(f"Reviewed evidence changed: {name}")
    readings = READINGS.read_bytes()
    if digest(readings) != READINGS_SHA256:
        raise ValueError("Reviewed readings changed")
    entries = reading_sections(readings, SELECTION)
    result = {}
    for row, (_, text) in zip(SELECTION, entries, strict=True):
        compare_ocr(ocr_pages(evidence[row["ocr"]], row["pages"]), text, row)
        if row["key"] == "tang-020-en":
            other = evidence["gutenberg-390.txt"].decode("utf8")
            other = excerpt(other, "Over the chain of giant peaks", "Through the fragrant, dew-lit ways")
            if normalize_words(other) != normalize_words(text):
                raise ValueError("Gutenberg comparison differs")
        rights = (
            "This historical translation is public domain in the United States; check local law. "
            "Its interpretation is not a claim of an exact match to the displayed Chinese edition. " + row["note"]
        )
        translations = result.setdefault(row["id"], [])
        if any(item["language"] == row["language"] for item in translations):
            raise ValueError(f"Duplicate selected language: {row['id']}")
        translations.append({
            "language": row["language"], "title": row["title"], "text": text,
            "translator": row["translator"], "source": row["source"], "rights": rights,
        })
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the reviewed evidence files")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = (
        "// Generated by scripts/import-early-tang-translations.py from reviewed historical editions.\n"
        + "export const earlyTangTranslations = "
        + json.dumps(records(args.directory), ensure_ascii=False, indent=2)
        + ";\n"
    )
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Translations differ from the reviewed readings")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

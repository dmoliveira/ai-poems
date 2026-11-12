#!/usr/bin/env python3
"""Reproduce two scan-reviewed historical versions of Li Bai's Quiet Night Thought."""

import argparse
import hashlib
import json
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "content/quiet-night-translations.mjs"
EVIDENCE = {
    "lutejade-1909-london.pdf": "54c3454ab1332b04aa2a3f746df5636af757e228abc1abd05d3520ae64b4e73f",
    "lutejade-1909-london-ocr.xml": "b4f4d046387dbc4da7060ed64d1e3a89cc5a3fb148fbbfd291a22a691b5a7fb7",
    "gutenberg-390.txt": "afa6f9f0b62006fc41d6aa50fea47ea388fa01af72f0105d1d79f591753b4b44",
    "obata-li-po-1923-london.pdf": "371baac09c51b02fc4a2443b0445a23b453532dc75b1c2ebd13c568de03d86ad",
    "obata-li-po-1923-ocr.xml": "949871796a39b8196ca5bc09e9d473c0627123afc8d2d4b47975dd18e3b3b5f6",
}
SELECTION = (
    {
        "key": "cranmer-byng-1909", "title": "Thoughts in a Tranquil Night",
        "translator": "L. Cranmer-Byng · London 1909",
        "source": "https://archive.org/download/lutejade00cran/lutejade00cran.pdf#page=65",
        "ocr": "lutejade-1909-london-ocr.xml", "pages": (65, 66),
        "start": "THOUGHTS IN A TRANQUIL NIGHT", "end": "THE GUILD OF GOOD-FELLOWSHIP",
        "corrections": (("62 LI PO", ""),),
        "lines": (
            "      Athwart the bed", "  I watch the moonbeams cast a trail", "    So bright, so cold, so frail,",
            "      That for a space it gleams", "Like hoar-frost on the margin of my dreams.",
            "         I raise my head,—", "      The splendid moon I see:", "         Then droop my head,",
            "      And sink to dreams of thee—", "      My Fatherland, of thee!",
        ),
        "sha256": "9fd589ea2a8098ef0c6b18d9381b2ed7a311fa46506d68d0c81928cd72e6e700",
        "note": (
            "The dream imagery and address to the fatherland elaborate the displayed Chinese. "
            "Cranmer-Byng acknowledged drawing on earlier translations but did not identify this version’s "
            "individual source; his Chinese working edition is not established."
        ),
    },
    {
        "key": "obata-1923", "title": "On a Quiet Night",
        "translator": "Shigeyoshi Obata · London and Toronto 1923",
        "source": "https://archive.org/download/worksoflipochine00libauoft/worksoflipochine00libauoft.pdf#page=81",
        "ocr": "obata-li-po-1923-ocr.xml", "pages": (81,),
        "start": "27. ON A QUIET NIGHT", "end": "[55]",
        "corrections": ((" jfc?", ""), (" ^J^", "")),
        "lines": (
            "I saw the moonlight before my couch,", "And wondered if it were not the frost on the ground.",
            "I raised my head and looked out on the mountain moon;", "I bowed my head and thought of my far-off home.",
        ),
        "sha256": "0ba69e9b6b333e7985afd7cf683e28c9bd230f7a771758c8dba64c68dbfafcc2",
        "note": (
            "‘Mountain moon’ differs from the displayed 明月 (bright moon) and is consistent with an "
            "attested 山月 variant; Obata’s specific Chinese working edition is not established."
        ),
    },
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def normalize_words(text):
    return "".join(char for char in unicodedata.normalize("NFKD", text).casefold() if char.isalnum())


def between(text, start, end):
    if text.count(start) != 1 or text.count(end) != 1:
        raise ValueError("Unexpected source boundaries")
    first, last = text.index(start) + len(start), text.index(end)
    if first > last:
        raise ValueError("Unexpected source boundaries")
    return text[first:last]


def ocr_pages(data, pages):
    objects = ET.fromstring(data).findall(".//OBJECT")
    if not pages or tuple(sorted(set(pages))) != pages or any(page < 1 or page > len(objects) for page in pages):
        raise ValueError("Unexpected OCR page range")
    return "\n".join(
        " ".join("".join(word.itertext()).strip() for word in line.iter("WORD"))
        for page in pages for line in objects[page - 1].iter("LINE")
    )


def reading(source, row):
    section = between(source, row["start"], row["end"])
    for old, new in row["corrections"]:
        if section.count(old) != 1:
            raise ValueError(f"Unexpected OCR correction: {row['key']}")
        section = section.replace(old, new, 1)
    text = "\n".join(row["lines"])
    if digest(text.encode("utf8")) != row["sha256"]:
        raise ValueError(f"Reviewed reading changed: {row['key']}")
    if normalize_words(section) != normalize_words(text):
        raise ValueError(f"OCR comparison differs: {row['key']}")
    return text


def records(directory):
    evidence = {name: (directory / name).read_bytes() for name in EVIDENCE}
    for name, expected in EVIDENCE.items():
        if digest(evidence[name]) != expected:
            raise ValueError(f"Reviewed evidence changed: {name}")
    result = []
    seen = set()
    for row in SELECTION:
        if row["key"] in seen:
            raise ValueError("Duplicate selected reading")
        seen.add(row["key"])
        text = reading(ocr_pages(evidence[row["ocr"]], row["pages"]), row)
        if row["key"] == "cranmer-byng-1909":
            source = evidence["gutenberg-390.txt"].decode("utf8")
            other = between(source, "Athwart the bed", "My Fatherland, of thee!")
            other = "Athwart the bed" + other + "My Fatherland, of thee!"
            if normalize_words(other) != normalize_words(text):
                raise ValueError("Gutenberg comparison differs")
        result.append({
            "language": "English", "title": row["title"], "text": text,
            "translator": row["translator"], "source": row["source"],
            "rights": (
                "This historical version is public domain in the United States; check local law. "
                "It is an interpretation, not a claim of an exact match to the displayed Chinese. " + row["note"]
            ),
        })
    return {"quiet-night-thought-li-bai": result}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing reviewed sources")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = (
        "// Generated by scripts/import-quiet-night-translations.py from reviewed historical editions.\n"
        + "export const quietNightTranslations = "
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

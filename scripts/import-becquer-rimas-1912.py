#!/usr/bin/env python3
"""Reproduce the Bécquer selection from the pinned Gutenberg transcription."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "content/poems/becquer-rimas-1912.json"
EVIDENCE = {
    "gutenberg-53552.txt": "4304d5f9ab8c7ffe43566b45a34a33aff5e833313928299a7efef71b3e6e4d4b",
    "obrasescogidas-1912.pdf": "d1a6bb7de593306030f11cc688e0e6a6e364fabedd789d7bb4a24db126c22e5a",
    "becquer-obras-1885-vol3.pdf": "66a63f2d7a5e6619d629604795b72b99822e6cc21e815b6c37f91ab480298137",
}
READINGS_SHA256 = "7af27ae91d74becf428a7463807cd47e63b69aece4cddb4c7aab9c95cc10b59d"
# Printed page ranges for all 76 numbered poems, including the two excluded
# duplicates. PDF page numbers for this part of the 1912 copy are page + 20.
PAGES = (
    (297, 297), (297, 298), (298, 300), (301, 302), (302, 305), (305, 305),
    (305, 305), (306, 306), (306, 307), (307, 307), (307, 307), (308, 309),
    (309, 310), (310, 310), (310, 311), (311, 312), (312, 312), (312, 312),
    (313, 313), (313, 313), (313, 313), (313, 313), (314, 314), (314, 314),
    (315, 316), (316, 316), (316, 317), (318, 318), (319, 319), (320, 320),
    (320, 320), (320, 321), (321, 321), (321, 322), (322, 322), (322, 322),
    (322, 323), (323, 323), (324, 324), (324, 325), (325, 325), (326, 326),
    (326, 326), (327, 327), (327, 327), (328, 328), (328, 328), (328, 329),
    (329, 329), (329, 329), (330, 330), (330, 330), (331, 331), (332, 332),
    (332, 332), (333, 333), (334, 334), (334, 334), (335, 335), (335, 335),
    (336, 336), (337, 337), (337, 337), (337, 338), (338, 338), (338, 339),
    (339, 339), (339, 340), (340, 340), (340, 341), (342, 342), (343, 344),
    (344, 347), (347, 347), (348, 348), (349, 350),
)
EXCLUDED = {7, 73}  # Existing castellana-095 and castellana-096, respectively.
DOTTED = {29, 40, 71, 72, 76}
SCAN = "https://archive.org/download/obrasescogidas00bcqu/obrasescogidas00bcqu.pdf"
GUTENBERG = "https://www.gutenberg.org/files/53552/53552-h/53552-h.htm"
RIGHTS = (
    "Historical original and 1912 printing are public domain in the United States; "
    "check local law. Project Gutenberg credits Josep Cols Canals, Ramon Pajares Box "
    "and the Online Distributed Proofreading Team for this transcription."
)


def digest(value):
    return hashlib.sha256(value).hexdigest()


def roman(number):
    result = ""
    for value, numeral in ((50, "L"), (40, "XL"), (10, "X"), (9, "IX"),
                           (5, "V"), (4, "IV"), (1, "I")):
        count, number = divmod(number, value)
        result += numeral * count
    return result


def extract(book):
    start = book.index("\nRIMAS\n")
    end = book.index("\nFIN\n", start)
    section = book[start:end]
    heads = list(re.finditer(r"(?m)^([IVXLCDM]+)[ \t]*$", section))
    if [head.group(1) for head in heads] != [roman(i) for i in range(1, 77)]:
        raise ValueError("Unexpected Rimas headings or order")
    index = book[book.index("\nÍNDICE\n", end):]
    entries = re.findall(r"(?m)^\s+([IVXLCDM]+)\.\s+(.+?)\s+(\d+)\s*$", index)
    if len(entries) != 76 or any(
        numeral != roman(i) or int(page) != PAGES[i - 1][0]
        for i, (numeral, _, page) in enumerate(entries, 1)
    ):
        raise ValueError("Unexpected printed contents or page mappings")
    poems = []
    for i, head in enumerate(heads):
        raw = section[head.end():heads[i + 1].start() if i + 1 < len(heads) else len(section)]
        paragraphs = []
        for paragraph in re.split(r"\n\s*\n", raw.strip()):
            lines = [line.strip().replace("_", "").replace("--", "—")
                     for line in paragraph.splitlines()]
            lines = [line for line in lines if line and line != "[Ilustración]"]
            # Gutenberg represents the printed divider in III with asterisks;
            # retain the division as whitespace, not as a line of poetry.
            if lines and not (i == 2 and lines == ["*       *       *       *       *"]):
                paragraphs.append("\n".join(lines))
        text = "\n\n".join(paragraphs)
        if not text:
            raise ValueError(f"Empty poem: {i + 1}")
        poems.append(text)
    return poems


def make_records(directory):
    for name, expected in EVIDENCE.items():
        if digest((directory / name).read_bytes()) != expected:
            raise ValueError(f"Reviewed evidence changed: {name}")
    book = (directory / "gutenberg-53552.txt").read_text(encoding="utf8")
    texts = extract(book)
    chosen = [text for i, text in enumerate(texts, 1) if i not in EXCLUDED]
    if digest("\n===\n".join(chosen).encode("utf8")) != READINGS_SHA256:
        raise ValueError("Extracted readings changed")
    records = []
    for number, text in enumerate(texts, 1):
        if number in EXCLUDED:
            continue
        numeral = roman(number)
        first, last = PAGES[number - 1]
        page_label = str(first) if first == last else f"{first}–{last}"
        first_line = next(line for line in text.splitlines()
                          if line.strip() and line not in ("PRIMERA VOZ", "SEGUNDA VOZ", "TERCERA VOZ"))
        title_line = first_line.lstrip("—").rstrip(" ,;:.")
        context = (
            f"Rima {numeral} in the 1912 Madrid Obras escogidas, pp. {page_label}; "
            "the numbering belongs to this edition. The Gutenberg transcription was compared "
            "in order with OCR of the linked scan, with exceptional readings and printed "
            "breaks checked visually. Completeness refers to this printing, not every witness. "
            "Gutenberg says it silently corrected obvious printing errors and normalized "
            "inconsistent spellings; this is not a diplomatic transcription. Indentation and "
            "italics are omitted and dialogue dashes normalized. Spain is associated with the "
            "poet, not an assertion of this poem's composition place or date."
        )
        if number == 3:
            context += " The printed section divider is represented by a blank line."
        if number in DOTTED:
            context += (
                " Dotted rows are printed within this numbered poem and also appear in the "
                "1885 edition; their significance is not established here."
            )
        if number == 29:
            context += " The 1912 text reads ‘entrambos’; the 1885 printing has ‘ambos’."
        if number == 72:
            context += " The three voice headings are retained as part of this single poem."
        records.append({
            "id": f"becquer-rima-{number:03d}",
            "title": f"Rima {numeral} · {title_line}",
            "author": "Gustavo A. Bécquer",
            "authorId": "gustavo-a-becquer",
            "authorOriginal": "Gustavo Adolfo Bécquer",
            "authorYears": "1836–1870",
            "country": "Spain",
            "language": "Spanish",
            "lang": "es",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Printed 1912 · composition date not established",
            "era": "Date not established",
            "form": "Poetry",
            "collection": "Rimas · Obras escogidas, 1912",
            "themes": [],
            "mood": "paper",
            "context": context,
            "contextSource": f"{SCAN}#page={first + 20}",
            "contextSourceTitle": f"Internet Archive · 1912 scan, pp. {page_label}",
            "sourceTitle": f"Project Gutenberg · Obras escogidas, Rima {numeral}",
            "source": f"{GUTENBERG}#Rima_{numeral}",
            "rights": RIGHTS,
            "text": text,
            "translations": [],
        })
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the reviewed evidence")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(make_records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Records differ from the reviewed readings")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

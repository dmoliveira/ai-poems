#!/usr/bin/env python3
"""Reproduce a source-reviewed selection of Camões sonnets."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "content/poems/camoes-sonnets-1843.json"
EVIDENCE = {
    "gutenberg-31509-latin1.txt": "14ed6e2fadff9a2d4256f14ca9a35710e5c980e6f8ca7927dd2cf6dec5db84b6",
    "obras-1843-vol2.pdf": "f23c4a5b19aa4f918ea308c28359320ede6d5e89d3365228fc4c752ac6d044cf",
    "rhythmas-1595.pdf": "220b65773c426c0ca0600e3a1487cf963fec62bf54d7be66614279c87a7b9141",
    "azevedo-filho-48.pdf": "e339a1e284d393671f852ed3d4aae9b3e0a18edeeb3937709c4f7bab9a9829bd",
}
READINGS_SHA256 = "f3ba208989f4f607fed3bc0ee8de7dfd531be79c459ada3845632714226f9f2f"
# Study-list number, Gutenberg heading, printed 1843 page. The scanned copy's
# PDF page is printed page + 79 for these selections. Gutenberg's XXIII is
# apparently misnumbered XXXIII in the 1843 scan; see the record's note.
SELECTION = (
    (1, "XL", 21), (2, "XIX", 10), (3, "L", 26), (4, "LIII", 27),
    (5, "LI", 26), (6, "XV", 8), (7, "XXIII", 12), (8, "LXI", 31),
    (9, "LXVIII", 35), (10, "LXIII", 32), (11, "XXVI", 14), (12, "XII", 7),
    (13, "XXVIII", 15), (14, "XXX", 16), (15, "LXIX", 35), (16, "CCXI", 106),
    (17, "XLVI", 24), (18, "LII", 27), (19, "LVI", 29), (20, "XX", 11),
    (21, "XLIII", 22), (22, "XCIX", 50), (23, "XLVIII", 25), (24, "XXI", 11),
    (25, "XLIV", 23), (26, "XCIII", 47), (27, "XXXII", 17), (28, "XVII", 9),
    (29, "XXXIV", 18), (30, "LIV", 28), (31, "XLI", 21), (32, "CCXX", 111),
    (33, "XCII", 47), (34, "LIX", 30), (35, "LX", 31), (36, "CCXII", 107),
    (37, "XVI", 9), (38, "XLIX", 25), (39, "XLVII", 24), (40, "LVIII", 30),
    (41, "XCVIII", 50), (42, "XXXIII", 17), (43, "XXIX", 15), (44, "LXXIII", 37),
    (45, "IX", 5), (46, "XLV", 23), (47, "X", 6), (48, "CCXXVIII", 115),
)
DISPLAY_TITLES = {
    7: "Cara minha inimiga, em cuja mão",
    21: "O cisne, quando sente ser chegada",
    25: "Pelos extremos raros que mostrou",
    38: "Razão é já que minha confiança",
    39: "Se alguma hora em vós a piedade",
    43: "Sete anos de pastor Jacó servia",
    48: "Vós, ninfas da gangética espessura",
}
NOTES = {
    7: "Gutenberg numbers this XXIII; the 1843 scan appears to print XXXIII, "
       "an apparent misnumber between XXII and XXIV.",
    16: "Azevedo Filho's list begins ‘Ficou-se’; this printing has ‘Fiou-se’. "
        "A later critical comparison identifies the latter with this poem.",
    21: "The final line is in Spanish; italics in the printing are not reproduced.",
    25: "The 1595 Rhythmas begins ‘Pellos estremos raros’; this printing "
        "begins ‘Por os raros extremos’. The display title identifies the earlier variant.",
    38: "The scholarly list begins ‘Rezão é já que minha confiança’; the 1595 "
        "Rhythmas begins ‘Tempo he ja’, while this 1843 text begins ‘Ja he tempo, ja’. "
        "The scan reads ‘Ah dura lei’; Gutenberg has ‘Ali dura lei’, corrected here.",
    39: "The 1595 Rhythmas begins ‘Se algũa hora em vos a piedade’; the 1843 "
        "printing begins ‘Se somente hora alguma em vós piedade’ and has other variants.",
    43: "The poem retells Jacob's service for Rachel; the biblical subject alone "
        "does not classify it as devotional poetry.",
    48: "The poem praises Leonis Pereira's defence of Malacca in the era of "
        "Portuguese colonial expansion. A scholarly survey records an earlier 1576 printing.",
}
GUTENBERG = "https://www.gutenberg.org/files/31509/31509-h/31509-h.htm"
SCAN = "https://archive.org/download/obrascompletasd00montgoog/obrascompletasd00montgoog.pdf"
RIGHTS = (
    "Historical original and 1843 printing are public domain in the United States; "
    "check local law. Project Gutenberg credits Pedro Saborano and the Online "
    "Distributed Proofreading Team for its transcription."
)


def digest(value):
    return hashlib.sha256(value).hexdigest()


def roman_number(value):
    numerals = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
    return sum(-numerals[c] if i + 1 < len(value) and numerals[c] < numerals[value[i + 1]]
               else numerals[c] for i, c in enumerate(value))


def extract(book):
    start = book.index("\nSONETOS.\n")
    end = book.index("\nECLOGAS\n", start)
    section = book[start:end]
    headings = list(re.finditer(r"(?m)^([IVXLCDM]+)\.[ \t]*$", section))
    wanted = {numeral for _, numeral, _ in SELECTION}
    if ([number for number, _, _ in SELECTION] != list(range(1, 49))
            or len(wanted) != 48 or len({roman_number(numeral) for numeral in wanted}) != 48
            or "LXXXI" in wanted):
        raise ValueError("Invalid selection or existing Amor duplicate")
    poems = {}
    for i, heading in enumerate(headings):
        numeral = heading.group(1)
        if numeral not in wanted:
            continue
        if numeral in poems:
            raise ValueError(f"Repeated heading: {numeral}")
        raw = section[heading.end():headings[i + 1].start() if i + 1 < len(headings) else len(section)]
        lines = [line.strip().replace("[~e]", "ẽ").replace("[~u]", "ũ").replace("_", "")
                 for line in raw.splitlines() if line.strip()]
        if len(lines) != 14 or any("[" in line or "]" in line for line in lines):
            raise ValueError(f"Unexpected sonnet boundary or markup: {numeral}")
        if numeral == "XLIX":
            if lines[9] != "Ali dura lei de Amor, que não consente":
                raise ValueError("Unexpected Gutenberg XLIX reading")
            lines[9] = "Ah dura lei de Amor, que não consente"
        poems[numeral] = "\n\n".join("\n".join(lines[a:b]) for a, b in
                                     ((0, 4), (4, 8), (8, 11), (11, 14)))
    if set(poems) != wanted:
        raise ValueError(f"Missing sonnets: {wanted - set(poems)}")
    return poems


def make_records(directory):
    for name, expected in EVIDENCE.items():
        if digest((directory / name).read_bytes()) != expected:
            raise ValueError(f"Reviewed evidence changed: {name}")
    book = (directory / "gutenberg-31509-latin1.txt").read_bytes().decode("iso-8859-1")
    poems = extract(book.replace("\r\n", "\n"))
    ordered = sorted(SELECTION, key=lambda entry: roman_number(entry[1]))
    if digest("\n===\n".join(poems[numeral] for _, numeral, _ in ordered).encode()) != READINGS_SHA256:
        raise ValueError("Extracted readings changed")
    records = []
    for study_number, numeral, page in ordered:
        number = roman_number(numeral)
        text = poems[numeral]
        title_line = text.splitlines()[0].rstrip(" ,;:.")
        context = (
            f"Gutenberg sonnet {numeral}, from the 1843 Obras completas, volume II, p. {page}; "
            "numbering is edition-specific. Azevedo Filho included this work in a provisional "
            "48-sonnet minimum using particular attribution criteria; other scholars disagree "
            "about the lyric corpus, so inclusion is not proof of unanimous attribution. "
            "The Gutenberg lines were compared in order with OCR of the scan, and boundaries "
            "and exceptional matches were visually checked. Gutenberg says it silently corrected "
            "some typographical errors: this is not a diplomatic transcription. Indentation "
            "and italics are omitted, stanza breaks supplied, and its [~e] and [~u] markers "
            "rendered as ẽ and ũ. Portugal is associated with the poet, not a claim about the "
            "poem's place or exact date of composition."
        )
        if study_number in NOTES:
            context += " " + NOTES[study_number]
        record = {
            "id": f"camoes-soneto-1843-{number:03d}",
            "title": f"Soneto {numeral} · {title_line}",
            "author": "Luís de Camões",
            "authorId": "luis-de-camoes",
            "authorYears": "c. 1524–1580",
            "country": "Portugal",
            "language": "Portuguese",
            "lang": "pt",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Printed 1843 · composition date not established",
            "era": "Renaissance",
            "form": "Sonnet",
            "collection": "Obras completas · volume II, 1843",
            "themes": [],
            "mood": "paper",
            "context": context,
            "contextSource": f"{SCAN}#page={page + 79}",
            "contextSourceTitle": f"Internet Archive · 1843 scan, p. {page}",
            "sourceTitle": f"Project Gutenberg · Obras completas, p. {page}",
            "source": f"{GUTENBERG}#pag_{page}",
            "rights": RIGHTS,
            "text": text,
            "translations": [],
        }
        if study_number in DISPLAY_TITLES:
            record["displayTitle"] = DISPLAY_TITLES[study_number]
            record["displayTitleLang"] = "pt"
        if study_number == 21:
            record["textLanguageOverrides"] = [{"line": 14, "lang": "es"}]
        records.append(record)
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

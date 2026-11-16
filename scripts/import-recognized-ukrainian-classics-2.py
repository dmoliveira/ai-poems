#!/usr/bin/env python3
"""Reproduce five separately documented historical Ukrainian poems."""

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-ukrainian-classics-2-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-ukrainian-classics-2.json"
READINGS_SHA256 = "7a3485dfc36bd2c2893971fb27a73171867767b01197ecc1a4731b8bff793ac2"

# These hashes identify the copies consulted, not transcription accuracy.
EVIDENCE = {
    "ukrainka-na-krylah-1892.pdf": "a4b093490150e3248022e2ac8639dbdd019b3f21c382c7a86ef6721edd83d1df",
    "ukrainka-dumy-mriyi-1899.pdf": "818a014a6eccefc25ff8391466d52a2ecfcba81954ccc5b4b33de00e8fc12579",
    "ukrainska-muza-1908-issue-4.pdf": "c8dd59a76caf0f45a49444efe187e19ed76ef7e712f19dff3cdbc2f33e6949be",
    "franko-z-vershyn-i-nyzyn-1893-uoft.pdf": "ab82d49e8fe8ed3df4b038572c233ac1aa43508fcf5dbb8ae4141182eea84513",
}
WINGS = "Леся Українка. На крилах пісень. 1892.pdf"
DUMY = "Леся Українка – Думи і мрії. Поезиї (1899).pdf"
MUZA = "Украінська Муза (Випуск 4).pdf"
VERSHYN = "З вершин і низин. Збірник поезій Івана Франка. 1893.djvu"


def commons(filename, page):
    return "https://commons.wikimedia.org/wiki/File:" + quote(filename.replace(" ", "_")) + f"?page={page}"


def revision(filename, page, oldid):
    title = quote(f"Сторінка:{filename}/{page}", safe="")
    return f"https://uk.wikisource.org/w/index.php?title={title}&oldid={oldid}"


UKRAINKA = {
    "author": "Lesya Ukrainka", "authorOriginal": "Леся Українка", "authorId": "lesya-ukrainka",
    "authorYears": "1871–1913", "authorAliases": ["Lesia Ukrainka", "Лариса Косач"],
}
FRANKO = {
    "author": "Ivan Franko", "authorOriginal": "Іван Франко", "authorId": "ivan-franko",
    "authorYears": "1856–1916",
}
COMMON = {
    "country": "Ukraine", "language": "Ukrainian", "lang": "uk", "direction": "ltr",
    "era": "19th century", "form": "Lyric", "themes": [], "mood": "paper", "translations": [],
}
WORKS = [
    {
        "key": "dosvitni", **UKRAINKA, "title": "Досвітні огні", "displayTitle": "Dawn Lights",
        "year": None, "yearLabel": "Title page 1892; also dated 1893",
        "collection": "On the Wings of Songs · title page 1892",
        "context": (
            "The complete first-book reading has seven five-line stanzas across pp. 25–26. "
            "The title page says 1892; publication histories also give 1893. Collected-edition notes "
            "say the author omitted two stanzas in the 1904 edition. The 1898 Franko essay "
            "discusses this poem, criticizing the whole but praising a stanza, not unconditionally "
            "praising the work. Historical spelling and stress marks are retained; indentation, "
            "spacing and some punctuation are normalized. Ukraine is an associated place, not a "
            "claim about composition."
        ),
        "sourceTitle": "On the Wings of Songs · title page 1892 · pp. 25–26",
        "source": commons(WINGS, 25),
        "contextSourceTitle": "Ivan Franko · Lesya Ukrainka, 1898 essay",
        "contextSource": "https://uk.wikisource.org/wiki/Леся_Українка_(Франко)",
        "searchAliases": ["Досвітні вогні", "Ніч темна людей всіх потомлених скрила", "Dosvitni ogni"],
        "revisions": [(WINGS, 25, 560487), (WINGS, 26, 560505)], "blocks": [5, 5, 5, 5, 5, 5, 5],
    },
    {
        "key": "yak-dytynoyu", **UKRAINKA, "title": "Як дитиною бувало",
        "displayTitle": "As a Child", "year": 1899, "yearLabel": "1899 printing",
        "collection": "Dumy i mrii · 1899",
        "context": (
            "This complete 16-line poem is printed on p. 93 between separators marking its "
            "boundaries; its opening supplies the catalogue title. A sixth-grade literature textbook "
            "prints it individually. Historical spelling is retained; indentation, spacing and "
            "some punctuation are normalized. Ukraine is an associated place, not a composition claim."
        ),
        "sourceTitle": "Dumy i mrii · 1899 · p. 93 / PDF p. 96", "source": commons(DUMY, 96),
        "contextSourceTitle": "Ukrainian literature · sixth-grade textbook",
        "contextSource": "https://uahistory.co/pidruchniki/avramenko-ukraine-literature-6-class-2014/10.php",
        "searchAliases": ["Як дитиною, бувало", "Щоб не плакать, я сміялась", "Yak dytynoiu buvalo"],
        "revisions": [(DUMY, 96, 560611)], "blocks": [4, 4, 4, 4],
    },
    {
        "key": "slovo", **UKRAINKA, "title": "Слово, чому ти не твердая криця",
        "displayTitle": "Word, Why Are You Not Hard Steel?", "year": 1899, "yearLabel": "1899 printing",
        "collection": "Dumy i mrii · 1899",
        "context": (
            "This complete 24-line poem spans pp. 81–82 and was separately listed in an 1897 "
            "periodical's contents before the 1899 collection. The 1899 printing reads 'кращим "
            "мечем'; the 1897 printing reads 'справжнім мечем'. The scan reads 'мого серця', "
            "correcting the credited page transcription's 'мого сєрця'. Editions are not "
            "spliced. Historical spelling is retained; indentation, spacing and some punctuation "
            "are normalized. Ukraine is an associated place, not a composition claim."
        ),
        "sourceTitle": "Dumy i mrii · 1899 · pp. 81–82 / PDF pp. 84–85", "source": commons(DUMY, 84),
        "contextSourceTitle": "Ukrainian literature · tenth-grade textbook · Слово",
        "contextSource": "https://uahistory.co/pidruchniki/fasolya-ukraine-literature-10-class-2018-standard-level/45.php",
        "searchAliases": ["Слово моя ти єдиная зброє", "Slovo chomu ty"],
        "revisions": [(DUMY, 84, 459656), (DUMY, 85, 561234)], "blocks": [4, 4, 4, 4, 4, 4],
    },
    {
        "key": "kamenyari", **FRANKO, "title": "Каменярі", "displayTitle": "The Stonebreakers",
        "year": 1908, "yearLabel": "1908 printing", "collection": "Ukrainska Muza · 1908",
        "context": (
            "This separately headed 55-line poem fills columns 413–414. Its 1908 printing runs "
            "continuously and prints 'роспуски', possibly a printing error; the 1893 collection "
            "reads 'розпуки'. The scan's 'сердиті' also corrects the credited transcription's "
            "'сердити'. The editions are not combined. Scholarly notes identify an earlier 1878 "
            "printing; the tenth-grade textbook discusses the individual poem. Historical "
            "spelling is retained; printer wraps, indentation and some punctuation are normalized. "
            "Ukraine is an associated place, not a claim about composition."
        ),
        "sourceTitle": "Ukrainska Muza · 1908 · issue 4, columns 413–414 / PDF p. 41",
        "source": commons(MUZA, 41), "contextSourceTitle": "Ukrainian literature · tenth-grade textbook · Каменярі",
        "contextSource": "https://uahistory.co/pidruchniki/paharenko-ukraine-literature-10-class-2018-profile-level/25.php",
        "searchAliases": ["Я бачив дивний сон", "Kamenyari", "Stonecutters"],
        "revisions": [(MUZA, 41, 1133466)], "blocks": [55],
    },
    {
        "key": "hymn", **FRANKO, "title": "Гимн", "displayTitle": "Hymn · The Eternal Revolutionary",
        "year": 1893, "yearLabel": "1893 printing", "collection": "Z vershyn i nyzyn · 1893",
        "context": (
            "The complete 1893 reading has four ten-line stanzas on pp. 9–10; its printed "
            "subtitle is 'Замісць пролога'. Collected-edition notes identify a separate 1882 "
            "publication before its placement as a collection's prologue. A 1908 anthology "
            "printing stops after three stanzas; it is not combined with this text or counted "
            "separately. Historical spelling is retained, including 'думка воля'; spacing and "
            "some punctuation are normalized. Ukraine is an associated place, not a composition claim."
        ),
        "sourceTitle": "Z vershyn i nyzyn · 1893 · pp. 9–10 / PDF pp. 13–14",
        "source": "https://archive.org/download/zvershyninyzynzb00fran/zvershyninyzynzb00fran.pdf#page=13",
        "contextSourceTitle": "Ukrainian literature · tenth-grade textbook · Гімн",
        "contextSource": "https://uahistory.co/pidruchniki/fasolya-ukraine-literature-10-class-2018-standard-level/14.php",
        "searchAliases": ["Гімн", "Вічний революціонер", "Вічний революцйонер", "Vichnyi revoliutsioner"],
        "revisions": [(VERSHYN, 13, 265457), (VERSHYN, 14, 265459)], "blocks": [10, 10, 10, 10],
    },
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build():
    if digest(READINGS) != READINGS_SHA256:
        raise ValueError("Reading snapshot changed")
    blocks = [block.strip() for block in re.split(r"(?m)^## ", READINGS.read_text(encoding="utf-8")) if block.strip()]
    readings = {}
    for block in blocks:
        key, text = block.split("\n", 1)
        if key in readings:
            raise ValueError(f"Duplicate reading: {key}")
        readings[key] = text.strip()
    if list(readings) != [work["key"] for work in WORKS]:
        raise ValueError("Unexpected reading selection or order")
    records = []
    for work in WORKS:
        text = readings[work["key"]]
        if [len(block.splitlines()) for block in text.split("\n\n")] != work["blocks"]:
            raise ValueError(f"Unexpected reading boundaries: {work['key']}")
        links = [revision(*item) for item in work["revisions"]]
        rights = (
            "Historical Ukrainian original in a pre-1931 printing; public domain in the United States. "
            "Page transcription adapted from Ukrainian Wikisource contributors under CC BY-SA 4.0 "
            "(https://creativecommons.org/licenses/by-sa/4.0/); contributor histories: "
            + "; ".join(links)
            + ". Copyright, edition-related and moral rights vary; check local law. "
            "Scans are linked, not republished; no translation or recording is included."
        )
        record = {**COMMON, **{key: value for key, value in work.items() if key not in {"key", "blocks", "revisions"}}}
        record.update({"id": "recognized-ukrainian-2-" + work["key"], "rights": rights, "text": text})
        records.append(record)
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    operation = parser.add_mutually_exclusive_group(required=True)
    operation.add_argument("--check", action="store_true")
    operation.add_argument("--write", action="store_true")
    parser.add_argument("--evidence-dir", type=Path)
    args = parser.parse_args()
    records = build()
    if args.evidence_dir:
        for filename, expected in EVIDENCE.items():
            if digest(args.evidence_dir / filename) != expected:
                raise ValueError(f"Witness does not match: {filename}")
    if args.write:
        OUTPUT.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {len(records)} historical readings.")
    else:
        if json.loads(OUTPUT.read_text(encoding="utf-8")) != records:
            raise ValueError("Catalogue differs from the reviewed readings")
        print(f"Verified {len(records)} historical readings" +
              ("; witness hashes match." if args.evidence_dir else "."))


if __name__ == "__main__":
    main()

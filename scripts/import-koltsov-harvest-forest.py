#!/usr/bin/env python3
"""Reproduce two complete Koltsov poems from their lifetime printings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/koltsov-harvest-forest-readings.txt"
OUTPUT = ROOT / "content/poems/koltsov-harvest-forest.json"
READINGS_SHA256 = "d3bda6c17b3831b9720facd257d734c18cad71d1454ee949b2872a13b2978f3f"
# Hashes identify consulted copies, not the accuracy or legality of a transcription.
EVIDENCE = {
    "sovremennik-1836-volume2-koltsov-candidate.pdf": "574d323290fb7212acc1d53508534a9752b6eb5060295ebd52c5888d188b4cb9",
    "syn-otechestva-1838-vol2-koltsov.pdf": "78c84d62bc23cd9aae5dae17328ebec3db07d5ed1fa920260bd7887674d8ee10",
    "koltsov-belinsky-1846-candidate.pdf": "f936eb12d66b7ca2aaf85bd7b71da51e7f9f174a0a128cc11bbf735b8c5ee111",
}
COMMON = {
    "country": "Russia", "language": "Russian", "lang": "ru", "direction": "ltr",
    "era": "19th century", "form": "Lyric", "themes": [], "mood": "paper", "translations": [],
    "author": "Aleksey Koltsov", "authorId": "aleksey-koltsov", "authorYears": "1809–1842",
    "authorOriginal": "Алексей Васильевич Кольцов",
    "authorAliases": ["Алексей Кольцов", "А. В. Кольцов", "Alexei Koltsov", "Aleksei Koltsov"],
}
NORMALIZATION = (
    " Pre-reform letters, adjective endings, punctuation typography, spacing and stress marks"
    " are normalized; some historical spellings are retained. Russia is an associated place,"
    " not a claim about where the poem was written. Transcription error remains possible."
)
RIGHTS_END = (
    " Specific editorial changes to this reading are not established. Copyright, edition-related"
    " and moral rights vary by jurisdiction; check local law. The scan is linked, not republished;"
    " no translation, score or recording is included."
)
WORKS = [
    {
        "key": "harvest-1836", "stanzas": [4] * 27,
        "id": "koltsov-harvest-1836", "title": "Урожай",
        "year": 1836, "yearLabel": "1836 printing · not necessarily composition date",
        "collection": "Современник · 1836",
        "sourceTitle": "Современник · 1836, vol. 2, pp. 189–193 / PDF pp. 187–191",
        "source": "https://commons.wikimedia.org/wiki/File:Sovremennik_1836_02.pdf?page=187",
        "contextSourceTitle": "Vdovin, Leibov and Kazakova · historical school anthologies",
        "contextSource": "https://doi.org/10.31860/openlit-2021.9-B003",
        "searchAliases": ["Красным полымем", "Заря вспыхнула", "Harvest Koltsov"],
        "context": (
            "The signed 1836 printing separately heads this complete 27-quatrain poem."
            " Its 'Понесли ее' and 'Напилась земля / Воды досыта' differ from the 1846"
            " 'Понесут ее' and 'Напилась воды / Земля досыта'. On p. 192 the first"
            " printing appears to read 'Рожъ'; here it is rendered 'Рожь', as on p. 193."
            " The linked index records 36 historical school-anthology entries, including"
            " repeated editions and possibly excerpts, not a global ranking."
        ) + NORMALIZATION,
        "rights": (
            "The 1836 printing is public domain in the United States. Koltsov died in 1842;"
            " the journal's publisher Alexander Pushkin died in 1837."
        ) + RIGHTS_END,
    },
    {
        "key": "forest-1838", "stanzas": [4] * 20,
        "id": "koltsov-forest-1838", "title": "Лес",
        "year": 1838, "yearLabel": "1838 printing · not necessarily composition date",
        "collection": "Сын отечества · 1838",
        "sourceTitle": "Сын отечества · 1838, vol. 2, section I, pp. 17–20 / PDF spreads 8–10",
        "source": "https://commons.wikimedia.org/wiki/File:Сын_отечества_(и_Северный_архив)._Том_2._(1838,_март_и_апрель).pdf?page=8",
        "contextSourceTitle": "Odesa Literary Museum · in memory of the poet",
        "contextSource": "https://museum-literature.odessa.ua/ru/project/pamyati-poeta/",
        "searchAliases": ["Что дремучий лес", "Призадумался", "Forest Koltsov Pushkin"],
        "context": (
            "This signed 1838 printing has 20 quatrains and a separately printed Pushkin"
            " epigraph, omitted here. The Odesa Literary Museum discusses this specific"
            " 'Что, дремучий лес' as a notable memorial to Pushkin; its modern text is not"
            " the transcription source. The first printing has 'Так подрезала',"
            " 'Понахлынули / Силы вражие' and 'А соломешкой'; the 1846 edition reads"
            " 'Так дорезала', reverses those two lines and has 'А соломенкой'."
            " Koltsov also wrote a different poem titled 'Лес'."
        ) + NORMALIZATION,
        "rights": (
            "The 1838 printing is public domain in the United States. Koltsov died in 1842;"
            " journal editors Nikolay Grech and Faddey Bulgarin died in 1867 and 1859,"
            " and publisher Alexander Smirdin in 1857."
        ) + RIGHTS_END,
    },
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build():
    if digest(READINGS) != READINGS_SHA256:
        raise ValueError("Reading snapshot changed")
    sections = [block.strip() for block in re.split(r"(?m)^## ", READINGS.read_text(encoding="utf-8")) if block.strip()]
    readings = {}
    for section in sections:
        key, text = section.split("\n", 1)
        if key in readings:
            raise ValueError(f"Duplicate reading: {key}")
        readings[key] = text.strip()
    if list(readings) != [work["key"] for work in WORKS]:
        raise ValueError("Unexpected reading selection or order")
    records = []
    for work in WORKS:
        text = readings[work["key"]]
        if [len(stanza.splitlines()) for stanza in text.split("\n\n")] != work["stanzas"]:
            raise ValueError(f"Unexpected reading boundaries: {work['key']}")
        record = {**COMMON, **{key: value for key, value in work.items() if key not in {"key", "stanzas"}}}
        record["text"] = text
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

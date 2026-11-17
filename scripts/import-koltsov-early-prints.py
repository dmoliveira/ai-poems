#!/usr/bin/env python3
"""Reproduce six complete Koltsov poems from identified lifetime printings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/koltsov-early-prints-readings.txt"
OUTPUT = ROOT / "content/poems/koltsov-early-prints.json"
READINGS_SHA256 = "a34a96e192680d47e4d8b88ced07fb2050c6b0f5b854a4b30314bc7abb7a9972"
# Hashes identify consulted copies, not the accuracy or legality of a transcription.
EVIDENCE = {
    "koltsov-poems-1835-candidate.pdf": "ebed5ff37e9ec4cb5a9bec79d93779c597612fd7a2b26339653f04250513724b",
    "koltsov-belinsky-1846-candidate.pdf": "f936eb12d66b7ca2aaf85bd7b71da51e7f9f174a0a128cc11bbf735b8c5ee111",
    "moskovsky-nablyudatel-1838-no4-koltsov.pdf": "f45fda805d04f6cbdbd42df3a646feaad1a932e1545342b99b0c98e9c273a4d3",
    "koltsov-muzhichok-1841-nlr-279.jpg": "6b54048d924e9ef876ab266dbffa7e645e61b21648f6612f52a1d52a03687bba",
    "koltsov-muzhichok-1841-nlr-280.jpg": "28eeda8bf08d3f526f6c1fa467bfd3ab06ae8026c45bb0ed2f88131349e85f76",
}
COMMON = {
    "country": "Russia", "language": "Russian", "lang": "ru", "direction": "ltr",
    "era": "19th century", "form": "Lyric", "themes": [], "mood": "paper", "translations": [],
    "author": "Aleksey Koltsov", "authorId": "aleksey-koltsov", "authorYears": "1809–1842",
    "authorOriginal": "Алексей Васильевич Кольцов",
    "authorAliases": ["Алексей Кольцов", "А. В. Кольцов", "Alexei Koltsov", "Aleksei Koltsov"],
}
COLLECTION = "https://commons.wikimedia.org/wiki/File:А._Кольцов_Стихотворения_(1835).pdf"
MUSIC = "https://lk.vrnlib.ru/?id=15&p=post"
ANTHOLOGIES = "https://doi.org/10.31860/openlit-2021.9-B003"
NORMALIZATION = (
    " Pre-reform letters, adjective endings, punctuation typography and spacing are normalized;"
    " some historical spellings are retained. Russia is an associated place, not a claim"
    " about where the poem was written."
)
RIGHTS_END = (
    " Specific editorial changes to this reading are not established. Copyright, edition-related"
    " and moral rights vary by jurisdiction; check local law. The scan is linked, not republished;"
    " no translation, score or recording is included."
)
COLLECTION_RIGHTS = (
    "The 1835 printing is public domain in the United States. Koltsov died in 1842;"
    " Nikolay Stankevich and Vissarion Belinsky, who helped bring out the collection, died in 1840 and 1848."
) + RIGHTS_END
WORKS = [
    {
        "key": "old-man-1835", "stanzas": [4] * 4,
        "id": "koltsov-early-old-man", "title": "Песня старика",
        "year": 1835, "yearLabel": "1835 printing · not necessarily composition date",
        "collection": "Стихотворения · 1835",
        "sourceTitle": "Стихотворения Алексея Кольцова · 1835, pp. 5–6 / PDF spreads 5–7",
        "source": COLLECTION + "?page=5",
        "contextSourceTitle": "Voronezh regional library · Koltsov in music",
        "contextSource": MUSIC,
        "searchAliases": ["Оседлаю коня", "Коня быстрова", "К молодости", "Old Man's Song Koltsov"],
        "context": (
            "This separately headed poem has four quatrains in the 1835 collection;"
            " the last ends before the next titled work. The regional library identifies"
            " a popular musical setting of 'Оседлаю коня'; later folk variants and settings"
            " are not additional poems."
            " The 1835 'быстрова' is retained."
        ) + NORMALIZATION,
        "rights": COLLECTION_RIGHTS,
    },
    {
        "key": "nightingale-1835", "stanzas": [4] * 7,
        "id": "koltsov-early-nightingale", "title": "Ты не пой, соловей",
        "year": 1835, "yearLabel": "1835 printing · not necessarily composition date",
        "collection": "Стихотворения · 1835",
        "sourceTitle": "Стихотворения Алексея Кольцова · 1835, pp. 15–16 / PDF spreads 15–17",
        "source": COLLECTION + "?page=15",
        "contextSourceTitle": "Voronezh regional library · Koltsov in music",
        "contextSource": MUSIC,
        "searchAliases": ["Песня Ты не пой соловей", "Под моим окном", "Улети в леса", "Do not sing nightingale Koltsov"],
        "context": (
            "Headed 'Песня' in the 1835 collection, this complete seven-quatrain lyric is"
            " identified here by its opening line. The regional library identifies a popular"
            " musical setting; later blended folk versions and musical settings are not"
            " additional poems. The historical 'нея' is retained."
        ) + NORMALIZATION,
        "rights": COLLECTION_RIGHTS,
    },
    {
        "key": "rye-1835", "stanzas": [4] * 6,
        "id": "koltsov-early-rye", "title": "Не шуми ты, рожь",
        "year": 1835, "yearLabel": "1835 printing · not necessarily composition date",
        "collection": "Стихотворения · 1835",
        "sourceTitle": "Стихотворения Алексея Кольцова · 1835, pp. 18–19 / PDF spread 19",
        "source": COLLECTION + "?page=19",
        "contextSourceTitle": "Voronezh regional library · Koltsov in music",
        "contextSource": MUSIC,
        "searchAliases": ["Не шуми ты рожь", "Спелым колосом", "Дума черная", "Do not rustle rye Koltsov"],
        "context": (
            "This separately headed six-quatrain poem ends on the same spread. The regional"
            " library discusses its later musical and folk reception; subsequent adaptations"
            " are not counted separately. The 1835 spelling 'чорная'"
            " is retained rather than silently replacing it with 'черная'."
        ) + NORMALIZATION,
        "rights": COLLECTION_RIGHTS,
    },
    {
        "key": "ploughman-1835", "stanzas": [4] * 11,
        "id": "koltsov-early-ploughman", "title": "Песня пахаря",
        "year": 1835, "yearLabel": "1835 printing · not necessarily composition date",
        "collection": "Стихотворения · 1835",
        "sourceTitle": "Стихотворения Алексея Кольцова · 1835, pp. 37–39 / PDF spreads 38–39",
        "source": COLLECTION + "?page=38",
        "contextSourceTitle": "Vdovin, Leibov and Kazakova · historical school anthologies",
        "contextSource": ANTHOLOGIES,
        "searchAliases": ["Ну тащися сивка", "Я сам-друг с тобою", "Мать земля сырая", "Ploughman's Song Koltsov"],
        "context": (
            "The 1835 collection separately heads this complete eleven-quatrain poem."
            " Its 'Я сам, друг, с тобою' differs from the 1846 'Я сам-друг с тобою'."
            " The printed historical spellings 'большова' and 'Выростет' are retained."
            " The linked index records 44 historical school-anthology"
            " entries, including repeated editions and possibly excerpts, not a global ranking."
        ) + NORMALIZATION,
        "rights": COLLECTION_RIGHTS,
    },
    {
        "key": "reflection-1838", "stanzas": [4] * 6,
        "id": "koltsov-early-reflection", "title": "Раздумье селянина",
        "year": 1838, "yearLabel": "1838 printing · not necessarily composition date",
        "collection": "Московский наблюдатель · 1838",
        "sourceTitle": "Московский наблюдатель · 1838, part 16, no. 4, book 2, pp. 565–566 / PDF pp. 73–74",
        "source": "https://commons.wikimedia.org/wiki/File:Московский_наблюдатель_1838_ч_16_№_4.pdf?page=73",
        "contextSourceTitle": "Voronezh regional library · Koltsov in music",
        "contextSource": MUSIC,
        "searchAliases": ["Русская песня Сяду я за стол", "Сяду я за стол", "Как на свете жить одинокому", "Peasant's Reflection Koltsov"],
        "context": (
            "The signed 1838 printing calls this six-quatrain poem 'Русская песня';"
            " 'Раздумье селянина' is a later identifying title. It ends 'Как мне век дожить /"
            " Одинокому' and reads 'Всю размыкала', unlike later versions. The regional"
            " library describes a later setting of 'Сяду я за стол' as widely known;"
            " later transformed variants and settings are not additional poems."
        ) + NORMALIZATION,
        "rights": (
            "The 1838 printing is public domain in the United States. Koltsov died in 1842;"
            " the periodical's unofficial editor Vissarion Belinsky died in 1848."
        ) + RIGHTS_END,
    },
    {
        "key": "peasant-1841", "stanzas": [4] * 13,
        "id": "koltsov-early-peasant", "title": "Что ты спишь, мужичок?",
        "year": 1841, "yearLabel": "1841 printing · not necessarily composition date",
        "collection": "Отечественные записки · 1841",
        "sourceTitle": "Отечественные записки · 1841, vol. 14, no. 1, section III, pp. 155–156 / viewer pp. 279–280",
        "source": "https://vivaldi.nlr.ru/bv000030984/view#page=279",
        "contextSourceTitle": "Vdovin, Leibov and Kazakova · historical school anthologies",
        "contextSource": ANTHOLOGIES,
        "searchAliases": ["Что ты спишь мужичок", "Ведь весна на дворе", "Земляку Кольцов", "Why do you sleep peasant Koltsov"],
        "context": (
            "The signed, untitled 1841 poem is complete in thirteen quatrains; its first"
            " line supplies the title, and the printed 1839 date is not verse. This reading"
            " has 'Хоть шаром покатись' and 'Ты с бедою сидишь'; later editions differ."
            " The linked index records 44 historical school-anthology entries, including"
            " repeated editions and possibly excerpts, not a global ranking."
        ) + NORMALIZATION,
        "rights": (
            "The 1841 printing is public domain in the United States. Koltsov died in 1842;"
            " the periodical's editor Andrey Krayevsky died in 1889."
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

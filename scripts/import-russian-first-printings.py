#!/usr/bin/env python3
"""Reproduce four complete Russian lyrics from named historical printings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/russian-first-printings-readings.txt"
OUTPUT = ROOT / "content/poems/russian-first-printings.json"
READINGS_SHA256 = "f6f998926a6ff22f476b1e5600d2e6f350512a16fec4c98347eb1143ff1c633c"
# Witness hashes identify consulted files; they do not prove transcription or rights.
EVIDENCE = {
    "fet-1843-rnb-page13-200.jpg": "0d57648ef5fe00ef5f65825600659dd59901da3d0a1db7daec823bb115c24e98",
    "moskvityanin-1850-vol1-no2-research.pdf": "f512b0509bc566c8fd3913ff1d5b635001dd997b40c9d30772ecf231a47bc9e6",
    "tyutchev-poems-1868-research.pdf": "3db0c2ebcef65ad733f4218d74c990dd174263e66ef0dcba44b3f4180208aed1",
    "pushkin-polar-star-1856-research.djvu": "907ace104c56fdd8a6b6efbc19f0f78fe1c1c783ac12e894b1d3aeb8feb8391b",
    "polar-star-1856-page28.jpg": "97c8ea50f4c1823ea6a8c3c1bf4e0160bd36f9b4a3da855ea2b526942dfb75ea",
}
COMMON = {
    "country": "Russia",
    "language": "Russian",
    "lang": "ru",
    "direction": "ltr",
    "era": "19th century",
    "form": "Lyric",
    "themes": [],
    "mood": "paper",
    "translations": [],
}
FET = {
    "author": "Afanasy Fet",
    "authorId": "afanasy-fet",
    "authorYears": "1820–1892",
    "authorOriginal": "Афанасий Афанасьевич Фет",
    "authorAliases": ["Афанасий Фет", "Афанасий Шеншин", "Afanasy Shenshin", "Afanasiy Fet"],
}
RECEPTION = "https://doi.org/10.34216/1998-0817-2024-30-4-101-107"
NORMALIZATION = (
    " Pre-reform spelling, ё, typography and spacing are normalized; this is not a facsimile. "
    "Russia is an associated place, not a claim about where the poem was written."
)
RIGHTS_END = (
    " Copyright, edition-related and moral rights vary by jurisdiction; check local law. "
    "The scan is linked, not republished; no translation, score or recording is included."
)
WORKS = [
    {
        **FET,
        "key": "fet-greeting-1843", "lines": 16,
        "id": "russian-first-fet-greeting",
        "title": "Я пришёл к тебе с приветом",
        "year": 1843, "yearLabel": "1843 printing · not necessarily composition date",
        "collection": "Отечественные записки · 1843",
        "sourceTitle": "Отечественные записки · 1843, no. 7, section I, p. 1 / viewer p. 13",
        "source": "https://vivaldi.nlr.ru/bv000031003/view#page=13",
        "contextSourceTitle": "Abramova and Arkhangelskaya · Fet in digital folklore",
        "contextSource": RECEPTION,
        "searchAliases": ["Я пришел к тебе с приветом", "Рассказать, что солнце встало", "I have come to you, delighted"],
        "context": (
            "This complete untitled lyric is signed A. Fet in the 1843 periodical; its opening "
            "supplies the title. Its 16 printed lines have no stanza breaks. "
            "The first printing joins 'также' in line 11 and omits the later "
            "comma after 'проснулся' in line 6. The authors of the linked study describe "
            "the opening's circulation in internet folklore; their later commentary is not reproduced."
        ) + NORMALIZATION,
        "rights": (
            "The 1843 printing is public domain in the United States. Fet died in 1892; "
            "periodical editor Andrey Krayevsky died in 1889."
        ) + RIGHTS_END,
    },
    {
        **FET,
        "key": "fet-whisper-1850", "lines": 12,
        "id": "russian-first-fet-whisper",
        "title": "Шёпот сердца, уст дыханье",
        "year": 1850, "yearLabel": "1850 printing · not necessarily composition date",
        "collection": "Москвитянин · 1850",
        "sourceTitle": "Москвитянин · 1850, part I, no. 2, section I, p. 186 / PDF p. 80",
        "source": "https://commons.wikimedia.org/wiki/File:Москвитянин_1850_ч_1_№_2.pdf?page=80",
        "contextSourceTitle": "Abramova and Arkhangelskaya · Fet in digital folklore",
        "contextSource": RECEPTION,
        "searchAliases": ["Шепот сердца, уст дыханье", "Шёпот, робкое дыханье", "Шепот робкое дыханье", "Трели соловья"],
        "context": (
            "The 1850 periodical prints this complete, separately signed lyric without a title; "
            "its 12 lines have no stanza breaks, and its opening is used here. "
            "The 1856 collection instead begins 'Шёпот, робкое дыханье' "
            "and reads 'В дымных тучках пурпур розы, / Отблеск янтаря' where the 1850 "
            "printing has 'Бледный блеск и пурпур розы, / Речь не говоря'. These are one work, "
            "not separate additions; authorship of individual editorial changes is not established. "
            "The linked study records quotations from the poem, not a global ranking."
        ) + NORMALIZATION,
        "rights": (
            "The 1850 printing is public domain in the United States. Fet died in 1892; "
            "periodical editor Mikhail Pogodin died in 1875."
        ) + RIGHTS_END,
    },
    {
        "key": "tyutchev-russia-1868", "lines": 4,
        "id": "russian-first-tyutchev-russia",
        "title": "Умом Россию не понять",
        "author": "Fyodor Tyutchev", "authorId": "fyodor-tyutchev", "authorYears": "1803–1873",
        "authorOriginal": "Фёдор Иванович Тютчев",
        "authorAliases": ["Федор Тютчев", "Фёдор Тютчев", "Fedor Tyutchev", "Fyodor Tiutchev"],
        "year": 1868, "yearLabel": "1868 printing · dated 28 November 1866",
        "collection": "Стихотворения Ф. Тютчева · 1868",
        "sourceTitle": "Стихотворения Ф. Тютчева · 1868, CLXXIII, p. 230 / PDF p. 234",
        "source": "https://archive.org/download/stikhotvoren00tiut/stikhotvoren00tiut.pdf#page=234",
        "contextSourceTitle": "Arzamas · the quatrain and its reception",
        "contextSource": "https://arzamas.academy/materials/1333",
        "searchAliases": ["Аршином общим не измерить", "Умом Россию", "Umom Rossiyu ne ponyat"],
        "context": (
            "The 1868 edition gives this complete untitled quatrain as number CLXXIII; its "
            "printed date is not a verse line. The semicolon after 'измерить' is this printing's "
            "punctuation; other witnesses differ. Arzamas discusses its first line's changing "
            "public reception and later ironic uses. Inclusion does not endorse a political interpretation."
        ) + NORMALIZATION,
        "rights": (
            "The 1868 printing is public domain in the United States. Tyutchev died in 1873; "
            "the edition's preparers Ivan F. Tyutchev and Ivan S. Aksakov died in 1909 and 1886."
        ) + RIGHTS_END,
    },
    {
        "key": "pushkin-siberia-1856", "lines": 16,
        "id": "russian-first-pushkin-siberia",
        "title": "В Сибирь",
        "author": "Alexander Pushkin", "authorId": "alexander-pushkin", "authorYears": "1799–1837",
        "authorOriginal": "Александр Сергеевич Пушкин",
        "authorAliases": ["Александр Пушкин", "А. С. Пушкин", "Aleksandr Pushkin", "Alexandre Pouchkine"],
        "year": 1856, "yearLabel": "1856 printing · composition date uncertain",
        "collection": "Полярная Звезда · 1856",
        "sourceTitle": "Полярная Звезда · book 2, 1856, p. 13 / viewer p. 28",
        "source": "https://commons.wikimedia.org/wiki/File:Полярная_Звезда._Кн._2_(1856).djvu?page=28",
        "contextSourceTitle": "O. A. Proskurin · introduction to Dmitriev's memoirs",
        "contextSource": "https://ru.wikisource.org/wiki/Главы_из_воспоминаний_моей_жизни_(Фрагменты)_(Дмитриев)",
        "searchAliases": ["Во глубине сибирских руд", "Послание в Сибирь", "To Siberia", "In the depths of Siberian mines"],
        "context": (
            "The 1856 first posthumous printing separately heads this complete lyric 'В Сибирь'; "
            "its footnote attributes the verses to Pushkin and is not part of the poem. "
            "No autograph survives and manuscript copies differ. This witness has 'Разбудит' "
            "and 'подземельи'; Efremov's 1903 edition has 'Пробудит' and 'подземелье'. "
            "Its unusual punctuation is retained; other printings divide the text into stanzas. "
            "Proskurin's introduction describes this individual poem as famous."
        ) + NORMALIZATION,
        "rights": (
            "The 1856 printing is public domain in the United States. Pushkin died in 1837; "
            "publisher Alexander Herzen died in 1870."
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
        if "\n\n" in text or len(text.splitlines()) != work["lines"]:
            raise ValueError(f"Unexpected reading boundaries: {work['key']}")
        record = {**COMMON, **{key: value for key, value in work.items() if key not in {"key", "lines"}}}
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

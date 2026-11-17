#!/usr/bin/env python3
"""Reproduce seven complete Russian poems from identified early printings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/russian-anthology-witnesses-readings.txt"
OUTPUT = ROOT / "content/poems/russian-anthology-witnesses.json"
READINGS_SHA256 = "943f99fc4a18aa71032a43b6630ec5623b677da35f997d28c13c7ee7369b7d66"
# Hashes identify the consulted copies, not the accuracy or legality of a transcription.
EVIDENCE = {
    "moskovsky-vestnik-1828-part7-candidate.pdf": "64652bb6a4a17a9383c5e8dc4dd5ccf9323613ba210a2b3dd3da59d238507d27",
    "severnie-tsvety-1832-commons1-candidate.pdf": "fdef06371ac157816cc72d8382fdd0a05cfac73dbba4aa182d8eaad43b821d57",
    "teleskop-1832-part10-candidate.pdf": "e58915450c24c7a83bf031099260b26815811c60f88ed0f2b7a3de6399ca687a",
    "russkaya-beseda-1858-book10-candidate.pdf": "64d384cecc486b779c858f4a604d57914fef51577167fd10518d84d92732728f",
    "tyutchev-sovremennik-1854-scan-candidate.pdf": "7509cff83d08a5f6080b032894e228b2dc8ca9f67991626372aeffc78ead7988",
    "lermontov-utes-1843-rnb-page152-300.jpg": "27fc68db7c862f35be0107eaa63e1c839fba850796b500a889e1e18cb2b62797",
    "tyutchev-poems-1868-research.pdf": "3db0c2ebcef65ad733f4218d74c990dd174263e66ef0dcba44b3f4180208aed1",
}
COMMON = {
    "country": "Russia", "language": "Russian", "lang": "ru", "direction": "ltr",
    "era": "19th century", "form": "Lyric", "themes": [], "mood": "paper", "translations": [],
}
PUSHKIN = {
    "author": "Alexander Pushkin", "authorId": "alexander-pushkin", "authorYears": "1799–1837",
    "authorOriginal": "Александр Сергеевич Пушкин",
    "authorAliases": ["Александр Пушкин", "А. С. Пушкин", "Aleksandr Pushkin", "Alexandre Pouchkine"],
}
TYUTCHEV = {
    "author": "Fyodor Tyutchev", "authorId": "fyodor-tyutchev", "authorYears": "1803–1873",
    "authorOriginal": "Фёдор Иванович Тютчев",
    "authorAliases": ["Федор Тютчев", "Фёдор Тютчев", "Fedor Tyutchev", "Fyodor Tiutchev"],
}
LERMONTOV = {
    "author": "Mikhail Lermontov", "authorId": "mikhail-lermontov", "authorYears": "1814–1841",
    "authorOriginal": "Михаил Юрьевич Лермонтов",
    "authorAliases": ["Михаил Лермонтов", "М. Ю. Лермонтов", "Mikhail Lermontoff"],
}
ANTHOLOGIES = "https://doi.org/10.31860/openlit-2021.9-B003"
HELLE = "https://doi.org/10.15845/bells.v7i0.1202"
NORMALIZATION = (
    " Pre-reform letters, punctuation typography and spacing are normalized; the scan is not reproduced."
    " Russia is an associated place, not an assertion of where the poem was written."
)
RIGHTS_END = (
    " Copyright, edition-related and moral rights vary by jurisdiction; check local law."
    " The scan is linked, not republished; no translation, score or recording is included."
)
WORKS = [
    {
        **PUSHKIN, "key": "pushkin-winter-road-1828", "stanzas": [4] * 7,
        "id": "russian-witness-pushkin-winter-road", "title": "Зимняя дорога",
        "year": 1828, "yearLabel": "1828 printing · not necessarily composition date",
        "collection": "Московский вестник · 1828",
        "sourceTitle": "Московский вестник · 1828, part 7, no. 4, pp. 405–406 / PDF pp. 405–406",
        "source": "https://commons.wikimedia.org/wiki/File:Московский_вестник._1828._Ч._7.pdf?page=405",
        "contextSourceTitle": "Vdovin, Leibov and Kazakova · historical school anthologies",
        "contextSource": ANTHOLOGIES,
        "searchAliases": ["Сквозь волнистые туманы", "Колокольчик однозвучный", "Winter Road", "Zimnyaya doroga"],
        "context": (
            "This separately headed, signed poem has seven quatrains in the 1828 printing."
            " It retains 'однозвучной', 'Мерной' and 'одне'; later texts commonly use"
            " 'однозвучный' and 'Мерный'. The linked index records 18 entries in historical"
            " school anthologies, including repeated editions and possibly excerpts; it is not a global ranking."
        ) + NORMALIZATION,
        "rights": (
            "The 1828 printing is public domain in the United States. Pushkin died in 1837;"
            " the periodical's editor Mikhail Pogodin died in 1875."
        ) + RIGHTS_END,
    },
    {
        **PUSHKIN, "key": "pushkin-demons-1832", "stanzas": [8] * 7,
        "id": "russian-witness-pushkin-demons", "title": "Бесы",
        "year": 1832, "yearLabel": "1832-titled almanac · not necessarily composition date",
        "collection": "Северные цветы · 1832",
        "sourceTitle": "Северные цветы на 1832 год · pp. 169–171 / PDF pp. 482–484",
        "source": "https://commons.wikimedia.org/wiki/File:Северные_цветы_на_1832_год,_1831.pdf?page=482",
        "contextSourceTitle": "Vdovin and Leibov · the Russian school canon, pp. 25–26",
        "contextSource": "https://ruthenia.ru/canon/canon.pdf",
        "searchAliases": ["Мчатся тучи, вьются тучи", "Освещает снег летучий", "Бесы Шалость", "Demons Pushkin"],
        "context": (
            "This complete, separately headed and signed poem has seven eight-line stanzas."
            " Its first, middle and final refrains respectively read 'Освещает мрак летучий',"
            " 'Озаряет снег летучий' and 'Освещает снег летучий'. The first may be a printing"
            " error; later texts commonly regularize the refrain. The 1832-titled almanac has no"
            " 'Шалость' subtitle. The linked study documents historical school-anthology reception,"
            " not a global ranking; a novel's epigraph is not a separate poem."
        ) + NORMALIZATION,
        "rights": (
            "The 1832-titled printing is public domain in the United States. Pushkin, who prepared"
            " the almanac, died in 1837; its publisher Orest Somov died in 1833."
        ) + RIGHTS_END,
    },
    {
        **TYUTCHEV, "key": "tyutchev-spring-waters-1832", "stanzas": [4] * 3,
        "id": "russian-witness-tyutchev-spring-waters", "title": "Весенние воды",
        "year": 1832, "yearLabel": "1832 printing · not necessarily composition date",
        "collection": "Телескоп · 1832",
        "sourceTitle": "Телескоп · 1832, part 10, no. 13, pp. 22–23 / PDF pp. 22–23",
        "source": "https://commons.wikimedia.org/wiki/File:Телескоп_Часть_10_Номера_13-16_1832.pdf?page=22",
        "contextSourceTitle": "Vdovin, Leibov and Kazakova · historical school anthologies",
        "contextSource": ANTHOLOGIES,
        "searchAliases": ["Ещё в полях белеет снег", "Еще в полях белеет снег", "Весна идет, весна идет", "Spring Waters"],
        "context": (
            "The 1832 periodical prints this separately headed and signed 12-line poem in three"
            " quatrains. It reads 'А воды с гор уже шумят' and 'Весна пришла, весна идет';"
            " the 1868 collection instead has 'А воды уж весной шумят' and 'Весна идет, весна идет'."
            " These are readings of one work. The linked school-anthology index records 12 historical"
            " entries, including repeated editions and possibly excerpts, not a global ranking."
        ) + NORMALIZATION,
        "rights": (
            "The 1832 printing is public domain in the United States. Tyutchev died in 1873;"
            " periodical editor Nikolay Nadezhdin died in 1856."
        ) + RIGHTS_END,
    },
    {
        **TYUTCHEV, "key": "tyutchev-autumn-1858", "stanzas": [4] * 3,
        "id": "russian-witness-tyutchev-autumn", "title": "Есть в осени первоначальной",
        "year": 1858, "yearLabel": "1858 printing · not necessarily composition date",
        "collection": "Русская беседа · 1858",
        "sourceTitle": "Русская беседа · 1858, book 10, item III, p. 3 / PDF p. 7",
        "source": "https://commons.wikimedia.org/wiki/File:Русская_беседа_1858_Книга_10.pdf?page=7",
        "contextSourceTitle": "Vdovin, Leibov and Kazakova · historical school anthologies",
        "contextSource": ANTHOLOGIES,
        "searchAliases": ["Короткая, но дивная пора", "Весь день стоит как бы хрустальный", "Есть в осени", "Early Autumn Tyutchev"],
        "context": (
            "The 1858 periodical labels its group 'Six Poems'; this complete untitled 12-line"
            " item is number III. The 1868 collection separately numbers it CXXIX and reads"
            " 'Весь день стоит как бы хрустальный' where this printing has 'Прозрачный воздух,"
            " день хрустальный'. They are one work. The linked index records seven historical"
            " school-anthology entries, including repeated editions and excerpts, not a global ranking."
        ) + NORMALIZATION,
        "rights": (
            "The 1858 printing is public domain in the United States. Tyutchev died in 1873;"
            " the periodical's publisher-editor Alexander Koshelev died in 1883."
        ) + RIGHTS_END,
    },
    {
        **TYUTCHEV, "key": "tyutchev-murderously-1854", "stanzas": [4] * 10,
        "id": "russian-witness-tyutchev-murderously", "title": "О, как убийственно мы любим",
        "year": 1854, "yearLabel": "1854 printing · not necessarily composition date",
        "collection": "Современник · 1854",
        "sourceTitle": "Современник · 1854, vol. 44, no. 3, LXVI, pp. 37–38 / PDF pp. 215–216",
        "source": "https://commons.wikimedia.org/wiki/File:Sovremennik_1854_03-04.pdf?page=215",
        "contextSourceTitle": "Lillian Jorunn Helle · Tiutchev and the Denis’eva poems",
        "contextSource": HELLE,
        "searchAliases": ["Как в буйной слепоте страстей", "Что сердцу нашему милей", "How murderously we love"],
        "context": (
            "The 1854 printing separately numbers this untitled 40-line lyric LXVI; its first line"
            " supplies the title. The opening quatrain returns at the end, with different punctuation."
            " Helle calls its opening stanza famous and explains that the later Denis’eva grouping"
            " was not originally planned as a cycle. Her English translation is not reproduced."
        ) + NORMALIZATION,
        "rights": (
            "The 1854 printing is public domain in the United States. Tyutchev died in 1873;"
            " the collection's preparer Ivan Turgenev died in 1883 and periodical publishers"
            " Nikolay Nekrasov and Ivan Panaev in 1878 and 1862."
        ) + RIGHTS_END,
    },
    {
        **TYUTCHEV, "key": "tyutchev-last-love-1854", "stanzas": [4] * 3,
        "id": "russian-witness-tyutchev-last-love", "title": "Последняя любовь",
        "year": 1854, "yearLabel": "1854 printing · not necessarily composition date",
        "collection": "Современник · 1854",
        "sourceTitle": "Современник · 1854, vol. 44, no. 3, LXVII, pp. 38–39 / PDF pp. 216–217",
        "source": "https://commons.wikimedia.org/wiki/File:Sovremennik_1854_03-04.pdf?page=216",
        "contextSourceTitle": "Lillian Jorunn Helle · Tiutchev and the Denis’eva poems",
        "contextSource": HELLE,
        "searchAliases": ["О, как на склоне наших лет", "Любви последней, зари вечерней", "Last Love Tyutchev"],
        "context": (
            "The 1854 periodical separately titles and numbers this complete 12-line poem LXVII,"
            " between two other poems. Helle describes it as often seen as emblematic of the later"
            " Denis’eva grouping, which she says was not originally planned as a cycle. She compares"
            " its plea for a moment to last with Faust; her English translation is not reproduced."
        ) + NORMALIZATION,
        "rights": (
            "The 1854 printing is public domain in the United States. Tyutchev died in 1873;"
            " the collection's preparer Ivan Turgenev died in 1883 and periodical publishers"
            " Nikolay Nekrasov and Ivan Panaev in 1878 and 1862."
        ) + RIGHTS_END,
    },
    {
        **LERMONTOV, "key": "lermontov-cliff-1843", "stanzas": [4] * 2,
        "id": "russian-witness-lermontov-cliff", "title": "Утёс",
        "year": 1843, "yearLabel": "1843 printing · not necessarily composition date",
        "collection": "Отечественные записки · 1843",
        "sourceTitle": "Отечественные записки · 1843, vol. 27, no. 4, section I, p. 331 / viewer p. 152",
        "source": "https://vivaldi.nlr.ru/bx000030636/view#page=152",
        "contextSourceTitle": "Vdovin, Leibov and Kazakova · historical school anthologies",
        "contextSource": ANTHOLOGIES,
        "searchAliases": ["Утес", "Ночевала тучка золотая", "На груди утеса-великана", "The Cliff Lermontov"],
        "context": (
            "This separately headed and signed eight-line lyric follows a prose work in the 1843"
            " periodical. The printing has a colon after 'Он стоит'; some later texts have a comma."
            " The linked index records six historical school-anthology entries, including repeated"
            " editions and possibly excerpts; it does not measure present-day global popularity."
        ) + NORMALIZATION,
        "rights": (
            "The 1843 printing is public domain in the United States. Lermontov died in 1841;"
            " periodical editor Andrey Krayevsky died in 1889."
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

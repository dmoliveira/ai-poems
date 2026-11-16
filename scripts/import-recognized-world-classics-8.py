#!/usr/bin/env python3
"""Reproduce four individually documented historical readings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-world-classics-8-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-world-classics-8.json"
READINGS_SHA256 = "6e67a21fbac0033eebe1ea90e3ffd5fc68a1a16e9e21842fa50f3c9b75e02dd0"

# Hashes identify the consulted copies; they do not prove transcription accuracy.
EVIDENCE = {
    "quan-tangshi-662-667-candidate.pdf": "a30ee4017e29f363986b7992aaeac0265dfd391d8100f46a63a538a311819527",
    "castro-orillas-sar-1884-candidate.pdf": "7c1602d4f4c96553f70af3a830a5180ad39738ac86a2af5ab9bf3aea8688dc5a",
    "hopkins-poems-1918-ia-candidate.pdf": "154b75c6bc8070ad9464dfe221269173713ffe3bca1206422c76e8705960de61",
    "yeats-wind-among-reeds-1899.pdf": "f68b9e8548fe4269fdc9d707b64ae6ab42280620b260188b4c1dbbd0ca615460",
}
CHINESE_RIGHTS = (
    "The historical poem and selected Qing-era reading are public domain in the United States. "
    "Copyright, edition-related and moral rights vary by jurisdiction; check local law. The scan is "
    "linked, not republished; its particular reproduction date is not established. Line breaks and "
    "punctuation are supplied, historical glyphs normalized, and search aliases are not translations. "
    "No translation or recording is included."
)
EUROPEAN_RIGHTS = (
    "The historical printing is public domain in the United States. Copyright, edition-related and moral rights "
    "vary by jurisdiction; check local law. The scan is linked, not republished. "
    "No translation or recording is included."
)
POLL = "https://wykontario.org/index.php/features-category/1150-100-favorite-poems-of-britain"

WORKS = [
    {
        "key": "luo-feng", "title": "蜂", "author": "Luo Yin", "authorId": "luo-yin",
        "authorOriginal": "羅隱", "authorYears": "833–910", "authorAliases": ["罗隐"],
        "country": "China", "language": "Chinese", "lang": "zh-Hant", "era": "Tang dynasty", "year": None,
        "yearLabel": "Tang dynasty · exact composition year unknown", "form": "Verse", "collection": "御定全唐詩 · 四庫全書",
        "context": (
            "The title ends p. 20 and the complete quatrain appears on p. 21, before 簾二首; p. 2 names "
            "Luo Yin. A small note gives 不知 as an alternative to 為誰, not extra verse. An educational "
            "selection discusses this poem individually. Line breaks and punctuation are supplied and historical "
            "glyphs normalized. China is an associated place, not a claim about composition."
        ),
        "sourceTitle": "御定全唐詩 · 四庫全書, 卷六百六十二, PDF pp. 2 and 20–21",
        "source": "https://archive.org/download/06060099.cn/06060099.cn.pdf#page=20",
        "contextSourceTitle": "Classical Chinese Literature · individual educational selection",
        "contextSource": "https://www.classicalchineseliterature.org/article.php?article=%E8%9C%82",
        "rights": CHINESE_RIGHTS,
        "searchAliases": [
            "不论平地与山尖，无限风光尽被占。\n采得百花成蜜后，为谁辛苦为谁甜。",
            "不论平地与山尖无限风光尽被占采得百花成蜜后为谁辛苦为谁甜",
            "不知辛苦為誰甜", "不知辛苦为谁甜", "The Bee",
        ],
        "stanzas": [4],
    },
    {
        "key": "castro-dicen", "title": "Dicen que no hablan las plantas", "author": "Rosalía de Castro",
        "authorId": "rosalia-de-castro", "authorYears": "1837–1885", "authorAliases": ["Rosalia de Castro"],
        "country": "Spain", "language": "Spanish", "lang": "es", "era": "19th century", "year": 1884,
        "yearLabel": "1884 printing · not necessarily composition date", "form": "Lyric",
        "collection": "En las orillas del Sar · 1884",
        "context": (
            "This otherwise untitled poem occupies an ornamented page in the 1884 printing; the preceding "
            "page is blank and Cada vez que recuerda tanto oprobio follows under an asterisk marker. "
            "The first line supplies the display title. Ciudad Seva selects this text as a complete poem. "
            "The printing retains murmureis and the unaccented second como in the final question. The short "
            "Ahí va la loca line is retained; spacing is normalized. Spain is an associated place, not a claim "
            "about composition."
        ),
        "sourceTitle": "En las orillas del Sar · Madrid, 1884, p. 109",
        "source": "https://upload.wikimedia.org/wikipedia/commons/8/82/En_las_orillas_del_Sar_1884.pdf#page=111",
        "contextSourceTitle": "Ciudad Seva · individual literary selection",
        "contextSource": "https://ciudadseva.com/texto/dicen-que-no-hablan-las-plantas/",
        "rights": EUROPEAN_RIGHTS,
        "searchAliases": ["Dicen que no hablan las plantas, ni las fuentes, ni los pájaros", "Astros y fuentes y flores"],
        "stanzas": [8, 5, 2],
    },
    {
        "key": "hopkins-gods-grandeur", "title": "God’s Grandeur", "author": "Gerard Manley Hopkins",
        "authorId": "gerard-manley-hopkins", "authorYears": "1844–1889", "country": "England",
        "language": "English", "lang": "en", "era": "19th century", "year": 1918,
        "yearLabel": "1918 catalogue date · not necessarily composition date", "form": "Sonnet",
        "collection": "Poems of Gerard Manley Hopkins · Robert Bridges edition",
        "context": (
            "This complete fourteen-line poem occupies p. 26 before The Starlight Night. The title page "
            "does not print a year; the National Library of Ireland catalogues the Bridges edition as 1918. "
            "A secondary transcription of a 1995 British poll lists the poem individually, not as a global "
            "ranking. Printer-wrapped lines are rejoined; spacing and indentation are normalized. England "
            "is an associated place, not a claim about composition."
        ),
        "sourceTitle": "Poems of Gerard Manley Hopkins · Bridges edition, p. 26",
        "source": "https://archive.org/download/poemsofgerardman030114mbp/poemsofgerardman030114mbp.pdf#page=40",
        "contextSourceTitle": "Wah Yan College alumni · transcription of 1995 BBC poll",
        "contextSource": POLL,
        "rights": EUROPEAN_RIGHTS,
        "searchAliases": ["The world is charged with the grandeur of God", "the dearest freshness deep down things"],
        "stanzas": [8, 6],
    },
    {
        "key": "yeats-wandering-aengus", "title": "The Song of Wandering Aengus", "author": "William Butler Yeats",
        "authorId": "william-butler-yeats", "authorYears": "1865–1939", "country": "Ireland",
        "language": "English", "lang": "en", "era": "19th century", "year": 1899,
        "yearLabel": "1899 printing · not necessarily composition date", "form": "Lyric",
        "collection": "The Wind Among the Reeds · 1899",
        "context": (
            "The three complete eight-line stanzas occupy pp. 15–16; the second crosses the page turn and "
            "The Song of the Old Mother begins on p. 17. A separately printed author's note is prose, not "
            "another stanza or work. A secondary transcription of a 1995 British poll lists this poem "
            "individually, not as a global ranking. Spacing is normalized; Ireland is an associated place, "
            "not a claim about composition."
        ),
        "sourceTitle": "The Wind Among the Reeds · New York and London, 1899, pp. 15–16",
        "source": "https://archive.org/download/windamongreeds00yeat/windamongreeds00yeat.pdf#page=27",
        "contextSourceTitle": "Wah Yan College alumni · transcription of 1995 BBC poll",
        "contextSource": POLL,
        "rights": EUROPEAN_RIGHTS,
        "searchAliases": ["I went out to the hazel wood", "the silver apples of the moon", "Song of the Wandering Aengus"],
        "stanzas": [8, 8, 8],
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
        if [len(stanza.splitlines()) for stanza in text.split("\n\n")] != work["stanzas"]:
            raise ValueError(f"Unexpected stanza boundaries: {work['key']}")
        record = {key: value for key, value in work.items() if key not in {"key", "stanzas"}}
        record.update({
            "id": "recognized-world-classics-8-" + work["key"], "direction": "ltr", "themes": [],
            "mood": "paper", "text": text, "translations": [],
        })
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

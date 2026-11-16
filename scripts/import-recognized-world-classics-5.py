#!/usr/bin/env python3
"""Reproduce individually documented Chinese and Swedish historical readings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-world-classics-5-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-world-classics-5.json"
READINGS_SHA256 = "ac151bb83e8a91db47403077a3476d7e1b96060a8467b768405baba3aaace596"

# Hashes identify the consulted copies; they do not prove transcription accuracy.
EVIDENCE = {
    "06056059-future-candidate.pdf": "c498243e3e45c172387952e15d03101f527e296a58ad182c750fd7e1471ec611",
    "06060085-future-candidate.pdf": "d683de77085a63cb7eff8ff154cf575a844e5b98d1a7e848151c597f208e6bc6",
    "06063882.cn.pdf": "2e52131cbb4ff208cbdb5e25b1c36d08fc4e8dd659987597f739e25e4fd1e8a9",
    "andersson-kolvakt-1915-p33.jpg": "641e27a18013051cb19e0184b9722af514934c21cd2f52fd22a598f6f005425b",
    "andersson-kolvakt-1915-p34.jpg": "ff764376e51329e97c00384d2e7e8e1f138d40ed30b52c8af4c0b74df729808b",
    "andersson-kolvakt-1915-p73.jpg": "7e8372a40d6680d6646e562cb4d35f31478355b195fa25af9492b34caa1e1804",
    "andersson-kolvakt-1915-p74.jpg": "f3afbd056010d3d76b6ddedfbbb429f86bd9bb6f8455727c4cfca8f1e7fc991f",
    "andersson-kolvakt-1915-p75.jpg": "35e7941ff24cd4806906790f08e300f5ba8287d9a996a620ef80bd41b6f92c5c",
}
EDB = "https://www.edb.gov.hk/attachment/tc/curriculum-development/kla/chi-edu/resources/primary/lang/jilei_shi_pdf/"
LB = "https://litteraturbanken.se/forfattare/AnderssonD/titlar/KolvaktarensVisor/sida/"
CHINESE_RIGHTS = (
    "The historical poem and selected Qing-era reading are public domain in the United States. "
    "Copyright, edition-related and moral rights vary by jurisdiction; check local law. The scan is "
    "linked, not republished. Line breaks and punctuation are supplied, historical glyphs normalized, "
    "and simplified search aliases are not separate editions or translations. No translation or recording is included."
)
SWEDISH_RIGHTS = (
    "The 1915 printing is public domain in the United States; Andersson died in 1920. "
    "Copyright, edition-related and moral rights vary by jurisdiction; check local law. "
    "The facsimile is linked, not republished. No translation or recording is included."
)


def aliases(simplified, *extra):
    return [simplified, re.sub(r"[\s，。！？]", "", simplified), *extra]


WORKS = [
    {
        "key": "su-ti-xilin-bi", "title": "題西林壁", "author": "Su Shi", "authorId": "su-shi",
        "authorOriginal": "蘇軾", "authorYears": "1037–1101", "authorAliases": ["苏轼", "蘇東坡", "苏东坡", "Su Dongpo"],
        "country": "China", "language": "Chinese", "lang": "zh-Hant", "era": "Song dynasty", "year": None,
        "yearLabel": "Song dynasty · exact year not established here", "form": "Verse", "collection": "蘇詩補註 · 四庫全書",
        "context": (
            "The separately headed quatrain ends before 西林 in the Qing-era 蘇詩補註, edited by 查慎行. "
            "Its main reading is 遠近高低各不同; small notes identify 看山了 and 無一 as alternatives, "
            "not extra verse. The same poem is quoted in the prose 記遊廬山, not a second work. "
            "The Hong Kong Education Bureau discusses this poem individually. Line breaks and punctuation "
            "are supplied and historical glyph forms normalized; China is an associated place, not a claim "
            "about composition."
        ),
        "sourceTitle": "蘇詩補註 · 四庫全書, 卷二十三, PDF p. 14",
        "source": "https://archive.org/download/06056059.cn/06056059.cn.pdf#page=14",
        "contextSourceTitle": "Hong Kong Education Bureau · individual recitation selection",
        "contextSource": EDB + "jilei_shi_079.pdf", "rights": CHINESE_RIGHTS,
        "searchAliases": aliases(
            "横看成岭侧成峰，\n远近高低各不同。\n不识庐山真面目，\n只缘身在此山中。",
            "题西林壁", "橫看成嶺側成峯", "遠近高低看山了", "遠近高低無一同",
            "题西林寺壁", "Inscribed on the Wall of Xilin Temple",
        ),
        "stanzas": [4],
    },
    {
        "key": "cao-guancang-shu", "title": "官倉鼠", "author": "Cao Ye", "authorId": "cao-ye",
        "authorOriginal": "曹鄴", "authorYears": "Tang dynasty", "authorAliases": ["曹邺", "Ts'ao Yeh"],
        "country": "China", "language": "Chinese", "lang": "zh-Hant", "era": "Tang dynasty", "year": None,
        "yearLabel": "Tang dynasty · exact year unknown", "form": "Verse", "collection": "御定全唐詩 · 四庫全書",
        "context": (
            "The complete quatrain is separately headed before 題濮廟 in the Cao Ye volume. The main "
            "reading says 大如斗; a small note gives 牛 as an alternative, not additional verse. The Hong Kong "
            "Education Bureau discusses the individual poem. Line breaks and punctuation are supplied; "
            "China is an associated place, not a claim about composition."
        ),
        "sourceTitle": "御定全唐詩 · 四庫全書, 卷五百九十二, PDF pp. 107, 119–120",
        "source": "https://archive.org/download/06060085.cn/06060085.cn.pdf#page=120",
        "contextSourceTitle": "Hong Kong Education Bureau · individual recitation selection",
        "contextSource": EDB + "jilei_shi_069.pdf", "rights": CHINESE_RIGHTS,
        "searchAliases": aliases(
            "官仓老鼠大如斗，\n见人开仓亦不走。\n健儿无粮百姓饥，\n谁遣朝朝入君口。",
            "官仓鼠", "官倉老鼠大如牛", "官仓老鼠大如牛", "The Granary Rat",
        ),
        "stanzas": [4],
    },
    {
        "key": "yu-yong-ying", "title": "詠螢", "author": "Yu Shinan", "authorId": "yu-shinan",
        "authorOriginal": "虞世南", "authorYears": "558–638", "authorAliases": ["Yü Shih-nan"],
        "country": "China", "language": "Chinese", "lang": "zh-Hant", "era": "Tang dynasty", "year": None,
        "yearLabel": "Exact composition date not established here", "form": "Verse", "collection": "御定全唐詩 · 四庫全書",
        "context": (
            "The heading is at the end of PDF p. 14 and the complete quatrain is on p. 15 before 蟬. "
            "This historical witness reads 的歷 and 飄颻; the Education Bureau also explains 飄搖 as "
            "an equivalent form. Its individual recitation selection documents regional attention, not a "
            "global ranking. Line breaks and punctuation are supplied and historical glyph forms normalized; "
            "China is an associated place, not a claim about composition."
        ),
        "sourceTitle": "御定全唐詩 · 四庫全書, 卷三十六, PDF pp. 14–15",
        "source": "https://archive.org/download/06063882.cn/06063882.cn.pdf#page=14",
        "contextSourceTitle": "Hong Kong Education Bureau · individual recitation selection",
        "contextSource": EDB + "jilei_shi_012.pdf", "rights": CHINESE_RIGHTS,
        "searchAliases": aliases(
            "的历流光小，\n飘飖弱翅轻。\n恐畏无人识，\n独自暗中明。",
            "咏萤", "飄搖弱翅輕", "飘摇弱翅轻", "Ode to the Firefly",
        ),
        "stanzas": [4],
    },
    {
        "key": "andersson-jag-vantar", "title": "Jag väntar…", "author": "Dan Andersson",
        "authorId": "dan-andersson", "authorYears": "1888–1920", "country": "Sweden",
        "language": "Swedish", "lang": "sv", "era": "20th century", "year": 1915,
        "yearLabel": "1915 printing · not necessarily composition date", "form": "Verse",
        "collection": "Kolvaktarens visor · 1915",
        "context": (
            "The separately headed poem has four complete quatrains on pp. 33–34; Till kvinnan begins "
            "on p. 35. The 1915 printing retains the comma after blomma; two lines wrapped by the printer "
            "are rejoined, and dash typography and indentation are normalized. Litteraturbanken selects "
            "the individual poem for a reading; neither that recording nor any musical setting is included. "
            "Sweden is an associated place, not a claim about composition."
        ),
        "sourceTitle": "Kolvaktarens visor · Stockholm, 1915, pp. 33–34",
        "source": LB + "33/faksimil", "contextSourceTitle": "Litteraturbanken · individual reading",
        "contextSource": "https://litteraturbanken.se/ljudochbild/forfattare/anderssond/", "rights": SWEDISH_RIGHTS,
        "searchAliases": ["Jag väntar vid min stockeld", "Jag väntar vid min mila"], "stanzas": [4, 4, 4, 4],
    },
    {
        "key": "andersson-halgdagskvall", "title": "Hälgdagskväll i timmerkojan", "author": "Dan Andersson",
        "authorId": "dan-andersson", "authorYears": "1888–1920", "country": "Sweden",
        "language": "Swedish", "lang": "sv", "era": "20th century", "year": 1915,
        "yearLabel": "1915 printing · not necessarily composition date", "form": "Verse",
        "collection": "Kolvaktarens visor · 1915",
        "context": (
            "The separately headed poem has nine complete quatrains on pp. 73–75; När Gasken dog starts "
            "on p. 76. The 1915 title and first stanza have Hälgdagskväll and hälg, while Litteraturbanken's "
            "modern teaching selection reads Helgdagskväll and helg. It prints spela en vals; a separate "
            "online transcription omits en. Dash typography, spacing and indentation are normalized. "
            "Litteraturbanken discusses the individual poem for school readers; Sweden is an associated "
            "place, not a claim about composition."
        ),
        "sourceTitle": "Kolvaktarens visor · Stockholm, 1915, pp. 73–75",
        "source": LB + "73/faksimil", "contextSourceTitle": "Litteraturbanken · individual teaching selection",
        "contextSource": "https://litteraturbanken.se/skolan/poesi-forfattare-dan-andersson-heldagskvall-i-timmerkojan/",
        "rights": SWEDISH_RIGHTS,
        "searchAliases": ["Helgdagskväll i timmerkojan", "här är helg", "Bort längtande vekhet ur sotiga bröst"],
        "stanzas": [4] * 9,
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
            "id": "recognized-world-classics-5-" + work["key"], "direction": "ltr", "themes": [],
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

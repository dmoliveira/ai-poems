#!/usr/bin/env python3
"""Reproduce individually documented historical readings in Chinese and English."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-multilingual-classics-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-multilingual-classics.json"
READINGS_SHA256 = "d05d892268f0a7a9df34cdc0bdcd43e8738f880ca1f769049e34117dd7004a07"

# These identify the examined copies, not the accuracy of their transcriptions.
EVIDENCE = {
    "qianjiashi-nlc-1621-44.pdf": "d1cfd33466809ab2a2f2b4b192b41ac2fc33b3e914783072bf1f7a1dd8e9e80c",
    "sibu-dumu-02-p7.jpg": "310ebd03dd9e086eb13349ae2c1b337faae1d2b56a9c1234c9993ff5bb764060",
    "frost-north-1914.pdf": "0f78809ba9072a5ff4fcbeb47a22e14e3446d226e445245f4af12d047f4782c0",
}

EDB = "https://www.edb.gov.hk/attachment/tc/curriculum-development/kla/chi-edu/resources/primary/lang/jilei_shi_pdf/"
NLC = "https://commons.wikimedia.org/wiki/File:NLC892-002340424-402613_千家詩音釋_二卷.pdf?page="
WORKS = [
    {
        "key": "du-jiangnan-chun", "title": "江南春絶句", "author": "Du Mu", "authorId": "du-mu",
        "authorOriginal": "杜牧", "authorYears": "Tang dynasty", "authorAliases": [], "dynasty": "Tang",
        "collection": "樊川文集 · 四部叢刊", "sourceTitle": "樊川文集 · 四部叢刊, page 7",
        "source": "https://commons.wikimedia.org/wiki/File:Sibu_Congkan0749-杜牧-樊川文集-5-2.djvu?page=7",
        "reception": EDB + "jilei_shi_065.pdf",
        "detail": (
            "This separately headed quatrain precedes 將赴宣州留題揚州禪智寺. The Hong Kong Education "
            "Bureau discusses it individually under the shorter title 江南春. The linked facsimile "
            "reproduces a Ming printing; its exact 四部叢刊 impression has not been independently dated."
        ),
        "simplified": "千里莺啼绿映红，\n水村山郭酒旗风。\n南朝四百八十寺，\n多少楼台烟雨中。",
        "aliases": ["江南春", "江南春绝句"],
    },
    {
        "key": "zhu-chunri", "title": "春日", "author": "Zhu Xi", "authorId": "zhu-xi",
        "authorOriginal": "朱熹", "authorYears": "1130–1200", "authorAliases": ["朱文公"], "dynasty": "Song",
        "collection": "千家詩音釋", "sourceTitle": "千家詩音釋 · NLC-catalogued copy, PDF p. 2", "page": 2,
        "reception": EDB + "jilei_shi_088.pdf",
        "detail": (
            "The anthology separately heads this quatrain 春日 and names the author 朱文公. "
            "The Hong Kong Education Bureau includes it in its individual recitation selections."
        ),
        "simplified": "胜日寻芳泗水滨，\n无边光景一时新。\n等闲识得东风面，\n万紫千红总是春。",
    },
    {
        "key": "ye-youyuan-buzhi", "title": "遊園不值", "author": "Ye Shaoweng", "authorId": "ye-shaoweng",
        "authorOriginal": "葉紹翁", "authorYears": "Song dynasty · dates unknown", "authorAliases": ["叶绍翁"],
        "dynasty": "Song", "collection": "千家詩音釋",
        "sourceTitle": "千家詩音釋 · NLC-catalogued copy, PDF p. 6", "page": 6,
        "reception": EDB + "jilei_shi_092.pdf",
        "detail": (
            "The anthology prints 應嫌 and 十扣柴扉九不開 and names 葉清逸; a separately inspected "
            "Qing collection identifies 葉紹翁 as 靖逸 and reads 應憐 and 小扣柴扉久不開. "
            "The Hong Kong Education Bureau attributes the poem to Ye Shaoweng and uses the latter reading. "
            "These differing names and readings warrant caution; they are not separate works."
        ),
        "simplified": "应嫌屐齿印苍苔，\n十扣柴扉九不开。\n春色满园关不住，\n一枝红杏出墙来。",
        "aliases": ["游园不值", "應憐屐齒印蒼苔", "应怜屐齿印苍苔", "小扣柴扉久不開", "小扣柴扉久不开"],
    },
    {
        "key": "lin-ti-linan-di", "title": "題臨安邸", "author": "Lin Sheng", "authorId": "lin-sheng",
        "authorOriginal": "林升", "authorYears": "Song dynasty · dates unknown", "authorAliases": ["林夢屏", "林梦屏"],
        "dynasty": "Song", "collection": "千家詩音釋",
        "sourceTitle": "千家詩音釋 · NLC-catalogued copy, PDF p. 13", "page": 13,
        "reception": EDB + "jilei_shi_090.pdf",
        "detail": (
            "The anthology titles this complete quatrain 西湖 and names 林夢屏; the Hong Kong Education "
            "Bureau calls it 題臨安邸 and identifies 夢屏 as Lin Sheng's courtesy name. "
            "Its witness reads 薰 where the recitation selection uses 熏."
        ),
        "simplified": "山外青山楼外楼，\n西湖歌舞几时休。\n暖风薰得游人醉，\n直把杭州作汴州。",
        "aliases": ["题临安邸", "西湖", "暖風熏得遊人醉", "暖风熏得游人醉"],
    },
    {
        "key": "su-zeng-liu-jingwen", "title": "贈劉景文", "author": "Su Shi", "authorId": "su-shi",
        "authorOriginal": "蘇軾", "authorYears": "1037–1101", "authorAliases": ["苏轼", "蘇東坡", "苏东坡", "Su Dongpo"],
        "dynasty": "Song", "collection": "千家詩音釋",
        "sourceTitle": "千家詩音釋 · NLC-catalogued copy, PDF p. 15", "page": 15,
        "reception": EDB + "jilei_shi_082.pdf",
        "detail": (
            "The anthology separately heads this quatrain 冬景 and attributes it to 蘇東坡. "
            "The Hong Kong Education Bureau discusses the same poem individually as 贈劉景文 by 蘇軾."
        ),
        "simplified": "荷尽已无擎雨盖，\n菊残犹有傲霜枝。\n一年好景君须记，\n最是橙黄橘绿时。",
        "aliases": ["赠刘景文", "冬景"],
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
    if list(readings) != [work["key"] for work in WORKS] + ["frost-mending-wall"]:
        raise ValueError("Unexpected reading selection or order")

    records = []
    for work in WORKS:
        text = readings[work["key"]]
        if len(text.splitlines()) != 4:
            raise ValueError(f"Unexpected line count: {work['key']}")
        simplified = work["simplified"]
        aliases = [simplified, re.sub(r"[\s，。]+", "", simplified), *work.get("aliases", [])]
        records.append({
            "id": "recognized-multilingual-classics-" + work["key"], "title": work["title"],
            "author": work["author"], "authorId": work["authorId"], "authorOriginal": work["authorOriginal"],
            "authorYears": work["authorYears"], "authorAliases": work["authorAliases"],
            "country": "China", "language": "Chinese", "lang": "zh-Hant", "direction": "ltr",
            "year": None, "yearLabel": work["dynasty"] + " dynasty · exact year unknown", "era": work["dynasty"] + " dynasty",
            "form": "Verse", "collection": work["collection"], "themes": [], "mood": "paper",
            "context": work["detail"] + (
                " Line breaks and punctuation are supplied; historical glyph forms are normalized. "
                "China is an associated place, not a claim about the place of composition."
            ),
            "sourceTitle": work["sourceTitle"], "source": work.get("source") or NLC + str(work["page"]),
            "contextSourceTitle": "Hong Kong Education Bureau · individual recitation selection",
            "contextSource": work["reception"],
            "rights": (
                "The historical poem and selected reading are public domain in the United States. "
                "Copyright, edition-related and moral rights vary by jurisdiction; check local law. "
                "The scan is linked, not republished. Line breaks and punctuation are supplied and some "
                "historical glyphs normalized; search aliases are not separate editions or translations. "
                "No translation or recording is included."
            ),
            "text": text, "translations": [], "searchAliases": aliases,
        })
    frost = readings["frost-mending-wall"]
    if len(frost.splitlines()) != 45:
        raise ValueError("Unexpected Mending Wall line count")
    records.append({
        "id": "recognized-multilingual-classics-frost-mending-wall", "title": "Mending Wall",
        "author": "Robert Frost", "authorId": "robert-frost", "authorYears": "1874–1963",
        "country": "United States", "language": "English", "lang": "en", "direction": "ltr",
        "year": 1914, "yearLabel": "1914 printing · not necessarily composition date", "era": "20th century",
        "form": "Verse", "collection": "North of Boston · 1914", "themes": [], "mood": "paper",
        "context": (
            "The separately titled poem spans printed pp. 11–13. The first London edition retains "
            "neighbour, neighbours, offence and out-door; hanging printer wraps are rejoined into 45 verse lines. "
            "Spacing and quotation typography are normalized. Poetry Foundation's individual guide documents "
            "the poem's reception. The associated country is not a claim about the place of composition."
        ),
        "sourceTitle": "North of Boston · London, first edition, 1914, pp. 11–13",
        "source": "https://archive.org/download/northofboston00frosrich/northofboston00frosrich.pdf#page=15",
        "contextSourceTitle": "Poetry Foundation · individual poem guide",
        "contextSource": "https://www.poetryfoundation.org/articles/150774/robert-frost-mending-wall",
        "rights": (
            "The 1914 printing is public domain in the United States; Robert Frost died in 1963. "
            "Copyright and moral rights vary by jurisdiction, so check local law. The scan is linked, not "
            "republished; the verse was transcribed from its historical pages. No translation or recording is included."
        ),
        "text": frost, "translations": [],
    })
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

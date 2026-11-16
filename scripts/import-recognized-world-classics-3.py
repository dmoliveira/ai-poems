#!/usr/bin/env python3
"""Reproduce individually documented Chinese, Spanish, and Finnish readings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-world-classics-3-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-world-classics-3.json"
READINGS_SHA256 = "6c774a251aab045b1ed3515d8faa6dc7b30e3e0c4e167bbf12bcef15c36b8962"

# Hashes identify the inspected copies, not the accuracy of their transcriptions.
EVIDENCE = {
    "quan-tangshi-111-117.pdf": "deeaea6a287cdd5ba02735188b0ffa28689d2f0842d3cb7e961148a951f4ea6c",
    "06060050.cn.pdf": "424bad0e60a6b5d0b32392e8783ff079e4fd9dc99b8e00e4660a17c4e093bc65",
    "06060020.cn.pdf": "78f25c574ec1d2b25ab6c42c76d6326b89a98c53f2fadfe199757cd6a9df0ee9",
    "06060022.cn.pdf": "f191679c9213117ddd0560fea26903079c777d8db82610cb2c886d3a385a1f2b",
    "dario-cantos-1905.pdf": "a751d7728c21fa291b255631b820b6860c98c18c45e3ffbefccdf922361ff04a",
    "gongora-bpl-1654.pdf": "0c2d56cb2bb2c8656268f6fffc6fbdce18b913612498d5ff3f0465723f8f542f",
    "gongora-sevilla-1654.pdf": "265f2e023ba8eff16f1cba0e7b4ac275b4e81c31b0134a45581e0a119991a413",
    "leino-hiihtajan-virsia-1900.pdf": "9990525f66cd24139a8f6acb76ce3712ce6c02545d42691d960c78cd828810a2",
}
EDB = "https://www.edb.gov.hk/attachment/tc/curriculum-development/kla/chi-edu/resources/primary/lang/jilei_shi_pdf/"
OXFORD = "https://new.ox.ac.uk/sites/default/files/2025-08/Spanish%20New%20FPE%20GA%20Sonnets%202025%20compressed.pdf"
TANG_RIGHTS = (
    "The historical poem and selected reading are public domain in the United States. "
    "Copyright, edition-related and moral rights vary by jurisdiction; check local law. "
    "The scan is linked, not republished. Line breaks and punctuation are supplied; some historical "
    "glyphs are normalized, and search aliases are not separate editions or translations. "
    "No translation or recording is included."
)
HISTORICAL_RIGHTS = (
    "The historical printing is public domain in the United States. Copyright, edition-related and "
    "moral rights vary by jurisdiction; check local law. The scan is linked, not republished. "
    "No translation or recording is included."
)

SIMPLIFIED_ZHANG = """春江潮水连海平，
海上明月共潮生。
滟滟随波千万里，
何处春江无月明。
江流宛转绕芳甸，
月照花林皆似霰。
空里流霜不觉飞，
汀上白沙看不见。
江天一色无纤尘，
皎皎空中孤月轮。
江畔何人初见月，
江月何年初照人？
人生代代无穷已，
江月年年祇相似。
不知江月待何人，
但见长江送流水。
白云一片去悠悠，
青枫浦上不胜愁。
谁家今夜扁舟子，
何处相思明月楼？
可怜楼上月徘徊，
应照离人妆镜台。
玉户帘中卷不去，
捣衣砧上拂还来。
此时相望不相闻，
愿逐月华流照君。
鸿雁长飞光不度，
鱼龙潜跃水成文。
昨夜闲潭梦落花，
可怜春半不还家。
江水流春去欲尽，
江潭落月复西斜。
斜月沉沉藏海雾，
碣石潇湘无限路。
不知乘月几人归，
落月遥情满江树。"""


def aliases(simplified, *extra):
    return [simplified, re.sub(r"[\s，。！？]", "", simplified), *extra]


WORKS = [
    {
        "key": "zhang-chunjiang-huayueye", "title": "春江花月夜", "author": "Zhang Ruoxu",
        "authorId": "zhang-ruoxu", "authorOriginal": "張若虛", "authorYears": "Dates not established here",
        "authorAliases": ["张若虚"], "country": "China", "language": "Chinese", "lang": "zh-Hant",
        "era": "Tang dynasty", "year": None, "yearLabel": "Tang dynasty · exact year unknown",
        "form": "Verse", "collection": "御定全唐詩 · 四庫全書",
        "context": (
            "The separately headed 36-line poem spans PDF pages 132–134 and ends before 代答閨夢還. "
            "This witness reads 落月遥情滿江樹, normalized here to 遙情; the Hong Kong Education Bureau's "
            "individual selection reads 搖情. Its small print marks 里/頃, 妝/玉 and 玉/遮 as variants; "
            "these notes are not additional verse. 沈沈 is retained, and historical glyphs are normalized. "
            "春江花月夜 is also an older shared song-title: other poems with that title are not necessarily "
            "this work. Line breaks and punctuation are supplied; China is an associated place, not a "
            "claim about composition."
        ),
        "sourceTitle": "御定全唐詩 · 四庫全書, 卷一百十七, PDF pp. 132–134",
        "source": "https://archive.org/download/06063895.cn/06063895.cn.pdf#page=132",
        "contextSourceTitle": "Hong Kong Education Bureau · individual recitation selection",
        "contextSource": EDB + "jilei_shi_017.pdf", "rights": TANG_RIGHTS,
        "searchAliases": aliases(
            SIMPLIFIED_ZHANG, "落月搖情滿江樹", "落月摇情满江树", "江月年年只相似",
            "Spring River Flower Moon Night", "A Moonlit Night on the Spring River",
        ),
        "stanzas": [36],
    },
    {
        "key": "bai-mujiangyin", "title": "暮江吟", "author": "Bai Juyi", "authorId": "bai-juyi",
        "authorOriginal": "白居易", "authorYears": "Tang dynasty", "country": "China",
        "language": "Chinese", "lang": "zh-Hant", "era": "Tang dynasty", "year": None,
        "yearLabel": "Tang dynasty · exact year unknown", "form": "Verse", "collection": "御定全唐詩 · 四庫全書",
        "context": (
            "The heading appears at the end of PDF p. 140; the complete quatrain is on p. 141 before "
            "思婦眉. This witness reads 可憐九月初三夜 and 真珠. The Hong Kong Education Bureau "
            "discusses this poem individually and notes competing accounts of when and where it was written. "
            "Line breaks and punctuation are supplied; China is an associated place, not a claim about composition."
        ),
        "sourceTitle": "御定全唐詩 · 四庫全書, 卷四百四十二, PDF pp. 140–141",
        "source": "https://archive.org/download/06060050.cn/06060050.cn.pdf#page=140",
        "contextSourceTitle": "Hong Kong Education Bureau · individual recitation selection",
        "contextSource": EDB + "jilei_shi_054.pdf", "rights": TANG_RIGHTS,
        "searchAliases": aliases(
            "一道残阳铺水中，\n半江瑟瑟半江红。\n可怜九月初三夜，\n露似真珠月似弓。",
            "露似珍珠月似弓", "誰憐九月初三夜", "谁怜九月初三夜", "Song of the Evening River",
        ),
        "stanzas": [4],
    },
    {
        "key": "sikong-jiangcun-jishi", "title": "江村即事", "author": "Sikong Shu", "authorId": "sikong-shu",
        "authorOriginal": "司空曙", "authorYears": "Tang dynasty", "country": "China", "language": "Chinese",
        "lang": "zh-Hant", "era": "Tang dynasty", "year": None,
        "yearLabel": "Tang dynasty · exact year unknown", "form": "Verse", "collection": "御定全唐詩 · 四庫全書",
        "context": (
            "The quatrain's heading is at the end of PDF p. 83, and the complete verse ends the volume on p. 84; "
            "the next volume begins on p. 85. The Hong Kong Education Bureau includes it as an individual "
            "recitation selection. Line breaks and punctuation are supplied; China is an associated place, "
            "not a claim about the place of composition."
        ),
        "sourceTitle": "御定全唐詩 · 四庫全書, 卷二百九十二, PDF pp. 83–84",
        "source": "https://archive.org/download/06060020.cn/06060020.cn.pdf#page=83",
        "contextSourceTitle": "Hong Kong Education Bureau · individual recitation selection",
        "contextSource": EDB + "jilei_shi_046.pdf", "rights": TANG_RIGHTS,
        "searchAliases": aliases(
            "钓罢归来不系船，\n江村月落正堪眠。\n纵然一夜风吹去，\n只在芦花浅水边。",
            "Fishing in a River Village",
        ),
        "stanzas": [4],
    },
    {
        "key": "wang-xiaosong", "title": "小松", "author": "Wang Jian", "authorId": "wang-jian",
        "authorOriginal": "王建", "authorYears": "Tang dynasty", "country": "China", "language": "Chinese",
        "lang": "zh-Hant", "era": "Tang dynasty", "year": None,
        "yearLabel": "Tang dynasty · exact year unknown", "form": "Verse", "collection": "御定全唐詩 · 四庫全書",
        "context": (
            "The complete, separately headed quatrain precedes 秋夜 on PDF p. 6. The Hong Kong Education "
            "Bureau discusses it individually and notes 傍/旁 as variant spellings. Historical glyph forms "
            "are normalized; line breaks and punctuation are supplied. China is an associated place, "
            "not a claim about composition."
        ),
        "sourceTitle": "御定全唐詩 · 四庫全書, 卷三百一, PDF p. 6",
        "source": "https://archive.org/download/06060022.cn/06060022.cn.pdf#page=6",
        "contextSourceTitle": "Hong Kong Education Bureau · individual recitation selection",
        "contextSource": EDB + "jilei_shi_049.pdf", "rights": TANG_RIGHTS,
        "searchAliases": aliases(
            "小松初数尺，\n未有直生枝。\n闲即傍边立，\n看多长却迟。", "閑即旁邊立", "闲即旁边立", "A Little Pine",
        ),
        "stanzas": [4],
    },
    {
        "key": "dario-a-roosevelt", "title": "A Roosevelt", "author": "Rubén Darío", "authorId": "ruben-dario",
        "authorYears": "1867–1916", "country": "Nicaragua", "language": "Spanish", "lang": "es",
        "era": "Modernismo", "year": 1905, "yearLabel": "1905 printing · not necessarily composition date",
        "form": "Verse", "collection": "Cantos de vida y esperanza · 1905",
        "context": (
            "The complete poem is separately headed VIII, Á Roosevelt, on printed pp. 37–39. "
            "Its historical generalizations about peoples are presented as the poet's rhetoric, not the "
            "library's claims. A University of Seville study discusses this individual poem and its racial "
            "and sociocultural rhetoric. The 1905 printing retains á, ó, unpaired exclamation marks, "
            "Nueva-York and the unaccented Netzahualcoyotl; indentation and spacing are normalized. "
            "Nicaragua is an associated place, not a claim about composition."
        ),
        "sourceTitle": "Cantos de vida y esperanza · Madrid, 1905, pp. 37–39",
        "source": "https://commons.wikimedia.org/wiki/File:Cantos_de_vida_y_esperanza_(1905).pdf?page=53",
        "contextSourceTitle": "University of Seville · individual poem study",
        "contextSource": "https://doi.org/10.12795/ph.2020.v34.i02.06", "rights": HISTORICAL_RIGHTS,
        "searchAliases": ["Á Roosevelt", "To Roosevelt", "Es con voz de la Biblia o verso de Walt Whitman"],
        "stanzas": [8, 6, 5, 10, 21, 1],
    },
    {
        "key": "dario-cancion-otono", "title": "Canción de otoño en primavera", "author": "Rubén Darío",
        "authorId": "ruben-dario", "authorYears": "1867–1916", "country": "Nicaragua", "language": "Spanish",
        "lang": "es", "era": "Modernismo", "year": 1905,
        "yearLabel": "1905 printing · not necessarily composition date", "form": "Verse",
        "collection": "Cantos de vida y esperanza · 1905",
        "context": (
            "The complete poem has seventeen quatrains and a final line on printed pp. 85–88, before "
            "Trébol; its printed dedication is A Martínez Sierra. A later 1918 transcription orders the "
            "second-love stanza differently; the 1905 order and repeated refrains are retained as one work. "
            "The scan prints Eden without an accent. A tiny mark after ligera is unclear and is not treated "
            "as punctuation. A Brussels university bibliography identifies a study of this poem. Spacing and indentation are normalized; "
            "Nicaragua is an associated place, not a claim about composition."
        ),
        "sourceTitle": "Cantos de vida y esperanza · Madrid, 1905, pp. 85–88",
        "source": "https://commons.wikimedia.org/wiki/File:Cantos_de_vida_y_esperanza_(1905).pdf?page=105",
        "contextSourceTitle": "Université libre de Bruxelles · individual poem study",
        "contextSource": "https://difusion.ulb.ac.be/vufind/Record/ULB-DIPOT:oai:dipot.ulb.ac.be:2013/105934/Details",
        "rights": HISTORICAL_RIGHTS,
        "searchAliases": ["Juventud, divino tesoro", "Era su cabellera oscura", "En brazos tomó mi ensueño"],
        "stanzas": [4] * 17 + [1],
    },
    {
        "key": "gongora-soneto-x", "title": "Soneto X · Mientras por competir con tu cabello",
        "author": "Luis de Góngora", "authorId": "luis-de-gongora", "authorYears": "Dates not established here",
        "country": "Spain", "language": "Spanish", "lang": "es", "era": "17th century", "year": 1654,
        "yearLabel": "1654 printing · not necessarily composition date", "form": "Sonnet",
        "collection": "Todas las obras · 1654",
        "context": (
            "This complete separately numbered sonnet precedes Soneto XI in the 1654 printing collected "
            "by Gonzalo de Hozes y Cordoua. The opening is added to the catalogue title for discovery. "
            "This witness reads el Sol, luciente marfil, marfil luciente and en tierra, en humo, en polvo, "
            "rather than familiar modern variants. Historical long-s, u/v, ç/z, spacing and accents are "
            "normalized; punctuation and sonnet stanza breaks are supplied independently. Oxford's teaching "
            "selection documents attention to this poem, not a license for its modern text. Spain is an "
            "associated place, not a claim about composition."
        ),
        "sourceTitle": "Todas las obras · Madrid, 1654, PDF p. 38",
        "source": "https://commons.wikimedia.org/wiki/File:Todas_las_obras_de_Don_Lvis_de_Gongora_-_en_varios_poemas_(IA_todaslasobrasded00gong).pdf?page=38",
        "contextSourceTitle": "Oxford · individual sonnet selection", "contextSource": OXFORD,
        "rights": HISTORICAL_RIGHTS,
        "searchAliases": [
            "Mientras por competir con tu cabello", "oro bruñido al sol relumbra en vano",
            "del luciente cristal tu gentil cuello", "en tierra en polvo en humo en sombra en nada",
        ],
        "stanzas": [4, 4, 3, 3],
    },
    {
        "key": "leino-rauhattoman-rukous", "title": "Rauhattoman rukous", "author": "Eino Leino",
        "authorId": "eino-leino", "authorYears": "1878–1926", "country": "Finland", "language": "Finnish",
        "lang": "fi", "era": "19th century", "year": 1900,
        "yearLabel": "1900 printing · not necessarily composition date", "form": "Verse",
        "collection": "Hiihtäjän virsiä · 1900",
        "context": (
            "The separately headed poem has six eight-line stanzas on printed pp. 74–76; its fifth stanza "
            "crosses a page and the next poem is Mua pelottaa. The Kainuu Eino Leino society names it "
            "among the volume's well-known poems. The printed joulu-yö and apostrophized tääll’ and nuor’ "
            "are retained; spacing and apostrophe typography are normalized. Finland is an associated "
            "place, not a claim about composition."
        ),
        "sourceTitle": "Hiihtäjän virsiä · Helsinki, 1900, pp. 74–76",
        "source": "https://digi.kansalliskirjasto.fi/teos/binding/1907469/pdf/Hiiht%C3%A4j%C3%A4n_virsi%C3%A4_Eino_Leino_01_01_1900.pdf#page=84",
        "contextSourceTitle": "Kainuu Eino Leino society · poems in Hiihtäjän virsiä",
        "contextSource": "https://www.kainuuneinoleinoseura.fi/eino-leino/runoteokset/",
        "rights": HISTORICAL_RIGHTS,
        "searchAliases": ["Minä täällä olen vieras", "Prayer of the Restless"], "stanzas": [8] * 6,
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
            "id": "recognized-world-classics-3-" + work["key"], "direction": "ltr", "themes": [],
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

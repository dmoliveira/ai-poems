#!/usr/bin/env python3
"""Reproduce seven individually documented Chinese, Spanish, and French readings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-world-classics-2-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-world-classics-2.json"
READINGS_SHA256 = "73cd757f3d9caba36321420a56025e9407c934ce231ec23958dd2eb98297699b"

# Hashes identify the examined copies, not the accuracy of their transcriptions.
EVIDENCE = {
    "06053553.cn.pdf": "e744b250d43766eaa38e5f5b411b6c1a735dc308cea3330fb53f0fefce5dced3",
    "huangchao-wenjian-su-27-p43.jpg": "ef7301cf2562fbdd5a04dd04f9c5b2f01c3754a675ae05ad412ce61488ddbe39",
    "huangchao-wenjian-su-27-p44.jpg": "700a061d6bad92dd90f94386c21dcdb16a456ba8c42dd4029da1614f50e391db",
    "garcilaso-obras-1911.pdf": "0558e728fc98860b4eee385e35511a19ff2984edac8c8e349928f1a506579f1c",
    "rimbaud-1895-archive.pdf": "7263a4a93ecf8d1c42be3375c93c85c48835cf73b1d272b30d45731be9d75259",
    "dubellay-seche-t3-p07.jpg": "4bf24e8e2195685d6523b9428dbdc5e1d444546a3262f4b4f6da5d9ebe4fbddd",
    "dubellay-seche-t3-p56.jpg": "500af0a72fb5757d5873f4a3c7924578be20da79f6b029e3fc105184d0c73e8b",
    "lamartine-le-lac-1820-p67.jpg": "c9271897ab86ed3eaac281c165bc5ef63874a6f4a2a828719d96c445a10b6292",
    "lamartine-le-lac-1820-p68.jpg": "67736d880ff7b8e052b5ce19b6af21e9e83b59609d503cbcdf103bfebedb1651",
    "lamartine-le-lac-1820-p69.jpg": "dc3e741c0ab4ebb4c83f34f83115d5a0a3d3781db7ac74e7e047195599b006a1",
    "lamartine-le-lac-1820-p70.jpg": "1fde8086eef6d18c9d4d43dda74070ef19cc541aa839da2f565b746195697233",
}
EDB = "https://www.edb.gov.hk/attachment/tc/curriculum-development/kla/chi-edu/resources/primary/lang/jilei_shi_pdf/"
OXFORD = "https://new.ox.ac.uk/sites/default/files/2025-08/Spanish%20New%20FPE%20GA%20Sonnets%202025%20compressed.pdf"
FRENCH_RECEPTION = "https://www.etudes-litteraires.com/figures-de-style/ellipse"
CHINESE_RIGHTS = (
    "The historical poem and selected reading are public domain in the United States. "
    "Copyright, edition-related and moral rights vary by jurisdiction; check local law. "
    "The scan is linked, not republished. Line breaks and punctuation are supplied and some "
    "historical glyphs normalized; search aliases are not separate editions or translations. "
    "No translation or recording is included."
)
GARCILASO_RIGHTS = (
    "The 1911 historical printing is public domain in the United States. Its editor Tomás Navarro Tomás "
    "died in 1979; edition-related copyright and moral rights may differ elsewhere, so check local law. "
    "The scan is linked, not republished. No translation or recording is included."
)
HISTORICAL_RIGHTS = (
    "The historical printing is public domain in the United States. Copyright, edition-related and "
    "moral rights vary by jurisdiction; check local law. The scan is linked, not republished. "
    "No translation or recording is included."
)
WORKS = [
    {
        "key": "wang-bochuan-guazhou", "title": "泊船瓜洲", "author": "Wang Anshi", "authorId": "wang-anshi",
        "authorOriginal": "王安石", "authorYears": "1021–1086", "authorAliases": ["Wang An-shih"],
        "country": "China", "language": "Chinese", "lang": "zh-Hant", "era": "Song dynasty",
        "year": None, "yearLabel": "Song dynasty · exact year unknown", "form": "Verse",
        "collection": "臨川文集 · 四庫全書",
        "context": (
            "The separately headed quatrain ends before 重過余婆岡市 on the following page. "
            "This witness reads 春風自綠江南岸; the Hong Kong Education Bureau's individual "
            "recitation selection reads 春風又綠江南岸. An earlier poem in the collection quotes this "
            "quatrain; the quotation and variants are not additional works. Line breaks and punctuation "
            "are supplied; China is an associated place, not a claim about the place of composition."
        ),
        "sourceTitle": "臨川文集 · 四庫全書 witness, 卷二十九, PDF p. 90",
        "source": "https://archive.org/download/06053553.cn/06053553.cn.pdf#page=90",
        "contextSourceTitle": "Hong Kong Education Bureau · individual recitation selection",
        "contextSource": EDB + "jilei_shi_076.pdf", "rights": CHINESE_RIGHTS,
        "searchAliases": [
            "京口瓜洲一水间，\n钟山祇隔数重山。\n春风自绿江南岸，\n明月何时照我还。",
            "京口瓜洲一水间钟山祇隔数重山春风自绿江南岸明月何时照我还",
            "鍾山只隔數重山", "钟山只隔数重山", "春風又綠江南岸", "春风又绿江南岸",
        ],
        "stanzas": [4],
    },
    {
        "key": "su-huaizhong-wanbo-dutou", "title": "淮中晚泊犢頭", "author": "Su Shunqin",
        "authorId": "su-shunqin", "authorOriginal": "蘇舜欽", "authorYears": "1008–1048",
        "authorAliases": ["苏舜钦"], "country": "China", "language": "Chinese", "lang": "zh-Hant",
        "era": "Song dynasty", "year": None, "yearLabel": "Song dynasty · exact year unknown", "form": "Verse",
        "collection": "皇朝文鑑 · 四部叢刊",
        "context": (
            "The Song anthology separately heads and attributes this complete quatrain; the following "
            "page begins 暑中閑詠. The Hong Kong Education Bureau includes this individual poem in its "
            "recitation selections. The facsimile reproduces a Song printing; its exact 四部叢刊 impression "
            "has not been independently dated. 隂 and 㸔 are normalized to 陰 and 看. Line breaks and "
            "punctuation are supplied; China is an associated place, not a claim about composition."
        ),
        "sourceTitle": "皇朝文鑑 · 四部叢刊, 卷二十七, page 43",
        "source": "https://commons.wikimedia.org/wiki/File:Sibu_Congkan1979-呂祖謙-皇朝文鑑-40-10.djvu?page=43",
        "contextSourceTitle": "Hong Kong Education Bureau · individual recitation selection",
        "contextSource": EDB + "jilei_shi_072.pdf", "rights": CHINESE_RIGHTS,
        "searchAliases": [
            "淮中晚泊犊头", "春阴垂野草青青，\n时有幽花一树明。\n晚泊孤舟古祠下，\n满川风雨看潮生。",
            "春阴垂野草青青时有幽花一树明晚泊孤舟古祠下满川风雨看潮生", "春隂垂野草青青", "滿川風雨㸔潮生",
        ],
        "stanzas": [4],
    },
    {
        "key": "garcilaso-soneto-v", "title": "Soneto V · Escrito está en mi alma vuestro gesto",
        "author": "Garcilaso de la Vega", "authorId": "garcilaso-de-la-vega", "authorYears": "Dates not established here",
        "country": "Spain", "language": "Spanish", "lang": "es", "era": "16th century",
        "year": 1911, "yearLabel": "1911 printing · not necessarily composition date", "form": "Sonnet",
        "collection": "Obras · 1911",
        "context": (
            "The 1911 edition prints this complete, separately numbered sonnet as V; the opening is "
            "added to the title for discovery. Its historical reading includes escrebir, escrebistes and á. "
            "Oxford's individual teaching selection uses different spellings; it is reception evidence, not "
            "the source of this transcription. Stanza breaks are supplied; spacing and indentation are "
            "normalized. Spain is an associated place, not a claim about the place of composition."
        ),
        "sourceTitle": "Obras · 1911, p. 211", "source": "https://archive.org/details/obra00vega/page/n238/mode/1up",
        "contextSourceTitle": "Oxford · individual sonnet selection", "contextSource": OXFORD,
        "rights": GARCILASO_RIGHTS,
        "searchAliases": ["y cuanto yo escribir de vos deseo", "vos sola lo escribistes", "vos sola lo escribisteis"],
        "stanzas": [4, 4, 3, 3],
    },
    {
        "key": "garcilaso-soneto-xiii", "title": "Soneto XIII · A Dafne ya los brazos le crecían",
        "author": "Garcilaso de la Vega", "authorId": "garcilaso-de-la-vega", "authorYears": "Dates not established here",
        "country": "Spain", "language": "Spanish", "lang": "es", "era": "16th century",
        "year": 1911, "yearLabel": "1911 printing · not necessarily composition date", "form": "Sonnet",
        "collection": "Obras · 1911",
        "context": (
            "The 1911 edition prints this complete, separately numbered sonnet as XIII; the opening is "
            "added to the title for discovery and the editorial footnote is not verse. This witness reads "
            "que al oro and cresca; Oxford's individual teaching selection reads qu’el oro and crezca. "
            "These are readings of one work. Stanza breaks are supplied; spacing and indentation are "
            "normalized. Spain is an associated place, not a claim about the place of composition."
        ),
        "sourceTitle": "Obras · 1911, p. 220", "source": "https://archive.org/details/obra00vega/page/n247/mode/1up",
        "contextSourceTitle": "Oxford · individual sonnet selection", "contextSource": OXFORD,
        "rights": GARCILASO_RIGHTS,
        "searchAliases": ["los cabellos qu’el oro escurecían", "los cabellos que el oro escurecían", "que con llorarla crezca cada día"],
        "stanzas": [4, 4, 3, 3],
    },
    {
        "key": "rimbaud-sensation", "title": "Sensation", "author": "Arthur Rimbaud", "authorId": "arthur-rimbaud",
        "authorYears": "1854–1891", "country": "France", "language": "French", "lang": "fr", "era": "19th century",
        "year": 1895, "yearLabel": "1895 printing · not necessarily composition date", "form": "Verse",
        "collection": "Poésies complètes · 1895",
        "context": (
            "The separately titled two-quatrain poem ends before Bal des pendus on the next page. "
            "The 1895 printing places Mars 1870 beneath the verse; that printed date is not independently "
            "verified here as the composition date. It has a semicolon after rien and an exclamation at "
            "the end. A literary essay discusses the poem individually. Spacing and apostrophe typography "
            "are normalized; France is an associated place, not a claim about the place of composition."
        ),
        "sourceTitle": "Poésies complètes · 1895, p. 53",
        "source": "https://archive.org/details/bub_gb_EZA7AQAAMAAJ/page/n73/mode/1up",
        "contextSourceTitle": "LittPo · individual poem essay",
        "contextSource": "https://littpo.fr/2020/12/16/sensation-de-rimbaud/", "rights": HISTORICAL_RIGHTS,
        "searchAliases": [], "stanzas": [4, 4],
    },
    {
        "key": "dubellay-regrets-xxxi", "title": "Sonnet XXXI · Heureux qui comme Ulysse",
        "author": "Joachim du Bellay", "authorId": "joachim-du-bellay", "authorYears": "c. 1522–1560",
        "country": "France", "language": "French", "lang": "fr", "era": "16th century", "year": 1910,
        "yearLabel": "1910 printing · not necessarily composition date", "form": "Sonnet",
        "collection": "Les Regrets · Œuvres complètes, vol. III",
        "context": (
            "This complete separately numbered sonnet appears between XXX and XXXII; the opening is "
            "added to the title for discovery. The volume's title page visibly says 1910, while Commons "
            "metadata says 1903. Séché's printing keeps reverray, cheminee and Loyre, and has a period "
            "after ayeux and after fine. A French teaching guide discusses this sonnet's opening. Stanza "
            "breaks are supplied; spacing and apostrophe typography are normalized. France is an "
            "associated place, not a claim about the place of composition."
        ),
        "sourceTitle": "Œuvres complètes · Séché, vol. III, 1910, p. 44",
        "source": "https://commons.wikimedia.org/wiki/File:Du_Bellay_-_Œuvres_complètes,_édition_Séché,_tome_3.djvu?page=56",
        "contextSourceTitle": "Études littéraires · sonnet in a teaching guide", "contextSource": FRENCH_RECEPTION,
        "rights": HISTORICAL_RIGHTS,
        "searchAliases": ["Heureux qui, comme Ulysse", "Quand reverrai-je", "Plus mon Loire gaulois"],
        "stanzas": [4, 4, 3, 3],
    },
    {
        "key": "lamartine-le-lac", "title": "Le Lac de B***", "author": "Alphonse de Lamartine",
        "authorId": "alphonse-de-lamartine", "authorYears": "1790–1869", "country": "France", "language": "French",
        "lang": "fr", "era": "19th century", "year": 1820,
        "yearLabel": "1820 printing · not necessarily composition date", "form": "Verse",
        "collection": "Méditations poétiques · 1820",
        "context": (
            "The complete 16-quatrain poem spans printed pp. 46–49 and is headed Méditation dixième, "
            "Le Lac de B***. The first edition was unsigned; a separately linked literary analysis "
            "attributes the same poem to Lamartine. Its later title Le Lac is a search alias. The witness "
            "retains devoit, mugissois, unaccented O and a semicolon before et vous in the time apostrophe. "
            "Repeated opening guillemets on quoted lines and indentation are normalized; the quoted speech "
            "remains marked. France is an associated place, not a claim about the place of composition."
        ),
        "sourceTitle": "Méditations poétiques · original edition, 1820, pp. 46–49",
        "source": "https://commons.wikimedia.org/wiki/File:Lamartine_-_Méditations_poétiques_(édition_de_1820).djvu?page=67",
        "contextSourceTitle": "Études littéraires · individual poem analysis and attribution",
        "contextSource": "https://www.etudes-litteraires.com/lamartine/le-lac", "rights": HISTORICAL_RIGHTS,
        "searchAliases": ["Le Lac", "Ô temps suspends ton vol", "Ô temps ! suspends ton vol", "elle devait revoir"],
        "stanzas": [4] * 16,
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
            "id": "recognized-world-classics-2-" + work["key"], "direction": "ltr", "themes": [],
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

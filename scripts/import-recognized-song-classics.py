#!/usr/bin/env python3
"""Reproduce four individually documented Song-dynasty readings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-song-classics-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-song-classics.json"
READINGS_SHA256 = "f0c27f9e99f95867a826614b30e95f42abb6c964974f4e5bd80d64ddec5be98a"

# These identify the examined copies, not the accuracy of their transcriptions.
EVIDENCE = {
    "06053552.cn.pdf": "5fb4788ae93623ed40a9c51a898ffb2cb8ae92000d3f81790a7a6f862cd4d2e8",
    "06053553.cn.pdf": "e744b250d43766eaa38e5f5b411b6c1a735dc308cea3330fb53f0fefce5dced3",
    "06053554.cn.pdf": "bfcdce0d28c70d22a2a2b676e46877f360dd9b2ce1003696fb601eb901ce46d0",
    "06074019.cn.pdf": "f832d1606c678a62c4e674634875a4bb139b1e0075526301fa1b6404b979fcb6",
    "sibu-wang-06-p92.jpg": "2d148a5f66f8790588cab9289ccccf8d64cdec3da81c0d598b11a993e1958a40",
    "sibu-wang-06-p93.jpg": "5cca91327f08f36e4a7990b95eaf7c740b1331a9611804702e9ae2839b365c1d",
    "sibu-wang-06-p103.jpg": "f780b0e9fa658c877f8087fdb60c8a132b21b7448798cef2f3382d8f4cf2b387",
    "sibu-wang-07-p128.jpg": "f97359a0d00676705bd84d2a31ec2bdbd64cfa652044e819f81fae87ead8fcd1",
    "sibu-wang-07-p129.jpg": "8216247b881a41ef00d1b1270483749c1b019ba859aa67904dcc371cdb2a1e56",
    "sibu-yang-02-p99.jpg": "7b713b5e40a310080b1c17ee4efe56822add31d26281d1e5d4ebb1ff3de47fe9",
}

WANG = {
    "author": "Wang Anshi", "authorId": "wang-anshi", "authorOriginal": "王安石",
    "authorYears": "1021–1086", "authorAliases": ["Wang An-shih"],
    "collection": "臨川文集 · 四庫全書",
}
YANG = {
    "author": "Yang Wanli", "authorId": "yang-wanli", "authorOriginal": "楊萬里",
    "authorYears": "1127–1206", "authorAliases": ["杨万里", "Yang Wan-li"],
    "collection": "誠齋集 · 四庫全書薈要",
}

EDB = "https://www.edb.gov.hk/attachment/tc/curriculum-development/kla/chi-edu/resources/primary/lang/jilei_shi_pdf/"
WORKS = [
    {
        **WANG, "key": "wang-meihua", "title": "梅花",
        "sourceTitle": "臨川文集 · 四庫全書 witness, 卷二十六, PDF p. 136",
        "source": "https://archive.org/download/06053552.cn/06053552.cn.pdf#page=136",
        "reception": EDB + "jilei_shi_073.pdf",
        "detail": (
            "The four-line poem ends before the separately headed 紅梅. "
            "The Hong Kong Education Bureau includes this individual poem in primary-school recitation materials."
        ),
        "simplified": "墙角数枝梅，\n凌寒独自开。\n遥知不是雪，\n为有暗香来。",
    },
    {
        **WANG, "key": "wang-yuanri", "title": "元日",
        "sourceTitle": "臨川文集 · 四庫全書 witness, 卷二十七, PDF pp. 13–14",
        "source": "https://archive.org/download/06053553.cn/06053553.cn.pdf#page=13",
        "reception": EDB + "jilei_shi_074.pdf",
        "detail": (
            "The fourth line continues onto the next page and ends before 九日; a small note gives an "
            "alternative to 爭插. This witness reads 東風 and 爭插, while the Hong Kong Education Bureau's "
            "recitation text reads 春風 and 總把. These are readings of one poem, not separate works. "
            "The forms of the third line's dawn expression are normalized to 曈曈."
        ),
        "simplified": "爆竹声中一岁除，\n东风送暖入屠苏。\n千门万户曈曈日，\n争插新桃换旧符。",
        "aliases": ["春風送暖入屠蘇", "總把新桃換舊符", "春风送暖入屠苏", "总把新桃换旧符", "瞳曈"],
    },
    {
        **WANG, "key": "wang-deng-feilaifeng", "title": "登飛來峯",
        "sourceTitle": "臨川文集 · 四庫全書 witness, 卷三十四, PDF p. 90",
        "source": "https://archive.org/download/06053554.cn/06053554.cn.pdf#page=90",
        "reception": EDB + "jilei_shi_075.pdf",
        "detail": (
            "The complete poem precedes 讀漢功臣表. The witness reads 飛來山上; the Hong Kong "
            "Education Bureau's recitation text reads 飛來峰上. The geographical identification "
            "is disputed and neither reading establishes the place of composition. 昇 is normalized to 升."
        ),
        "simplifiedTitle": "登飞来峰",
        "simplified": "飞来山上千寻塔，\n闻说鸡鸣见日升。\n不畏浮云遮望眼，\n自缘身在最高层。",
        "aliases": ["登飛來峰", "飛來峰上千尋塔", "飞来峰上千寻塔"],
    },
    {
        **YANG, "key": "yang-xiaochi", "title": "小池",
        "sourceTitle": "誠齋集 · 四庫全書薈要 witness, 卷七, PDF p. 70",
        "source": "https://archive.org/download/06074019.cn/06074019.cn.pdf#page=70",
        "reception": EDB + "jilei_shi_085.pdf",
        "detail": (
            "The complete four-line poem precedes 題左正卿壽慈堂. The witness reads 小荷纔露; "
            "the Hong Kong Education Bureau's recitation text uses 小荷才露. "
            "The historical 隂 glyph is normalized to 陰."
        ),
        "simplified": "泉眼无声惜细流，\n树阴照水爱晴柔。\n小荷才露尖尖角，\n早有蜻蜓立上头。",
        "aliases": ["小荷才露尖尖角", "樹隂照水"],
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
        if len(text.splitlines()) != 4:
            raise ValueError(f"Unexpected line count: {work['key']}")
        simplified = work["simplified"]
        aliases = [work.get("simplifiedTitle"), simplified, re.sub(r"[\s，。]+", "", simplified),
                   *work.get("aliases", [])]
        records.append({
            "id": "recognized-song-classics-" + work["key"], "title": work["title"],
            "author": work["author"], "authorId": work["authorId"], "authorOriginal": work["authorOriginal"],
            "authorYears": work["authorYears"], "authorAliases": work["authorAliases"],
            "country": "China", "language": "Chinese", "lang": "zh-Hant", "direction": "ltr",
            "year": None, "yearLabel": "Song dynasty · exact year unknown", "era": "Song dynasty",
            "form": "Verse", "collection": work["collection"], "themes": [], "mood": "paper",
            "context": work["detail"] + (
                " Line breaks and punctuation are supplied; the linked historical witness is unpunctuated. "
                "China is an associated place, not a claim about the place of composition."
            ),
            "sourceTitle": work["sourceTitle"], "source": work["source"],
            "contextSourceTitle": "Hong Kong Education Bureau · individual recitation selection",
            "contextSource": work["reception"],
            "rights": (
                "The historical poems and selected readings are public domain in the United States. "
                "Copyright, edition-related and moral rights vary by jurisdiction; check local law. "
                "The scan is linked, not republished. Line breaks and punctuation are supplied and some "
                "historical glyphs normalized; search aliases are not separate editions or translations. "
                "No translation or recording is included."
            ),
            "text": text, "translations": [], "searchAliases": [alias for alias in aliases if alias],
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

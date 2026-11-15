#!/usr/bin/env python3
"""Reproduce five individually documented, historically witnessed Chinese poems."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-chinese-classics-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-chinese-classics.json"
READINGS_SHA256 = "78ff6d2a4ddf0a12701e68e379fba6b3fa633056eccbc0656c5cd3b51d665e76"

# These hashes identify consulted PDFs, not the accuracy of the transcriptions.
EVIDENCE = {
    "yuefu-026-029.pdf": "d3a47af26ddffce8bba72cdedc0d7754c1799bb2adf5d8781d2820bb5511be93",
    "yuefu-030-033.pdf": "cfb149f0363c0fa3c4968b27f965c4ca94ff93bd69527d303d03a99817d84284",
    "quan-tangshi-077-080.pdf": "1758ed15428fa09ce7cc0daddb5bbc87c0aa99c3d753f688992c9fcd49bb6484",
    "quan-tangshi-056-061.pdf": "ea1b02f58c871cc4b3fc8af9a646e79b4d87722953a96bd1c9eb66b5b72663d3",
    "quan-tangshi-111-117.pdf": "deeaea6a287cdd5ba02735188b0ffa28689d2f0842d3cb7e961148a951f4ea6c",
}

ANONYMOUS = {
    "author": "Traditional / anonymous (Yuefu)", "authorId": "traditional-anonymous-yuefu",
    "authorOriginal": "佚名", "authorYears": "Dates not established here", "anonymous": True,
    "era": "Date not established", "yearLabel": "Composition date not established",
    "collection": "樂府詩集 · 四庫全書",
}
TANG = {
    "authorYears": "Tang dynasty", "era": "Tang dynasty", "yearLabel": "Tang dynasty · exact year unknown",
    "collection": "御定全唐詩 · 四庫全書",
}

WORKS = [
    {
        **ANONYMOUS, "key": "jiangnan", "title": "江南", "lines": 7,
        "sourceTitle": "樂府詩集 · 四庫全書 witness, 卷二十六, PDF pp. 23–24",
        "source": "https://archive.org/download/06054428.cn/06054428.cn.pdf#page=24",
        "reception": "https://www.edb.gov.hk/attachment/tc/curriculum-development/kla/chi-edu/recommended-passages/KS1_03.pdf",
        "detail": (
            "The historical anthology presents this seven-line lyric as an ancient anonymous song; "
            "the note following its final line is not verse. Its author and composition date are not "
            "established here. The Hong Kong Education Bureau recommends the individual poem."
        ),
        "simplified": "江南可采莲，\n莲叶何田田。\n鱼戏莲叶间，\n鱼戏莲叶东，\n鱼戏莲叶西，\n鱼戏莲叶南，\n鱼戏莲叶北。",
        "extraAliases": ["江南可采蓮"],
    },
    {
        **ANONYMOUS, "key": "chang-ge-xing", "title": "長歌行", "lines": 10,
        "sourceTitle": "樂府詩集 · 四庫全書 witness, 卷三十, PDF pp. 8–10",
        "source": "https://archive.org/download/06054429.cn/06054429.cn.pdf#page=9",
        "reception": "https://www.edb.gov.hk/attachment/tc/curriculum-development/kla/chi-edu/resources/primary/lang/jilei_shi_pdf/jilei_shi_003.pdf",
        "detail": (
            "This anonymous ancient-song reading begins 青青園中葵 and ends 老大徒傷悲. "
            "The next ancient song under the same heading is a separate text, not a continuation. "
            "The composition date is not established here; the Hong Kong Education Bureau "
            "includes this individual lyric in its primary-school recitation materials."
        ),
        "simplifiedTitle": "长歌行",
        "simplified": "青青园中葵，\n朝露待日晞。\n阳春布德泽，\n万物生光辉。\n常恐秋节至，\n焜黄华叶衰。\n百川东到海，\n何时复西归？\n少壮不努力，\n老大徒伤悲。",
    },
    {
        **TANG, "key": "yong-e", "title": "詠鵝", "lines": 4,
        "author": "Luo Binwang", "authorId": "luo-binwang", "authorOriginal": "駱賓王",
        "authorAliases": ["骆宾王"],
        "sourceTitle": "御定全唐詩 · 四庫全書 witness, 卷七十九, PDF pp. 107–108",
        "source": "https://archive.org/download/06063889.cn/06063889.cn.pdf#page=107",
        "reception": "https://www.edb.gov.hk/attachment/tc/curriculum-development/kla/chi-edu/recommended-passages/KS1_05.pdf",
        "detail": (
            "The four-line poem closes this historical volume. Its heading says it was written at "
            "seven; that age is a tradition, not independently established here. The scan's 鵞 is "
            "normalized to 鵝. The Hong Kong Education Bureau recommends the individual poem."
        ),
        "simplifiedTitle": "咏鹅", "simplified": "鹅鹅鹅，\n曲项向天歌。\n白毛浮绿水，\n红掌拨清波。",
        "extraAliases": ["詠鵞", "鵞鵞鵞"],
    },
    {
        **TANG, "key": "feng", "title": "風", "lines": 4,
        "author": "Li Qiao", "authorId": "li-qiao", "authorOriginal": "李嶠",
        "authorAliases": ["李峤", "Li Jiao"],
        "sourceTitle": "御定全唐詩 · 四庫全書 witness, 卷六十一, PDF p. 131",
        "source": "https://archive.org/download/06063886.cn/06063886.cn.pdf#page=131",
        "reception": "https://qnzj.cyol.com/html/2024-11/19/nw.D110000qnzjb_20241119_2-04.htm",
        "detail": (
            "The separately headed four-line poem begins 解落三秋葉. A modern article on poems "
            "in schoolbooks discusses it individually and contrasts another, eight-line poem by "
            "Li with the same title; that other work is not included here. Li's name is also "
            "romanized Li Jiao, and estimates of his dates differ."
        ),
        "simplifiedTitle": "风", "simplified": "解落三秋叶，\n能开二月花。\n过江千尺浪，\n入竹万竿斜。",
    },
    {
        **TANG, "key": "yong-liu", "title": "詠柳", "lines": 4,
        "author": "He Zhizhang", "authorId": "he-zhizhang", "authorOriginal": "賀知章",
        "authorAliases": ["贺知章"],
        "sourceTitle": "御定全唐詩 · 四庫全書 witness, 卷一百十二, PDF p. 43",
        "source": "https://archive.org/download/06063895.cn/06063895.cn.pdf#page=43",
        "reception": "https://www.edb.gov.hk/attachment/tc/curriculum-development/kla/chi-edu/resources/primary/lang/jilei_shi_pdf/jilei_shi_015.pdf",
        "detail": (
            "The witness heading also gives 柳枝詞 as an alternate title. The reading retains "
            "綠絲縧; some modern forms use 綠絲絛. The historical 栁 and 髙 glyphs are normalized "
            "to 柳 and 高. The Hong Kong Education Bureau includes this individual poem in its "
            "primary-school recitation materials."
        ),
        "simplifiedTitle": "咏柳", "simplified": "碧玉妆成一树高，\n万条垂下绿丝绦。\n不知细叶谁裁出，\n二月春风似剪刀。",
        "extraAliases": ["詠栁", "柳枝詞", "柳枝词", "綠絲絛"],
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
        if len(text.splitlines()) != work["lines"]:
            raise ValueError(f"Unexpected line count: {work['key']}")
        simplified = work["simplified"]
        aliases = [work.get("simplifiedTitle"), simplified, re.sub(r"[\s，。？]+", "", simplified),
                   *work.get("extraAliases", [])]
        record = {
            "id": "recognized-chinese-classics-" + work["key"], "title": work["title"],
            "author": work["author"], "authorId": work["authorId"], "authorOriginal": work["authorOriginal"],
            "authorYears": work["authorYears"], "country": "China", "language": "Chinese", "lang": "zh-Hant",
            "direction": "ltr", "year": None, "yearLabel": work["yearLabel"], "era": work["era"],
            "form": "Verse", "collection": work["collection"], "themes": [], "mood": "paper",
            "context": work["detail"] + (
                " Line breaks and punctuation are supplied; the linked historical witness is unpunctuated. "
                "China is an associated place, not a claim about the place of composition."
            ),
            "sourceTitle": work["sourceTitle"], "source": work["source"],
            "contextSourceTitle": "Individual reception and context", "contextSource": work["reception"],
            "rights": (
                "The historical text and Qing-era anthology reading are public domain in the United States. "
                "Copyright and moral rights vary by jurisdiction; check local law. The scan is linked, not "
                "republished. This transcription supplies punctuation and line breaks and normalizes some "
                "historical glyphs; simplified search aliases are not separate editions or translations. "
                "No translation or recording is included."
            ),
            "text": text, "translations": [], "searchAliases": [alias for alias in aliases if alias],
        }
        for key in ("anonymous", "authorAliases"):
            if key in work:
                record[key] = work[key]
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

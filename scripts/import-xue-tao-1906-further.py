#!/usr/bin/env python3
"""Reproduce further reviewed Xue Tao readings from the 1906 print."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/xue-tao-1906-further-readings.txt"
OUTPUT = ROOT / "content/poems/xue-tao-1906-further.json"
READINGS_SHA256 = "b307ab371459d57cfdab20e2c30bd7b8fefe5afd52f1e47620f90158b0530a08"
COMPARISON_FILE = "wikisource-xue-li-oldid679301.txt"
COMPARISON_SHA256 = "fb1d0f79ba6575bd64591dcd0f108a49359bee1a7942b4a9a99b3f4370fd5328"
SCAN = "https://taiwanebook.ncl.edu.tw/en/book/NCL-000474792/reader"
WIKISOURCE = (
    "https://zh.wikisource.org/w/index.php?title="
    + quote("薛濤李冶詩集 (四庫全書本)")
    + "&oldid=679301"
)

# The comparison is a different edition. Hashes and character comparison do
# not establish the accuracy of the visual review of the 1906 print.
SELECTION = (
    {
        "slug": "li-editor", "title": "酬李校書", "pages": (19, 19), "comparison": ("酬李校書", 1),
        "hash": "1495623f3df60675388d41869218fca477afe72915727fdfd12c343d1ead7108",
        "adjustments": (("逰", "遊"), ("逺", "遠"), ("濵", "濱")), "note": "",
    },
    {
        "slug": "ninth-day-one", "title": "九日遇雨二首（其一 · 萬里驚飆朔氣深）", "pages": (19, 19),
        "comparison": ("九日遇雨二首", 1),
        "hash": "8fef70b6db6778c7b90edf742e73c7811ae3f644d2cab9b4ba4ccb4c78e9e49f",
        "adjustments": (("飈", "飆"), ("隂隂", "陰陰")),
        "note": "The print explicitly names two poems; the number and opening words in this display title are editorial.",
    },
    {
        "slug": "ninth-day-two", "title": "九日遇雨二首（其二 · 茱萸秋節佳期阻）", "pages": (19, 20),
        "comparison": ("九日遇雨二首", 2),
        "hash": "3ac698b47334b3f4e4ed2f4dbc032a2f4abed6549d108b5eb4470cb566982f39",
        "adjustments": (),
        "note": (
            "The print explicitly names two poems; the number and opening words in this display title "
            "are editorial. The final line continues onto reader page 20."
        ),
    },
    {
        "slug": "painting", "title": "酬雍秀才貽巴峽圖", "pages": (20, 20),
        "comparison": ("酬雍秀才貽巴峽圖", 1),
        "hash": "6a40b9e8e6982dd1511edf6f54e1e23ae90df7e8c4ab110e3f5d755d9123b732",
        "adjustments": (("峯", "峰"), ("繞荆", "遠荊"), ("石", "口")),
        "note": "The 1906 print reads ‘遠荊吳’ and ‘峽口圖’; Wikisource reads ‘繞荆吳’ and ‘峽石圖’.",
    },
    {
        "slug": "flower", "title": "和劉賓客玉蕣", "pages": (20, 20), "comparison": ("和劉賔客玉蕣", 1),
        "hash": "e8e172bc33297e3490f349f15e126d4da652550b0e0298bda0c44d1541a361e5",
        "templates": (("{{SKchar|1215}}", "珊", 2),),
        "adjustments": (("霞", "玉"), ("縁", "緣"), ("日", "月")),
        "note": (
            "The 1906 print reads ‘玉彩’ and ‘月輪’ and records ‘霞’ and ‘日’ as alternatives; "
            "Wikisource reads ‘霞彩’ and ‘日輪’. Two Wikisource SKchar templates are expanded as ‘珊珊’."
        ),
    },
    {
        "slug": "reply-yang", "title": "酬楊供奉法師見招", "pages": (24, 24),
        "comparison": ("酬楊供奉法師見招", 1),
        "hash": "a816a172bfcbcffaded9e7f82d116cbd11e65e07dde04af0236247291d6cd204",
        "adjustments": (("逺", "遠"), ("雪牕", "雲窗"), ("卧", "臥"), ("烟", "煙")),
        "note": "The 1906 print reads ‘雲窗’; Wikisource reads ‘雪牕’.",
    },
    {
        "slug": "new-clothes-one", "title": "試新服裁製初成三首（其一 · 紫陽宮裏賜紅綃）", "pages": (24, 24),
        "comparison": ("試新服裁製初成三首", 1),
        "hash": "34ce5bf5bdb7d66d9918a33a4f61796e151da1e5bda4f87d5cce891b0910f328",
        "adjustments": (("宫", "宮"), ("遥", "遙"), ("兎", "兔"), ("氷", "冰"), ("靜", "淨")),
        "note": (
            "The print explicitly names three poems; the number and opening words in this display title "
            "are editorial. The 1906 print reads ‘冰繭淨’; Wikisource reads ‘氷繭靜’. "
            "The third poem is omitted because a glyph remains uncertain."
        ),
    },
    {
        "slug": "new-clothes-two", "title": "試新服裁製初成三首（其二 · 九氣分為九色霞）", "pages": (24, 24),
        "comparison": ("試新服裁製初成三首", 2),
        "hash": "c4421a99a1228b9221135935cf0715a4a3968dd878578ce52895cea4cbeda21d",
        "adjustments": (("五雲仙馭", "五靈仙馭"), ("様", "樣")),
        "note": (
            "The print explicitly names three poems; the number and opening words in this display title "
            "are editorial. The 1906 print reads ‘五靈仙馭’; Wikisource reads ‘五雲仙馭’. "
            "The third poem is omitted because a glyph remains uncertain."
        ),
    },
    {
        "slug": "zhang", "title": "寄張元夫", "pages": (24, 25), "comparison": ("寄張元夫", 1),
        "hash": "a6b0c7a99d988d76ee5d3bb5e18cb3936cbf434ebb057dfe7b7762bee1d52e59",
        "adjustments": (("牕", "衣"), ("絃絶", "弦絕")),
        "note": "The 1906 print reads ‘鷺識朱衣’; Wikisource reads ‘鷺識朱牕’. The final line continues onto reader page 25.",
    },
    {
        "slug": "jialing", "title": "續嘉陵驛詩獻武相國", "pages": (26, 26),
        "comparison": ("續嘉陵驛詩獻武相國", 1),
        "hash": "5496eabc8b4397f2dba3e6325f79bfd84607bc7df4048dea8a278419addb8e86",
        "adjustments": (),
        "note": "The 1906 print records ‘城’ as an alternate to ‘江’ in ‘錦江玉壘’; its main reading is retained.",
    },
    {
        "slug": "duan-minister", "title": "段相國遊武擔寺病不能從題寄", "pages": (26, 26),
        "comparison": ("段相國遊武擔寺病不能從題寄", 1),
        "hash": "14d74df07eb27396a78aed4d6aba4a874263c3aa376de2659a44075f7f27fa40",
        "adjustments": (), "note": "",
    },
    {
        "slug": "duan-scholar", "title": "贈段校書", "pages": (26, 26), "comparison": ("贈段校書", 1),
        "hash": "a4b95b9bc27a1546ad9e6af403ddccc4314a3927f75c9717008e45fcdbd1b416",
        "adjustments": (("説", "說"), ("𤣥", "玄")),
        "note": (
            "The four lines end in the last column of the saved 1906 page, followed by blank space; "
            "the next heading is not visible there. The separate comparison also prints four lines "
            "before its next heading."
        ),
    },
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def characters(value):
    return "".join(
        char for char in unicodedata.normalize("NFKC", value)
        if "\u3400" <= char <= "\u9fff" or "\U00020000" <= char <= "\U0003134f"
    )


def compare_wikisource(book, row, reading):
    """Check a different edition's selected heading, line and reviewed changes."""
    heading, offset = row["comparison"]
    lines = book.splitlines()
    starts = [index for index, line in enumerate(lines) if line.strip() == heading]
    if len(starts) != 1 or offset not in (1, 2, 3) or starts[0] + offset >= len(lines):
        raise ValueError(f"Unexpected comparison boundaries: {row['slug']}")
    source = re.sub(r"\{\{SK notes\|[^{}]*\}\}", "", lines[starts[0] + offset]).strip()
    for markup, expanded, expected in row.get("templates", ()):
        if source.count(markup) != expected:
            raise ValueError(f"Unexpected comparison template: {row['slug']}")
        source = source.replace(markup, expanded)
    if "{{" in source or "}}" in source:
        raise ValueError(f"Unexpected comparison markup: {row['slug']}")
    source = characters(source)
    for old, new in row["adjustments"]:
        if source.count(old) != 1:
            raise ValueError(f"Unexpected comparison variant: {row['slug']}")
        source = source.replace(old, new, 1)
    if source != characters(reading):
        raise ValueError(f"Undocumented comparison difference: {row['slug']}")


def records(directory):
    comparison = (directory / COMPARISON_FILE).read_bytes()
    if digest(comparison) != COMPARISON_SHA256:
        raise ValueError("Reviewed comparison changed")
    raw = READINGS.read_bytes()
    if digest(raw) != READINGS_SHA256:
        raise ValueError("Reviewed readings changed")
    parts = re.split(r"^=== ([a-z0-9-]+) ===\n", raw.decode("utf8"), flags=re.MULTILINE)
    if parts.pop(0) or len(parts) != len(SELECTION) * 2:
        raise ValueError("Unexpected readings format")
    readings = [(parts[i], parts[i + 1].strip()) for i in range(0, len(parts), 2)]
    if tuple(slug for slug, _ in readings) != tuple(row["slug"] for row in SELECTION):
        raise ValueError("Unexpected selection or order")
    result = []
    book = comparison.decode("utf8")
    for row, (_, text) in zip(SELECTION, readings, strict=True):
        first, last = row["pages"]
        if not 1 <= first <= last <= 40:
            raise ValueError(f"Invalid reader page range: {row['slug']}")
        lines = text.splitlines()
        if len(lines) != 4 or any(not re.fullmatch(r"[\u3400-\u9fff]{7}[，。]", line) for line in lines):
            raise ValueError(f"Unexpected reading-line boundaries: {row['slug']}")
        if digest(text.encode("utf8")) != row["hash"]:
            raise ValueError(f"Reviewed poem changed: {row['slug']}")
        compare_wikisource(book, row, text)
        page_label = f"p. {first}" if first == last else f"pp. {first}–{last}"
        context = (
            f"A complete poem attributed to Xue Tao in the 1906 Hongdu ji, reader {page_label}. "
            "Its verse and available headings or transitions were checked visually in previously saved views of the linked "
            "National Central Library reader. The linked Wikisource transcription of a different "
            "Siku quanshu collection was a comparison aid. Punctuation, reading lines and some "
            "character forms are normalized; this is not a diplomatic transcription. The 1906 "
            "collection is a later compilation, not an autograph or proof of every attribution. "
            "China is associated with the poet, not asserted as the place of composition; the "
            "exact composition year is unknown."
        )
        if row["note"]:
            context += " " + row["note"]
        result.append({
            "id": f"xue-tao-further-1906-{row['slug']}",
            "title": row["title"], "author": "Xue Tao", "authorId": "xue-tao", "authorOriginal": "薛濤",
            "authorYears": "8th–9th century", "country": "China", "language": "Chinese", "lang": "zh-Hant",
            "direction": "ltr", "year": None, "yearLabel": "Tang dynasty · exact composition year unknown",
            "era": "Tang dynasty", "form": "Seven-character quatrain", "collection": "洪度集 · 1906 edition",
            "themes": [], "mood": "paper", "context": context, "contextSource": WIKISOURCE,
            "contextSourceTitle": "Chinese Wikisource contributors · Siku collection, revision 679301",
            "sourceTitle": f"National Central Library · 洪度集, 1906, reader {page_label}", "source": SCAN,
            "rights": (
                "The historical poems and 1906 printing are public domain in the United States; "
                "check local law. The NCL reader is linked, not republished. This reading adapts the "
                "linked Chinese Wikisource transcription, credited to its contributors including "
                "維基小霸王, and is distributed under CC BY-SA 4.0 "
                "(https://creativecommons.org/licenses/by-sa/4.0/); see the linked revision and "
                "contributor history. No translation is supplied."
            ),
            "text": text, "translations": [],
        })
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the reviewed comparison file")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Records differ from the reviewed readings")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

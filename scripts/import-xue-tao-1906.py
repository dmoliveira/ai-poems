#!/usr/bin/env python3
"""Reproduce reviewed Xue Tao readings from the online 1906 print."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/xue-tao-1906-readings.txt"
OUTPUT = ROOT / "content/poems/xue-tao-1906.json"
READINGS_SHA256 = "f3f7010d337965c6b1c67d8c4115b9df2617a93a57fb45c69a05420dc4a81eef"
COMPARISON_FILE = "wikisource-xue-li-oldid679301.txt"
COMPARISON_SHA256 = "fb1d0f79ba6575bd64591dcd0f108a49359bee1a7942b4a9a99b3f4370fd5328"
SCAN = "https://taiwanebook.ncl.edu.tw/en/book/NCL-000474792/reader"
WIKISOURCE = (
    "https://zh.wikisource.org/w/index.php?title="
    + quote("薛濤李冶詩集 (四庫全書本)")
    + "&oldid=679301"
)

# The comparison is a different collection, not the source print. Each change
# is checked against that revision and the manually reviewed reading; hashes
# cannot establish the correctness of visual collation.
SELECTION = (
    {
        "slug": "friend", "title": "送友人", "pages": (14, 14), "comparison": ("送友人", 1),
        "hash": "e181165ccd2ecfee5ee32f273e55323045eee4a491a6ef80e658e58cf15fd1f8",
        "adjustments": (),
        "note": "The 1906 print records an alternate ‘路’ beside the final ‘長’; the main reading is retained.",
    },
    {
        "slug": "pipes", "title": "聽僧吹蘆管", "pages": (14, 14), "comparison": ("聽僧吹蘆管", 1),
        "hash": "e087102b87ed88aa058a54ae729e38de5bd7e56bb6538c291d923101bec89277",
        "adjustments": (("閲", "閱"), ("勞", "聊")),
        "note": "The 1906 print reads ‘聊一弄’; the Wikisource comparison reads ‘勞一弄’.",
    },
    {
        "slug": "citrus", "title": "酬郭簡州寄柑子", "pages": (14, 15), "comparison": ("酬郭簡州寄柑子", 1),
        "hash": "a599be3705b0706faf5a851be6c3b911147e1ccfe54c999d9d4aa489d124926f",
        "adjustments": (("黄", "黃"),), "note": "The final line continues onto reader page 15.",
    },
    {
        "slug": "governor-one", "title": "上川主武元衡相國二首（其一 · 落日重城夕霧收）", "pages": (15, 15),
        "comparison": ("上川主武相國二首", 1),
        "hash": "758ce5d7457c0cef700132bfa5b3c8ede995a89ff9aafc4668e333866bf46290",
        "adjustments": (("収", "收"), ("爼", "俎"), ("朗月", "明月"), ("珠簾上玉鈎", "珠簾下玉鉤")),
        "note": (
            "The 1906 heading names ‘武元衡相國’ and notes another copy omits ‘元衡’; "
            "Wikisource titles the pair ‘上川主武相國二首’. The print reads ‘明月’ and ‘珠簾下’; "
            "Wikisource reads ‘朗月’ and ‘珠簾上’. The 1906 heading says two poems; the number "
            "and opening words in this display title are editorial."
        ),
    },
    {
        "slug": "governor-two", "title": "上川主武元衡相國二首（其二 · 東閣移尊綺席陳）", "pages": (15, 15),
        "comparison": ("上川主武相國二首", 2),
        "hash": "6f6a1ba1448a4a88b18e092f0cb4e9d6d893267ae3bd4d6a855099b28c9f0a91",
        "adjustments": (("樽", "尊"),),
        "note": (
            "The 1906 heading names ‘武元衡相國’ and notes another copy omits ‘元衡’; "
            "Wikisource titles the pair ‘上川主武相國二首’. The print reads ‘移尊’; "
            "Wikisource reads ‘移樽’. The 1906 heading says two poems; the number and "
            "opening words in this display title are editorial."
        ),
    },
    {
        "slug": "lychee", "title": "憶荔枝", "pages": (15, 15), "comparison": ("憶荔枝", 1),
        "hash": "130b9b7272860f7368e7bd5a060f02b76e7b9976674a3c119930d9b023df217a",
        "adjustments": (), "note": "",
    },
    {
        "slug": "yao", "title": "送姚員外", "pages": (16, 16), "comparison": ("送姚員外", 1),
        "hash": "4803b5283b468714bd10bd6464b50fa3134ea0f2fea295b20fa30e72f4e412ad",
        "adjustments": (("栁", "柳"), ("别", "別"), ("烟", "煙")), "note": "",
    },
    {
        "slug": "scholar", "title": "酬祝十三秀才", "pages": (16, 16), "comparison": ("酬祝十三秀才", 1),
        "hash": "e1283a5babb7d55b0d5703b88c51c4cfeb881626b2e243f7a118d27fe513ad7f",
        "adjustments": (("氷", "冰"), ("榜上", "榜下")),
        "note": (
            "The 1906 print reads ‘榜下看’ and notes ‘南’ as an alternate for ‘藍’; "
            "Wikisource reads ‘榜上看’."
        ),
    },
    {
        "slug": "temple-one", "title": "賦凌雲寺二首（其一 · 聞說凌雲寺裏苔）", "pages": (19, 19),
        "comparison": ("賦凌雲寺二首", 1),
        "hash": "910e68672902ea5454aba6ce8f78cbbc373bf3fc2943dfcc7799ef234dbe4301",
        "adjustments": (("説", "說"), ("絶纎", "絕纖"), ("横", "橫"), ("㸃", "點"), ("寳", "寶")),
        "note": (
            "The 1906 heading says two poems; the number and opening words in this display title "
            "are editorial. The print also notes ‘塵’ as an alternate to ‘埃’."
        ),
    },
    {
        "slug": "temple-two", "title": "賦凌雲寺二首（其二 · 聞說凌雲寺裏花）", "pages": (19, 19),
        "comparison": ("賦凌雲寺二首", 2),
        "hash": "faccfba4169e60ceeb2fe5d27c31f336c16bfbc9913cb0b65f90a3a78fd6ad80",
        "adjustments": (("説", "說"), ("鎻", "鎖"), ("瑶", "瑤")),
        "note": "The 1906 heading says two poems; the number and opening words in this display title are editorial.",
    },
    {
        "slug": "wang", "title": "上王尚書", "pages": (20, 20), "comparison": ("上王尚書", 1),
        "hash": "4d1e066c113ec54389587bd1cea01415a396f73f98996ca10ce0ae3639a8b15e",
        "adjustments": (), "note": "",
    },
    {
        "slug": "flowers", "title": "酬辛員外折花見遺", "pages": (25, 25), "comparison": ("酬辛員外折花見遺", 1),
        "hash": "8cabaf03c88b764a1954a15d8b3c20bd8ae51e6a8c150455407fb1f97fa93bfd",
        "adjustments": (("瑶䑓", "瑤臺"),), "note": "",
    },
    {
        "slug": "distant-one", "title": "贈遠二首（其一 · 芙蓉新落蜀山秋）", "pages": (25, 25),
        "comparison": ("贈逺二首", 1),
        "hash": "cf83c60694edf508f02d8bca1b1b445fd4e1252bbd9f51d60967cd46f0a16f4c",
        "adjustments": (),
        "note": (
            "The 1906 heading says two poems; the number and opening words in this display title "
            "are editorial. Only the first is included here; the second requires further review."
        ),
    },
    {
        "slug": "willow", "title": "柳絮", "pages": (26, 26), "comparison": ("栁絮", 1),
        "hash": "7948edae94e728e04f8741e2b176f5272f25ba0428c09ffc9a4e9d5efccb772a",
        "adjustments": (("摇", "搖"), ("一晌", "一任")),
        "note": "The 1906 print reads ‘一任南飛’; Wikisource reads ‘一晌南飛’. The print also has a nearby ‘一作向’ note.",
    },
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def characters(value):
    return "".join(char for char in unicodedata.normalize("NFKC", value) if "\u3400" <= char <= "\u9fff")


def compare_wikisource(book, row, reading):
    """Check the different edition's heading, complete line and documented changes."""
    heading, offset = row["comparison"]
    lines = book.splitlines()
    starts = [index for index, line in enumerate(lines) if line.strip() == heading]
    if len(starts) != 1 or offset not in (1, 2) or starts[0] + offset >= len(lines):
        raise ValueError(f"Unexpected comparison boundaries: {row['slug']}")
    source = re.sub(r"\{\{SK notes\|[^{}]*\}\}", "", lines[starts[0] + offset]).strip()
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
        if len(lines) != 4 or any(
            not re.fullmatch(r"[\u3400-\u9fff]{7}[，。]", line) for line in lines
        ):
            raise ValueError(f"Unexpected reading-line boundaries: {row['slug']}")
        if digest(text.encode("utf8")) != row["hash"]:
            raise ValueError(f"Reviewed poem changed: {row['slug']}")
        compare_wikisource(book, row, text)
        page_label = str(first) if first == last else f"{first}–{last}"
        context = (
            f"A complete poem attributed to Xue Tao in the 1906 Hongdu ji, reader pp. {page_label}. "
            "Its verse and boundaries were checked visually in the linked National Central Library "
            "reader; use its page control to reach the cited pages. The linked Wikisource transcription "
            "of a different Siku quanshu collection was a comparison aid. Punctuation, reading lines "
            "and some character forms are normalized; this is not a diplomatic transcription. "
            "The 1906 collection is a later compilation, not an autograph or proof of every attribution. "
            "China is associated with the poet, not asserted as the place of composition; the exact "
            "composition year is unknown."
        )
        if row["note"]:
            context += " " + row["note"]
        result.append({
            "id": f"xue-tao-1906-{row['slug']}",
            "title": row["title"],
            "author": "Xue Tao",
            "authorId": "xue-tao",
            "authorOriginal": "薛濤",
            "authorYears": "8th–9th century",
            "country": "China",
            "language": "Chinese",
            "lang": "zh-Hant",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Tang dynasty · exact composition year unknown",
            "era": "Tang dynasty",
            "form": "Seven-character quatrain",
            "collection": "洪度集 · 1906 edition",
            "themes": [],
            "mood": "paper",
            "context": context,
            "contextSource": WIKISOURCE,
            "contextSourceTitle": "Chinese Wikisource contributors · Siku collection, revision 679301",
            "sourceTitle": f"National Central Library · 洪度集, 1906, reader pp. {page_label}",
            "source": SCAN,
            "rights": (
                "The historical poems and 1906 printing are public domain in the United States; "
                "check local law. The NCL reader is linked, not republished. The adapted Chinese "
                "Wikisource transcription is credited to its contributors, including 維基小霸王, "
                "under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/); see the "
                "linked revision and its contributor history. No translation is supplied."
            ),
            "text": text,
            "translations": [],
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

#!/usr/bin/env python3
"""Reproduce selected Li He poems from a reviewed Siku transcription."""

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/li-he-siku-readings.txt"
OUTPUT = ROOT / "content/poems/li-he-siku.json"
READINGS_SHA256 = "0d03f199f438a0e61bf3d74306b4217a512d07b72616a493b8617031b7cbc33a"
EVIDENCE = {
    "wikisource-siku-790635.wikitext": "54b6741ef6db1312814eab655b6871c90415c41134ada13b5173ba16a668dc45",
    "06049046.cn.pdf": "e3f981d53be3e385fb88700fe7b5607b0ce097a483a6c2de3d5ea0963d5b21c0",
    "02099631.cn.pdf": "fae0fa06c6434cc9c989861e172aff5f19cf9864f3575b786b6f9fdcb45c080a",
}
SCAN = "https://archive.org/download/06049046.cn/06049046.cn.pdf"
WIKISOURCE = (
    "https://zh.wikisource.org/w/index.php?title="
    + quote("箋註評㸃李長吉歌詩 (四庫全書本)/卷1")
    + "&oldid=790635"
)
NUMBERS = ("其一", "其二", "其三", "其四", "其五", "其六", "其七", "其八", "其九", "其十", "其十一", "其十二", "其十三")

# Changes are explicit: the readings retain the scanned Siku text rather than
# silently substituting the Wang Qi edition. Hashes cannot prove visual review.
SELECTION = (
    {"slug": "one", "number": "其一", "pages": (72, 72), "width": 7,
     "hash": "68c9dbf340b1bb085b33ad19452efb658912e96ba9f41d107b085a6b2f907480", "changes": ()},
    {"slug": "two", "number": "其二", "pages": (72, 73), "width": 7,
     "hash": "237c9c4bf25ba762cfcb305b0ce42e82c513835e6dadbf46c5c6afc47968c68a",
     "changes": (("宫", "宮", 2), ("黄", "黃", 1))},
    {"slug": "three", "number": "其三", "pages": (73, 74), "width": 7,
     "hash": "4ab68aa92a38382c82c05a3029307716cf26f085471211e17edb6758da868f64",
     "changes": (("迊", "迎", 1),),
     "note": "The Wikisource transcription has ‘迊夏’; the Siku scan reads ‘迎夏’, retained here. "
             "Gutenberg eBook 25417 visibly corrupts the first line and was not used to repair this reading."},
    {"slug": "four", "number": "其四", "pages": (74, 74), "width": 7,
     "hash": "e2c004ce98e74f28d6cd0b8d43081c14c3aa1b3ac20237b2ec0e96168eb24e99",
     "changes": (("巻", "卷", 1),)},
    {"slug": "five", "number": "其五", "pages": (74, 75), "width": 7,
     "hash": "4776a329c57ba69809dda602673904125c0a788a303eb9a62f5a7a922bf9d67a",
     "changes": (("闗", "關", 1), ("烟", "煙", 1), ("戸", "戶", 1))},
    {"slug": "six", "number": "其六", "pages": (75, 75), "width": 7,
     "hash": "69dc9458788f85c13459b99a8aa965272072a9d7ad711edd8c7d8dfc401f2c02",
     "changes": (("挂", "掛", 1),)},
    {"slug": "seven", "number": "其七", "pages": (75, 76), "width": 7,
     "hash": "78770e74dbe369469328bf4689e085102626ce4f5c0af78ead808f1c3ea4fcbb", "changes": ()},
    {"slug": "eight", "number": "其八", "pages": (76, 77), "width": 7,
     "hash": "ddd002b6d4aa84ad72095c64eb314d1a4ca87995e586fbe22eaca3bd16ba52b4",
     "changes": (("黄", "黃", 1), ("牕", "窗", 1), ("逺", "遠", 1))},
    {"slug": "ten", "number": "其十", "pages": (77, 78), "width": 7,
     "hash": "046a398b63622e446141d315f1e933a932973393e9ca4f936da5f6c871527012",
     "changes": (("卧", "臥", 1),),
     "note": "The Siku scan reads ‘今朝’; Gutenberg eBook 25417 reads ‘今日’."},
    {"slug": "twelve", "number": "其十二", "pages": (78, 79), "width": 7,
     "hash": "7087bab6a640275e225a37673d3184beed156d8267d0a402aeda89b837e3bc85", "changes": ()},
    {"slug": "thirteen", "number": "其十三", "pages": (79, 80), "width": 5,
     "hash": "87de5dcdf515be7d18ad72ea2fcc19614edf1feff4db132a2ec08f5e7a2bc084",
     "changes": (("烟", "煙", 1), ("刹", "剎", 1), ("疎", "疏", 1), ("遥", "遙", 1)),
     "note": "The Siku scan reads ‘燒燭照漁船’; the separately scanned Wang Qi edition appears to read "
             "‘燒竹照漁船’. The Siku reading is retained. The end of the volume follows on PDF p. 80."},
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def remove_notes(text):
    """Remove balanced SK notes, including nested templates, but not verse."""
    while "{{SK notes|" in text:
        start = text.index("{{SK notes|")
        depth = 1
        end = start + 2
        while depth:
            if end >= len(text):
                raise ValueError("Unclosed Wikisource note")
            pair = text[end:end + 2]
            if pair == "{{":
                depth += 1
                end += 2
            elif pair == "}}":
                depth -= 1
                end += 2
            else:
                end += 1
        text = text[:start] + text[end:]
    return text


def source_sections(book):
    group = "{{SK anchor|南園十三首}}"
    following = "{{SK anchor|箋註評㸃李長吉歌詩巻一}}"
    if book.count(group) != 1:
        raise ValueError("Unexpected group boundaries")
    first = book.index(group) + len(group)
    if book[first:].count(following) != 1:
        raise ValueError("Unexpected group boundaries")
    last = book.index(following, first)
    text = remove_notes(book[first:last])
    pattern = (
        r"\{\{SK anchor\|(其(?:十[一二三]?|[一二三四五六七八九]))\}\}"
        r"|(?m:^[ \u3000]*(其[一六])[ \u3000]*$)"
    )
    markers = list(re.finditer(pattern, text))
    labels = tuple(match.group(1) or match.group(2) for match in markers)
    if labels != NUMBERS or text[:markers[0].start()].strip():
        raise ValueError("Unexpected numbered poem boundaries")
    sections = {}
    for index, marker in enumerate(markers):
        end = markers[index + 1].start() if index + 1 < len(markers) else len(text)
        sections[labels[index]] = "".join(text[marker.end():end].split())
    return sections


def compare_source(source, row, reading):
    if "{{" in source or "}}" in source:
        raise ValueError(f"Unexpected verse markup: {row['slug']}")
    for old, new, count in row["changes"]:
        if source.count(old) != count:
            raise ValueError(f"Unexpected source change: {row['slug']}")
        source = source.replace(old, new)
    if source != "".join(line[:-1] for line in reading.splitlines()):
        raise ValueError(f"Unexpected source reading: {row['slug']}")


def records(directory):
    for name, expected in EVIDENCE.items():
        if digest((directory / name).read_bytes()) != expected:
            raise ValueError(f"Reviewed evidence changed: {name}")
    raw = READINGS.read_bytes()
    if digest(raw) != READINGS_SHA256:
        raise ValueError("Reviewed readings changed")
    parts = re.split(r"^=== ([a-z]+) ===\n", raw.decode("utf8"), flags=re.MULTILINE)
    if parts.pop(0) or len(parts) != len(SELECTION) * 2:
        raise ValueError("Unexpected readings format")
    readings = [(parts[index], parts[index + 1].strip()) for index in range(0, len(parts), 2)]
    if tuple(slug for slug, _ in readings) != tuple(row["slug"] for row in SELECTION):
        raise ValueError("Unexpected selection or order")
    book = (directory / "wikisource-siku-790635.wikitext").read_text(encoding="utf8")
    sections = source_sections(book)
    result = []
    for row, (_, text) in zip(SELECTION, readings, strict=True):
        width = row["width"]
        lines = text.splitlines()
        expected_lines = 8 if width == 5 else 4
        if len(lines) != expected_lines or any(not re.fullmatch(rf"[\u3400-\u9fff]{{{width}}}[，。]", line) for line in lines):
            raise ValueError(f"Unexpected line boundaries: {row['slug']}")
        if digest(text.encode("utf8")) != row["hash"]:
            raise ValueError(f"Reviewed poem changed: {row['slug']}")
        compare_source(sections[row["number"]], row, text)
        first, last = row["pages"]
        if not 72 <= first <= last <= 80:
            raise ValueError(f"Unexpected page range: {row['slug']}")
        pages = f"p. {first}" if first == last else f"pp. {first}–{last}"
        context = (
            f"A complete numbered poem attributed to Li He under the heading 南園十三首 in the Siku quanshu "
            f"箋註評點李長吉歌詩, PDF {pages}. The thirteen-poem heading, selected verse and available "
            "following boundaries were checked visually in the linked Zhejiang University/CADAL facsimile. "
            "The linked Wikisource transcription identifies the same Siku work, but its relationship to "
            "this scanned copy is not established. A different Wang Qi edition was consulted for selected "
            "variants; these witnesses do not independently prove authorship or manuscript descent. "
            "The facsimile's reproduction date is not identified. Punctuation, reading lines and some "
            "character forms are normalized; this is not a diplomatic transcription. The number and "
            "opening words in the display title are editorial. China is associated with the poet, not "
            "asserted as the composition place; the exact composition year is unknown."
        )
        if row.get("note"):
            context += " " + row["note"]
        result.append({
            "id": f"li-he-siku-{row['slug']}",
            "title": f"南園十三首（{row['number']} · {lines[0][:-1]}）",
            "author": "Li He", "authorId": "li-he", "authorOriginal": "李賀", "authorYears": "790–816",
            "country": "China", "language": "Chinese", "lang": "zh-Hant", "direction": "ltr",
            "year": None, "yearLabel": "Tang dynasty · exact composition year unknown", "era": "Tang dynasty",
            "form": "Five-character poem" if width == 5 else "Seven-character quatrain",
            "collection": "箋註評點李長吉歌詩 · Siku quanshu", "themes": [], "mood": "paper",
            "context": context, "contextSource": WIKISOURCE,
            "contextSourceTitle": "Chinese Wikisource contributors · Siku text, revision 790635",
            "sourceTitle": f"Zhejiang University / CADAL · Siku facsimile, PDF {pages}",
            "source": f"{SCAN}#page={first}",
            "rights": (
                "Li He's historical poems are public domain in the United States; check local law. "
                "The facsimiles are linked, not republished. This reading adapts the linked Chinese "
                "Wikisource transcription, credited to its contributors including 維基小霸王 and Wmr-bot, "
                "and is distributed under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/); "
                "see the linked revision and contributor history. No translation is supplied."
            ),
            "text": text, "translations": [],
        })
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the reviewed source files")
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

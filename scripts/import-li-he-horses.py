#!/usr/bin/env python3
"""Reproduce selected Li He horse poems from a reviewed Siku transcription."""

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/li-he-horses-readings.txt"
OUTPUT = ROOT / "content/poems/li-he-horses.json"
READINGS_SHA256 = "38c3f4edf433a4f10ccddda38003502de3093e08347bd1004d23e96cc9834382"
EVIDENCE = {
    "wikisource-siku-vol2-790637.wikitext": "a87dc890663a3132970e758ef2800b3c2dfb65d2cce6983608bde8db243038c1",
    "wikisource-changgu-v2-740547.wikitext": "f7a625527bd2225d9efaf98eedd9f99c12a87c8fd08913886105b9ced2e26433",
    "wikisource-lhge-vol2-1755495.wikitext": "97e580c58072ff06f3e5e7902488ad9c293886818fb4bdbe4b0591cdf911d8d9",
    "06049046.cn.pdf": "e3f981d53be3e385fb88700fe7b5607b0ce097a483a6c2de3d5ea0963d5b21c0",
    "02099632.cn.pdf": "24dda5920cc950d651ce17bd75b6bef811ed718319a97a545abaaf5291a7de00",
}
SCAN = "https://archive.org/download/06049046.cn/06049046.cn.pdf"
WIKISOURCE = (
    "https://zh.wikisource.org/w/index.php?title="
    + quote("箋註評㸃李長吉歌詩 (四庫全書本)/卷2")
    + "&oldid=790637"
)
NUMBERS = (
    "其一", "其二", "其三", "其四", "其五", "其六", "其七", "其八", "其九", "其十",
    "其十一", "其十二", "其十三", "其十四", "其十五", "其十六", "其十七", "其十八", "其十九", "其二十",
    "其二十一", "其二十二", "其二十三",
)

# Counted character-form changes are explicit. No missing verse character is
# supplied from a different witness; the two placeholder poems are excluded.
SELECTION = (
    {"slug": "two", "number": "其二", "pages": (88, 89),
     "hash": "d123a09d637cd401c4eb63408c707ada9540d0f335969d6353980430ee01cdc5", "changes": (("衘", "銜", 1),),
     "note": "Wikisource writes ‘衘’, normalized here to the variant form ‘銜’; the scan's exact glyph is not certain."},
    {"slug": "three", "number": "其三", "pages": (89, 89),
     "hash": "694678459358b1d30a2ddadbd60f47727a19df635cf89635275f31cf824e6f58", "changes": ()},
    {"slug": "four", "number": "其四", "pages": (89, 90),
     "hash": "c02ea7483659051f0bde74019a98de4e67e607bd0e565f0429d2adc0db2dbe1d", "changes": (),
     "note": "The Siku commentary suggests ‘精’ for the second ‘星’; the printed verse retains ‘星’."},
    {"slug": "five", "number": "其五", "pages": (90, 90),
     "hash": "3b2aad8160299a05ba1be7c8f8e068e95118ee9a047d1803de1af321bee6bdc3", "changes": (),
     "note": "The Siku scan reads ‘大漠山如雪’; the separately scanned Wang Qi edition and the separately transcribed 昌谷集 read ‘大漠沙如雪’. The latter is identified as an alternative in the display title, not inserted into this verse."},
    {"slug": "six", "number": "其六", "pages": (90, 91),
     "hash": "a016049dbdd1634c22f97c2597824a54b53f00f9de93fbd589af3a2df9280198", "changes": (("饑", "飢", 1), ("卧", "臥", 1), ("麤", "粗", 1), ("鬛", "鬣", 1)),
     "note": "The Siku verse reads ‘朱色’; another Wikisource transcription of 李賀歌詩編, revision 1755495, reads ‘珠色’. Its print provenance has not been established here."},
    {"slug": "seven", "number": "其七", "pages": (91, 91),
     "hash": "1e5316f8074f45b458c6d6dbf11e101299ef72b5c62127caa45edcde6e6ebd1d", "changes": ()},
    {"slug": "eight", "number": "其八", "pages": (91, 92),
     "hash": "6b49c23e18e4bd9e68f1385f4f3ee94b0d725a7d819e8463bb2d2f4d19dbed03", "changes": (("兎", "兔", 1), ("吕", "呂", 1))},
    {"slug": "nine", "number": "其九", "pages": (92, 92),
     "hash": "e9881ddb6a2971c9f4bf130e77dc45f356c2a45f0acd29b4e5b1f86afcaa77ee", "changes": (("怱", "匆", 2),),
     "note": "The Siku transcription reads ‘飂叔’; the separate 昌谷集 transcription reads ‘颼叔’."},
    {"slug": "ten", "number": "其十", "pages": (92, 93),
     "hash": "17e20e6d0d0e3868eeba05851e4bee31899e8c6886f724368c85d10d9bd9ff26", "changes": ()},
    {"slug": "eleven", "number": "其十一", "pages": (93, 94),
     "hash": "b97b16f7a3a67eb489045af0b2c4133c00ee468b298e231545d077503b672e07", "changes": (("内", "內", 1), ("宫", "宮", 1))},
    {"slug": "twelve", "number": "其十二", "pages": (94, 94),
     "hash": "35dc1f9e9e5f4060bcdfd551cd23d0fe128609deebdec847a40fd5a36d340918", "changes": ()},
    {"slug": "thirteen", "number": "其十三", "pages": (94, 95),
     "hash": "a9c826f272229bfdac41c721a98794d1046be14423dd48fecac3a9825124bc02", "changes": (("寳", "寶", 1),)},
    {"slug": "fifteen", "number": "其十五", "pages": (95, 96),
     "hash": "88f8ec3f2926c52a7ae3c35cd833f52cd41cfd46cd54af0d81b7524db877b914", "changes": (("㸔", "看", 1),)},
    {"slug": "sixteen", "number": "其十六", "pages": (96, 97),
     "hash": "c23d10029920e21b5bb4f49b52ef36b80bbf5a3fd4a6ef801c15ac78945bdddc", "changes": (),
     "note": "The Siku text reads ‘颴風’ and its commentary records ‘飈’ as an alternative; the separate 昌谷集 transcription reads ‘飃風’."},
    {"slug": "seventeen", "number": "其十七", "pages": (97, 97),
     "hash": "40e5f4e456168fd6e8d165617cf872e8df7325bfe8bb2939c99bbd5c4d11117b", "changes": (("鐡", "鐵", 1),)},
    {"slug": "eighteen", "number": "其十八", "pages": (97, 98),
     "hash": "673abbf71844157a5e4e6cf04a418dacb9c8fb1673af5009aafdd9f7f2ad9964", "changes": (("㸔", "看", 1),)},
    {"slug": "nineteen", "number": "其十九", "pages": (98, 98),
     "hash": "def1196535b97b943cc58ed82e0ca3f90d7ab2be01b1bb863457158b00b32d15", "changes": (("䭾", "馱", 1),)},
    {"slug": "twenty", "number": "其二十", "pages": (98, 98),
     "hash": "75f94dee2cd1415c8607389006044ae2a778c25e9e2aebc6986620fbc661b7af", "changes": (("寳", "寶", 1), ("脚", "腳", 1))},
    {"slug": "twenty-one", "number": "其二十一", "pages": (98, 99),
     "hash": "5bba499f91ac7af75bbe1474b609c22b59ce2aa1af6f8eea48b26769968f803d", "changes": (("黄", "黃", 1), ("髙", "高", 1))},
    {"slug": "twenty-two", "number": "其二十二", "pages": (99, 99),
     "hash": "62798e1b20fd0b5a7c186eec13e6017ff6efd3964c21e1bd94ddcebd685ba42d", "changes": ()},
    {"slug": "twenty-three", "number": "其二十三", "pages": (99, 100),
     "hash": "fb899bdc350ecac29480268dadabbee496af3c02959cd7b6b6b749a51854b21d", "changes": (("烟", "煙", 1), ("廐", "廄", 1))},
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
    group = "{{SK anchor|馬詩二十三首}}"
    following = "{{SK anchor|申胡子觱篥歌}}"
    if book.count(group) != 1:
        raise ValueError("Unexpected group boundaries")
    first = book.index(group) + len(group)
    if book[first:].count(following) != 1:
        raise ValueError("Unexpected group boundaries")
    text = remove_notes(book[first:book.index(following, first)])
    # Revision 790637 leaves 其五 unanchored after the fourth poem's last line.
    inline = "猶自帶銅聲其五"
    if text.count(inline) != 1:
        raise ValueError("Unexpected unanchored fifth-poem boundary")
    text = text.replace(inline, "猶自帶銅聲\n{{SK anchor|其五}}", 1)
    pattern = r"\{\{SK anchor\|(其[一二三四五六七八九十]+)\}\}|(?m:^[ \u3000]*(其一)[ \u3000]*$)"
    markers = list(re.finditer(pattern, text))
    labels = tuple(marker.group(1) or marker.group(2) for marker in markers)
    if labels != NUMBERS or text[:markers[0].start()].strip():
        raise ValueError("Unexpected numbered poem boundaries")
    return {
        label: "".join(text[marker.end():markers[index + 1].start() if index + 1 < len(markers) else len(text)].split())
        for index, (label, marker) in enumerate(zip(labels, markers, strict=True))
    }


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
    parts = re.split(r"^=== ([a-z-]+) ===\n", raw.decode("utf8"), flags=re.MULTILINE)
    if parts.pop(0) or len(parts) != len(SELECTION) * 2:
        raise ValueError("Unexpected readings format")
    readings = [(parts[index], parts[index + 1].strip()) for index in range(0, len(parts), 2)]
    if tuple(slug for slug, _ in readings) != tuple(row["slug"] for row in SELECTION):
        raise ValueError("Unexpected selection or order")
    book = (directory / "wikisource-siku-vol2-790637.wikitext").read_text(encoding="utf8")
    sections = source_sections(book)
    result = []
    for row, (_, text) in zip(SELECTION, readings, strict=True):
        lines = text.splitlines()
        if len(lines) != 4 or any(not re.fullmatch(r"[\u3400-\u9fff]{5}[，。]", line) for line in lines):
            raise ValueError(f"Unexpected line boundaries: {row['slug']}")
        if digest(text.encode("utf8")) != row["hash"]:
            raise ValueError(f"Reviewed poem changed: {row['slug']}")
        compare_source(sections[row["number"]], row, text)
        first, last = row["pages"]
        if not 88 <= first <= last <= 100:
            raise ValueError(f"Unexpected page range: {row['slug']}")
        pages = f"p. {first}" if first == last else f"pp. {first}–{last}"
        context = (
            f"A complete numbered poem attributed to Li He under 馬詩二十三首 in the Siku quanshu "
            f"箋註評點李長吉歌詩, PDF {pages}. The heading identifies twenty-three poems; each selected "
            "verse and its following numbered boundary, or the next work after 其二十三, were checked visually in the linked Zhejiang "
            "University/CADAL facsimile. The linked Wikisource transcription identifies the same Siku work, "
            "but its relationship to this scanned copy is not established. A separate Wang Qi scan and "
            "two other Wikisource transcriptions were consulted for selected comparisons, not blended "
            "into this reading; they do not independently prove authorship or manuscript descent. "
            "The facsimile's reproduction date is not identified. Punctuation, reading lines and some "
            "character forms are normalized; this is not a diplomatic transcription. The number and "
            "opening words in the title are editorial. China is associated with the poet, not asserted "
            "as the composition place; the exact composition year is unknown."
        )
        if row.get("note"):
            context += " " + row["note"]
        record = {
            "id": f"li-he-horses-{row['slug']}",
            "title": f"馬詩二十三首（{row['number']} · {lines[0][:-1]}）",
            "author": "Li He", "authorId": "li-he", "authorOriginal": "李賀", "authorYears": "790–816",
            "country": "China", "language": "Chinese", "lang": "zh-Hant", "direction": "ltr",
            "year": None, "yearLabel": "Tang dynasty · exact composition year unknown", "era": "Tang dynasty",
            "form": "Five-character quatrain", "collection": "箋註評點李長吉歌詩 · Siku quanshu",
            "themes": [], "mood": "paper", "context": context, "contextSource": WIKISOURCE,
            "contextSourceTitle": "Chinese Wikisource contributors · Siku volume 2, revision 790637",
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
        }
        if row["slug"] == "five":
            record["displayTitle"] = "馬詩二十三首（其五 · 異文：大漠沙如雪）"
            record["displayTitleLang"] = "zh-Hant"
        result.append(record)
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

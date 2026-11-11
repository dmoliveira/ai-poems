#!/usr/bin/env python3
"""Reproduce reviewed poems from Complete Tang Poems, Siku volume 805."""

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/tang-women-805-readings.txt"
OUTPUT = ROOT / "content/poems/tang-women-805.json"
READINGS_SHA256 = "ac5ae45b796c0d3fa1a723526b6a921f9ee2e62bfa40d7a9b5340284546158e5"
EVIDENCE = {
    "wikisource-qt-805-669710.wikitext": "6197903c1f0a0da083e2774430a8406d2f0f3f9e43a840f94d6e20d71fe5b917",
    "wikisource-xue-li-679301.wikitext": "fb1d0f79ba6575bd64591dcd0f108a49359bee1a7942b4a9a99b3f4370fd5328",
    "06060124.cn.pdf": "b592cac9ee17e88fcedd13e28c5b601032ef494b7dd27c1643cf5c01e5bcf1a6",
    "06076926.cn.pdf": "dd1b4877b0a241aa9b16b2dce3949ebb4473b2cc090be8f53cc618127487dd0f",
}
SCAN = "https://archive.org/download/06060124.cn/06060124.cn.pdf"
WIKISOURCE = (
    "https://zh.wikisource.org/w/index.php?title="
    + quote("御定全唐詩 (四庫全書本)/卷805")
    + "&oldid=669710"
)
LONG_TITLE = "從蕭叔子聽彈琴賦得三峽流泉歌"
DISPUTED = "恩命追入留别廣陵故人"
HEADINGS = (
    "湖上卧病喜陸鴻漸至", "寄校書七兄", "寄朱放", "送韓揆之江西", "道意寄崔侍郎",
    LONG_TITLE, "相思怨", "感興", DISPUTED, "八至", "送閻二十六赴剡縣", "得閻伯鈞書",
    "結素魚貽友人", "偶居", "明月夜留别", "春閨怨", "句", "元淳", "寄洛中諸姊",
    "秦中春望", "句", "海印", "舟夜一章",
)
AUTHORS = {
    "ly": ("Li Ye", "li-ye", "李冶", "8th century"),
    "yc": ("Yuan Chun", "yuan-chun", "元淳", "Tang dynasty"),
    "hy": ("Haiyin", "haiyin", "海印", "late Tang dynasty"),
}

# Each replacement is counted against the source. A placeholder resolution is
# permitted only for the two visually reviewed lines, not arbitrary SKchar.
SELECTION = (
    {"slug": "ly-lake", "heading": "湖上卧病喜陸鴻漸至", "title": "湖上臥病喜陸鴻漸至", "pages": (151, 151), "width": 5, "lines": 8,
     "hash": "a9fa2e440682f2ea284bbc2d1983e60e9b49b9e913df5064975583692970d4f5", "changes": (("来", "來", 1), ("卧", "臥", 1))},
    {"slug": "ly-seven", "heading": "寄校書七兄", "pages": (151, 152), "width": 5, "lines": 8,
     "hash": "b21e7716946de06b9d9520ddc06c17062dc40e0b6f185f5397c9b901e18a1e92", "changes": (("嵗", "歲", 1), ("逺", "遠", 1))},
    {"slug": "ly-zhu", "heading": "寄朱放", "pages": (152, 152), "width": 5, "lines": 8,
     "hash": "82bd91687c3d436b0abcc662da0073d8acca0153eb6bdc26775e076dd2e5f77e", "changes": (("髙", "高", 1), ("濶", "闊", 1), ("别", "別", 1))},
    {"slug": "ly-han", "heading": "送韓揆之江西", "pages": (152, 153), "width": 5, "lines": 8,
     "hash": "59538aa94d250f692298a0743bc89b5365031686c921c749b334beab69ae01d0", "changes": (("别", "別", 1),),
     "note": "The Siku text reads ‘相看指楊柳’ and notes an alternate; the separately transcribed 薛濤李冶詩集 reads ‘相看折楊柳’."},
    {"slug": "ly-cui", "heading": "道意寄崔侍郎", "pages": (153, 153), "width": 5, "lines": 8,
     "hash": "bb1becfc74091d56e4a822a75450b7fca9a69884a40429adb71f2ab20593ddbe", "changes": (("虚", "虛", 1), ("顔", "顏", 1))},
    {"slug": "ly-springs", "heading": LONG_TITLE, "pages": (153, 154), "width": 7, "lines": 16,
     "hash": "b4010ab1a636a2812d889a71ac301cfaab48f0653df53ae480d7c76a038f32af", "changes": (("{{SKchar|3500}}", "絃", 1), ("旣", "既", 1)),
     "note": "The Siku scan reads ‘絃中起’ where Wikisource has an SKchar placeholder; the separately scanned Siku huiyao appears to use ‘弦’. The separate 薛濤李冶詩集 transcription also differs in phrases including ‘玉琴奏出’ and ‘願似流泉’; this reading retains the Siku text."},
    {"slug": "ly-longing", "heading": "相思怨", "pages": (154, 155), "width": 5, "lines": 8,
     "hash": "57f3c2851b4d847a6ae4816021d6f4a28ded664baea8fa19cf0a7d85d8395b0f", "changes": (("{{SKchar|3500}}", "絃", 1), ("髙", "高", 1), ("虚", "虛", 1)),
     "note": "The Siku scan reads ‘絃腸’ where Wikisource has an SKchar placeholder; the separately scanned Siku huiyao appears to use ‘弦’. The separate 薛濤李冶詩集 transcription reads ‘相思眇無畔’ rather than the Siku ‘相思渺無畔’."},
    {"slug": "ly-reflection", "heading": "感興", "pages": (155, 155), "width": 7, "lines": 8,
     "hash": "54b14331bba0c7101a91eedd331c170e158c43135506e48d5efe1d8295d530ab", "changes": (("却", "卻", 1),)},
    {"slug": "ly-eight", "heading": "八至", "pages": (156, 156), "width": 6, "lines": 4,
     "hash": "492c6c0fbc1508e429081778f7bffd76d0edd80cd1896be7df6a76c7f19be6ea", "changes": (("逺", "遠", 1), ("髙", "高", 1), ("疎", "疏", 1)),
     "note": "This Siku reading has ‘至高至明日月’ in the third line."},
    {"slug": "ly-yan", "heading": "送閻二十六赴剡縣", "pages": (156, 156), "width": 5, "lines": 8,
     "hash": "6ab7031f4b0b8ce72d620ec66885adf3d69259366cbdd8a9eb7a1a07266573bc", "changes": (("呉", "吳", 1), ("来", "來", 1)),
     "note": "The separate 薛濤李冶詩集 transcription reads ‘凄凄’ where this Siku text reads ‘萋萋’."},
    {"slug": "ly-letter", "heading": "得閻伯鈞書", "pages": (157, 157), "width": 7, "lines": 4,
     "hash": "694ba1f8a6ecf8aa69a2bbd67fb61c00773223d33c9459cb5ce82fc053e9ae2e", "changes": (("嬾", "懶", 1), ("筯", "箸", 1), ("縁", "緣", 1))},
    {"slug": "ly-fish", "heading": "結素魚貽友人", "pages": (157, 157), "width": 5, "lines": 4,
     "hash": "6ea1da961ca6268e15577d2fb226d595eb0b9e6d81df8fa2f1f9e42081b00959", "changes": (),
     "note": "The separate 薛濤李冶詩集 transcription begins ‘數尺如殘雪’; the Siku text begins ‘尺素如殘雪’."},
    {"slug": "ly-dwelling", "heading": "偶居", "pages": (157, 157), "width": 7, "lines": 4,
     "hash": "0387f2c10e6f080a73204632ffe34aab7d61c8990a431c0197ac79dcdb6ae625", "changes": (("逺", "遠", 1), ("揺", "搖", 1))},
    {"slug": "ly-moon", "heading": "明月夜留别", "title": "明月夜留別", "pages": (158, 158), "width": 7, "lines": 4,
     "hash": "b9a1b39d7db0d1fcb3f945a2e9446bd609a6755f09f17a760c3cf6d2e830577e", "changes": (("别", "別", 1),)},
    {"slug": "ly-spring", "heading": "春閨怨", "pages": (158, 158), "width": 5, "lines": 4,
     "hash": "17922125a428f2cb7dc2de0475803cdab765a73735747291aec6857b0b4b7981", "changes": (("巳", "已", 1), ("抛", "拋", 1)),
     "note": "The separate 薛濤李冶詩集 transcription reads ‘數枝桃已紅’; the Siku text reads ‘數株桃已紅’."},
    {"slug": "yc-sisters", "heading": "寄洛中諸姊", "pages": (159, 159), "width": 5, "lines": 8,
     "hash": "1a301934d44348687773d79d5b4d85de98afc1c5b345f56d02ad44c26c420fea", "changes": (("别", "別", 1), ("慿", "憑", 1), ("鴈", "雁", 1)),
     "note": "The printed Siku text notes ‘書’ as an alternative to ‘詩’ in ‘題詩’."},
    {"slug": "yc-qin", "heading": "秦中春望", "pages": (159, 160), "width": 5, "lines": 8,
     "hash": "d305df419e6aa9de636fc4f15b08aa6aef36b9e6bdbf4d7cfbc35a5c4944e696", "changes": (("宫", "宮", 1), ("徧", "遍", 1), ("晩", "晚", 1))},
    {"slug": "hy-boat", "heading": "舟夜一章", "pages": (160, 161), "width": 5, "lines": 8,
     "hash": "342076091506c0701684e87395d707f399286d9dc8ef75cee72644f6a86c99b7", "changes": (("夣", "夢", 1), ("逺", "遠", 1), ("横", "橫", 1))},
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def remove_notes(text):
    while "{{SK notes|" in text:
        start = text.index("{{SK notes|")
        end, depth = start + 2, 1
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
    start = "李冶字季蘭"
    end = "{{SK anchor|御定全唐詩巻八百五}}"
    if book.count(start) != 1:
        raise ValueError("Unexpected author boundary")
    first = book.index(start)
    if book[first:].count(end) != 1:
        raise ValueError("Unexpected volume boundary")
    text = remove_notes(book[first:book.index(end, first)])
    if text.count(LONG_TITLE) != 1:
        raise ValueError("Unexpected unanchored heading")
    text = text.replace(LONG_TITLE, "{{SK anchor|" + LONG_TITLE + "}}")
    pattern = r"(?m)^[ \u3000]*\{\{SK anchor\|([^{}]+)\}\}[ \u3000]*$"
    markers = list(re.finditer(pattern, text))
    if tuple(marker.group(1) for marker in markers) != HEADINGS:
        raise ValueError("Unexpected poem or author boundaries")
    if "".join(text[:markers[0].start()].split()) != "李冶字季蘭女冠也吳興人存詩十六首":
        raise ValueError("Unexpected Li Ye attribution")
    sections = {}
    for index, marker in enumerate(markers):
        title = marker.group(1)
        end_pos = markers[index + 1].start() if index + 1 < len(markers) else len(text)
        body = text[marker.end():end_pos]
        body = re.sub(r"\{\{SK anchor\|([^{}]+)\}\}", r"\1", body)
        body = "".join(body.split())
        if title == "元淳" and body != "元淳女道士洛中人存詩二首":
            raise ValueError("Unexpected Yuan Chun attribution")
        if title == "海印" and body != "海印蜀慈光寺尼唐末人才思清峻存詩一首":
            raise ValueError("Unexpected Haiyin attribution")
        if title not in ("句", "元淳", "海印", DISPUTED):
            sections[title] = body
    return sections


def compare_source(source, row, reading):
    for old, new, count in row["changes"]:
        if source.count(old) != count:
            raise ValueError(f"Unexpected source change: {row['slug']}")
        source = source.replace(old, new)
    if "{{" in source or "}}" in source:
        raise ValueError(f"Unexpected verse markup: {row['slug']}")
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
    sections = source_sections((directory / "wikisource-qt-805-669710.wikitext").read_text(encoding="utf8"))
    result = []
    for row, (_, text) in zip(SELECTION, readings, strict=True):
        width = row["width"]
        lines = text.splitlines()
        if len(lines) != row["lines"] or any(not re.fullmatch(rf"[\u3400-\u9fff]{{{width}}}[，。]", line) for line in lines):
            raise ValueError(f"Unexpected line boundaries: {row['slug']}")
        if digest(text.encode("utf8")) != row["hash"]:
            raise ValueError(f"Reviewed poem changed: {row['slug']}")
        compare_source(sections[row["heading"]], row, text)
        first, last = row["pages"]
        if not 151 <= first <= last <= 161:
            raise ValueError(f"Unexpected page range: {row['slug']}")
        pages = f"p. {first}" if first == last else f"pp. {first}–{last}"
        name, author_id, original, years = AUTHORS[row["slug"].split("-")[0]]
        context = (
            f"A complete poem attributed to {name} in 御定全唐詩, Siku quanshu volume 805, PDF {pages}. "
            "The printed heading, verse and following boundary were checked visually in the linked Zhejiang "
            "University/CADAL facsimile. The linked Wikisource transcription identifies the same Siku work, "
            "but its relationship to this scanned copy is not established. The separate Siku huiyao scan "
            "and a 薛濤李冶詩集 transcription were consulted for selected comparisons, not blended into "
            "the reading. These witnesses do not independently prove authorship or manuscript descent; "
            "the later compilation is not an autograph. The facsimile's reproduction date is not identified. "
            "Punctuation, reading lines and some character forms are normalized; this is not a diplomatic "
            "transcription. China is associated with the poet, not asserted as the composition place; "
            "the exact composition year is unknown."
        )
        if row.get("note"):
            context += " " + row["note"]
        result.append({
            "id": f"qt805-{row['slug']}", "title": row.get("title", row["heading"]),
            "author": name, "authorId": author_id, "authorOriginal": original, "authorYears": years,
            "country": "China", "language": "Chinese", "lang": "zh-Hant", "direction": "ltr",
            "year": None, "yearLabel": "Tang dynasty · exact composition year unknown", "era": "Tang dynasty",
            "form": {5: "Five-character poem", 6: "Six-character poem", 7: "Seven-character poem"}[width],
            "collection": "御定全唐詩 · Siku quanshu", "themes": [], "mood": "paper",
            "context": context, "contextSource": WIKISOURCE,
            "contextSourceTitle": "Chinese Wikisource contributors · Siku volume 805, revision 669710",
            "sourceTitle": f"Zhejiang University / CADAL · Siku facsimile, PDF {pages}",
            "source": f"{SCAN}#page={first}",
            "rights": (
                "The historical poems are public domain in the United States; check local law. "
                "The facsimiles are linked, not republished. This reading adapts the linked Chinese "
                "Wikisource transcription, credited to its contributors including 維基小霸王, "
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

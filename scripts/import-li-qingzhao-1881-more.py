#!/usr/bin/env python3
"""Reproduce further Li Qingzhao readings from the reviewed 1881 scan."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/li-qingzhao-1881-more-readings.txt"
OUTPUT = ROOT / "content/poems/li-qingzhao-1881-more.json"
READINGS_SHA256 = "8c7bd5629e04ac44d4d8e7635747986d56fab33f399737409e21452621df6aca"
EVIDENCE = {
    "shuyu-1881.pdf": "fc7dc74f055ee6fc53f56802c1bc3d7d368caa499e097d8fdf0910bb9283b28d",
    "pg25367.txt": "f6e39371fd825273a97588004dfc02b34d3c87f3d1cedf15a12be70e51630fa3",
}
SCAN = (
    "https://upload.wikimedia.org/wikipedia/commons/9/9a/"
    "NLC892-312002087162-387332_%E6%BC%B1%E7%8E%89%E8%A9%9E.pdf"
)
EGAN = "https://library.oapen.org/bitstream/handle/20.500.12657/23528/1006618.pdf"

# From the pinned Gutenberg text to the scan-based readings. These substitutions
# are comparison checks, not permission to silently repair the historical print.
COMPARISON = {
    "cold-window": (("酒闌更喜", "酒闌愛喜"), ("更凄涼", "更淒涼"), ("隨分尊前", "隨分樽前")),
    "deep-courtyard": (("人客遠安城", "人老建康城"), ("更凋零", "更彫零")),
    "fallen-blossoms": (("玉尊空青缸", "玉樽空青釭"), ("啼鴃", "啼鴂")),
    "late-undressing": (("酒醒熏破春睡夢遠不成歸", "酒醒熏破惜春夢遠又不成歸"), ("捻余香", "撚餘香")),
    "desolate-court": (("清露晨流", "清露晨梳"), ("煙斂", "煙歛")),
    "seeking": (("凄凄", "悽悽"), ("一個", "一箇")),
}

# Page numbers refer to PDF pages; stanza lengths describe reading lines, not
# the printed columns. The text hashes guard the individually reviewed lyrics.
SELECTION = (
    (
        "cold-window", "鷓鴣天", "寒日蕭蕭上鎖窗", (9, 9), (4, 5), "",
        "ce4e3abc3e1fa2e594c3d700cb2a5741f10caaa12170938dad2f70a27ce554c1",
        ("The 1881 print reads ‘酒闌愛喜團茶苦’; Gutenberg and Egan read ‘酒闌更喜團茶苦’. "
         "The print also has ‘樽前’, where Gutenberg has ‘尊前’. These may include printing variants or errors."),
    ),
    (
        "deep-courtyard", "臨江仙", "庭院深深深幾許", (9, 10), (5, 5), "",
        "56f9999ec6d1cd11c17158643bcc227040e860f8f73e54842f08c58e6a592d05",
        ("The 1881 print reads ‘人老建康城’; Gutenberg has ‘人客遠安城’ and Egan ‘人客建康城’. "
         "The opening is shared with an earlier lyric commonly attributed to Feng Yansi and another "
         "Li-attributed lyric; shared opening words do not make the complete poems identical."),
    ),
    (
        "fallen-blossoms", "好事近", "風定落花深", (10, 10), (4, 4), "",
        "8d023da9d5f3c287eb6df35fe2d1439ed70576df626e090065faca9d0c060d23",
        ("A note in the 1881 print questions whether ‘是’ in ‘正是傷春時節’ is superfluous; "
         "the main printed reading is retained. The print has ‘玉樽’, ‘青釭’ and ‘啼鴂’; "
         "Gutenberg has ‘玉尊’, ‘青缸’ and ‘啼鴃’."),
    ),
    (
        "late-undressing", "訴衷情", "夜來沈醉卸妝遲", (10, 10), (5, 6), "",
        "ed6d02c768e50ab0ba5724c98df48c3437362bd20d28974193305b5650171e9d",
        ("The 1881 print reads ‘酒醒熏破惜春夢遠又不成歸’; Gutenberg and Egan read "
         "‘酒醒熏破春睡夢遠不成歸’. The print's editor questions the metre, suggesting "
         "a copying addition or a different historical form; the printed reading is retained."),
    ),
    (
        "desolate-court", "壺中天慢", "蕭條庭院", (11, 11), (10, 10), "念奴嬌",
        "346e9bee1e38318864fc5eab79be230c681aabaa0d4156114851558c03e26f0a",
        ("The 1881 print titles the lyric ‘壺中天慢’; Gutenberg and Egan use ‘念奴嬌’. "
         "The print reads ‘清露晨梳’ and ‘煙歛’; Gutenberg reads ‘清露晨流’ and ‘煙斂’. "
         "Egan also reads ‘清露晨流’."),
    ),
    (
        "seeking", "聲聲慢", "尋尋覓覓", (11, 11), (11, 10), "",
        "9cd83b105eb172fe93dddf9806abfc2328744f867e64b7ea38fecf0d841319a5",
        ("The 1881 print and Gutenberg read ‘晚來風急’; Egan reads ‘晚來風力’. "
         "The print's window character is normalized to ‘窗’; Taiwan's Ministry of Education "
         "dictionary records ‘牎’ and ‘牕’ as variants of ‘窗’."),
    ),
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def compare_gutenberg(book, slug, incipit, reading):
    """Reject undocumented character differences; punctuation is not compared."""
    start = book.find(incipit)
    end = book.find("☆", start) if start >= 0 else -1
    if start < 0 or end < 0:
        raise ValueError(f"Missing comparison boundaries: {slug}")

    def characters(value):
        return "".join(char for char in unicodedata.normalize("NFKC", value) if "\u3400" <= char <= "\u9fff")

    comparison = characters(book[start:end])
    for old, new in COMPARISON[slug]:
        if comparison.count(old) != 1:
            raise ValueError(f"Unexpected comparison variant: {slug}")
        comparison = comparison.replace(old, new, 1)
    if comparison != characters(reading):
        raise ValueError(f"Undocumented comparison difference: {slug}")


def records(directory):
    evidence = {}
    for name, expected in EVIDENCE.items():
        evidence[name] = (directory / name).read_bytes()
        if digest(evidence[name]) != expected:
            raise ValueError(f"Reviewed evidence changed: {name}")
    raw = READINGS.read_bytes()
    if digest(raw) != READINGS_SHA256:
        raise ValueError("Reviewed readings changed")
    parts = re.split(r"^=== ([a-z0-9-]+) ===\n", raw.decode("utf8"), flags=re.MULTILINE)
    if parts.pop(0) or len(parts) != len(SELECTION) * 2:
        raise ValueError("Unexpected readings format")
    readings = [(parts[i], parts[i + 1].strip()) for i in range(0, len(parts), 2)]
    if tuple(slug for slug, _ in readings) != tuple(row[0] for row in SELECTION):
        raise ValueError("Unexpected selection or order")
    comparison = evidence["pg25367.txt"].decode("utf8")

    result = []
    for row, (_, text) in zip(SELECTION, readings, strict=True):
        slug, tune, incipit, pages, stanza_counts, alternate_tune, text_hash, note = row
        if not 1 <= pages[0] <= pages[1] <= 39:
            raise ValueError(f"Invalid PDF page range: {slug}")
        if tuple(len(stanza.splitlines()) for stanza in text.split("\n\n")) != stanza_counts:
            raise ValueError(f"Unexpected reading-line boundaries: {slug}")
        if not text.startswith(incipit) or any(line != line.strip() for line in text.splitlines()):
            raise ValueError(f"Unexpected incipit or whitespace: {slug}")
        if any(mark in text for mark in ("□", "�")):
            raise ValueError(f"Unresolved reading: {slug}")
        if digest(text.encode("utf8")) != text_hash:
            raise ValueError(f"Reviewed lyric changed: {slug}")
        compare_gutenberg(comparison, slug, incipit, text)
        page_label = str(pages[0]) if pages[0] == pages[1] else f"{pages[0]}–{pages[1]}"
        context = (
            f"A complete song lyric in the 1881 Siyinzhai Shuyu ci, PDF pp. {page_label}. "
            "Its verse, beginning and following boundary were checked against the linked scan, "
            "with Gutenberg eBook 25367 as a comparison aid. Punctuation, reading lines, "
            "stanza breaks and some character forms are normalized; this is a reading "
            "transcription, not a diplomatic edition. Incipits distinguish works sharing a "
            "tune. Li's early collection was lost and attributions vary: Ronald Egan places "
            "these lyrics among earlier-attested attributions, a scholarly assessment, not "
            "proof of sole authorship. China is associated with the poet, not asserted as "
            "the place of composition; the exact year is not established. " + note
        )
        poem = {
            "id": f"li-qingzhao-1881-more-{slug}",
            "title": f"{tune}（{incipit}）",
            "author": "Li Qingzhao",
            "authorId": "li-qingzhao",
            "authorOriginal": "李清照",
            "authorYears": "1084–12th century",
            "country": "China",
            "language": "Chinese",
            "lang": "zh-Hant",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Song dynasty · exact composition year unknown",
            "era": "Song dynasty",
            "form": "Ci poetry",
            "collection": "Shuyu ci · 1881 Siyinzhai edition",
            "themes": [],
            "mood": "paper",
            "context": context,
            "contextSource": EGAN,
            "contextSourceTitle": "Ronald Egan · The Works of Li Qingzhao (2019), attribution discussion",
            "sourceTitle": f"NLC scan via Wikimedia Commons · Shuyu ci, 1881, PDF pp. {page_label}",
            "source": f"{SCAN}#page={pages[0]}",
            "rights": (
                "The historical originals and 1881 printing are public domain in the United "
                "States; check local law. The NLC scan is linked, not republished. Gutenberg "
                "credits Christine Zeng and the Zhong Hua Publishing House for its comparison eBook. "
                "No translation is supplied."
            ),
            "text": text,
            "translations": [],
        }
        if alternate_tune:
            poem["displayTitle"] = f"{alternate_tune}（{incipit}）"
            poem["displayTitleLang"] = "zh-Hant"
            poem["context"] += " The alternate tune name in the display title aids discovery."
        result.append(poem)
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

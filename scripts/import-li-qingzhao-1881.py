#!/usr/bin/env python3
"""Reproduce selected Li Qingzhao readings from a reviewed historical scan."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/li-qingzhao-1881-readings.txt"
OUTPUT = ROOT / "content/poems/li-qingzhao-1881.json"
READINGS_SHA256 = "f04afe35e4630826413ff342c0f0c9075fe8edd7bf5594ff61644ce43291aba1"
EVIDENCE = {
    "shuyu-1881.pdf": "fc7dc74f055ee6fc53f56802c1bc3d7d368caa499e097d8fdf0910bb9283b28d",
    "pg25367.txt": "f6e39371fd825273a97588004dfc02b34d3c87f3d1cedf15a12be70e51630fa3",
}
SCAN = (
    "https://upload.wikimedia.org/wikipedia/commons/9/9a/"
    "NLC892-312002087162-387332_%E6%BC%B1%E7%8E%89%E8%A9%9E.pdf"
)
EGAN = "https://library.oapen.org/bitstream/handle/20.500.12657/23528/1006618.pdf"
FUSHAN = (
    "https://zh.wikisource.org/w/index.php?title="
    "%E6%B5%AE%E5%B1%B1%E9%9B%86_(%E5%9B%9B%E5%BA%AB%E5%85%A8%E6%9B%B8%E6%9C%AC)"
    "/%E5%8D%B703&oldid=787928"
)
ZHOU = "https://www.xuges.com/mj/z/zby/py/187.htm"

# PDF pages, not the printed woodblock leaf numbers. Tune names repeated by
# "又" in the scan are expanded; the incipits disambiguate shared tunes.
# Each tuple of counts describes our reading lines, not printed columns.
SELECTION = (
    ("southern-song", "南歌子", "天上星河轉", (5, 5), (4, 4), "", ""),
    ("fisher-dream", "漁家傲", "天接雲濤連曉霧", (6, 6), (5, 5), "",
     "The scan's historical variant 䢜 in ‘夢魂䢜帝所’ is normalized to 歸."),
    ("stream-pavilion", "如夢令", "常記溪亭日暮", (6, 6), (6,), "",
     ("Other anthologies attribute this lyric to Su Shi, Lü Dongbin or an unknown author; "
      "scholars also cite an early attribution to Li. The 1881 print reads 常記 and 晚回舟; "
      "other witnesses have 嘗記 and 欲回舟.")),
    ("last-night", "如夢令", "昨夜雨疏風驟", (6, 6), (6,), "", ""),
    ("gentle-wind", "菩薩蠻", "風柔日薄春猶早", (7, 7), (4, 4), "", ""),
    ("small-courtyard", "浣溪紗", "小院閒窗春色深", (7, 7), (3, 3), "浣溪沙",
     ("Other collections attribute a version to Zhou Bangyan or Ouyang Xiu, while early "
      "anthologies attribute it to Li. The 1881 print reads ‘遠岫出山’; some later "
      "readings have ‘遠岫出雲’.")),
    ("cold-food", "浣溪紗", "淡蕩春光寒食天", (7, 8), (3, 3), "浣溪沙",
     ("A reconstructed Fushan ji also attributes a related version to Zhong Bing (仲并); "
      "the attribution is disputed. The 1881 print reads ‘江梅已過’; Gutenberg's "
      "unidentified edition reads ‘江海已過’.")),
    ("red-lotus", "一翦梅", "紅藕香殘玉簟秋", (8, 8), (4, 4), "一剪梅", ""),
    ("farewell", "蝶戀花", "淚濕羅衣脂粉滿", (8, 8), (4, 4), "",
     "A small note in this printing gives ‘淚搵征衣脂粉暖’ as an alternative opening."),
    ("warm-rain", "蝶戀花", "暖雨晴風初破凍", (9, 9), (4, 4), "",
     "The 1881 print begins ‘暖雨晴風’; Gutenberg's unidentified edition has ‘暖日晴風’."),
    ("long-gate", "小重山", "春到長門春草青", (9, 9), (4, 4), "", ""),
    ("chrysanthemum", "醉花陰", "薄霧濃雲愁永晝", (10, 10), (4, 4), "",
     ("The 1881 print ends ‘人比黃花瘦’ and notes 似 as an alternative; "
      "Gutenberg's unidentified edition prints ‘人似黃花瘦’.")),
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def records(directory):
    for name, expected in EVIDENCE.items():
        if digest((directory / name).read_bytes()) != expected:
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

    result = []
    for row, (_, text) in zip(SELECTION, readings, strict=True):
        slug, tune, incipit, pages, stanza_counts, alternative_tune, note = row
        if not (1 <= pages[0] <= pages[1] <= 39):
            raise ValueError(f"Invalid PDF page range: {slug}")
        if tuple(len(stanza.splitlines()) for stanza in text.split("\n\n")) != stanza_counts:
            raise ValueError(f"Unexpected reading-line boundaries: {slug}")
        if not text.startswith(incipit) or any(line != line.strip() for line in text.splitlines()):
            raise ValueError(f"Unexpected incipit or whitespace: {slug}")
        if any(mark in text for mark in ("□", "�")):
            raise ValueError(f"Unresolved reading: {slug}")
        page_label = str(pages[0]) if pages[0] == pages[1] else f"{pages[0]}–{pages[1]}"
        context = (
            f"A complete song lyric in the 1881 Siyinzhai Shuyu ci, PDF pp. {page_label}. "
            "The verse and printed boundaries were checked against the linked scan, with "
            "Gutenberg eBook 25367 used as a comparison aid. This is a reading transcription: "
            "punctuation, lineation, stanza breaks and some character forms are normalized; "
            "it is not a diplomatic edition. Tune names marked ‘another’ in print are "
            "expanded and first lines added to distinguish works. The old collection is lost; "
            "attributions and readings vary between witnesses. China is associated with the "
            "poet, not asserted as the place of composition; the exact year is not established."
        )
        if note:
            context += " " + note
        comparison = FUSHAN if slug == "cold-food" else ZHOU if slug == "small-courtyard" else EGAN
        comparison_title = (
            "Wikisource · Fushan ji, reconstructed volume 3"
            if slug == "cold-food" else
            "Xuges · a version attributed to Zhou Bangyan or Ouyang Xiu"
            if slug == "small-courtyard" else
            "Ronald Egan · The Works of Li Qingzhao (2019), attribution discussion"
        )
        poem = {
            "id": f"li-qingzhao-1881-{slug}",
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
            "contextSource": comparison,
            "contextSourceTitle": comparison_title,
            "sourceTitle": f"NLC scan via Wikimedia Commons · Shuyu ci, 1881, PDF pp. {page_label}",
            "source": f"{SCAN}#page={pages[0]}",
            "rights": (
                "The historical originals and 1881 printing are public domain in the United "
                "States; check local law. The NLC scan is linked, not republished. Gutenberg "
                "credits Christine Zeng and the Zhong Hua Publishing House for its comparison eBook."
            ),
            "text": text,
            "translations": [],
        }
        if alternative_tune:
            poem["displayTitle"] = f"{alternative_tune}（{incipit}）"
            poem["displayTitleLang"] = "zh-Hant"
            poem["context"] += " The alternate tune-name spelling in the display title aids discovery."
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

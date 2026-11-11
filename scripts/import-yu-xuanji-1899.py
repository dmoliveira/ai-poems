#!/usr/bin/env python3
"""Reproduce two reviewed Yu Xuanji readings from a dated facsimile."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/yu-xuanji-1899-readings.txt"
EXCERPTS = ROOT / "scripts/sources/yu-xuanji-1899-comparison-excerpts.txt"
OUTPUT = ROOT / "content/poems/yu-xuanji-1899.json"
READINGS_SHA256 = "781d8207a196df05f5d6e642d2d4b2b9d577ac9750eadea19999031256653047"
EXCERPTS_SHA256 = "0fd84973a12c2b9af6f65dfa74a273e4b7eb2100a2f1ce18f8e64ad662c56828"
SCAN_FILE = "utokyo-annotated-leaves.pdf"
SCAN_SHA256 = "b960284229a04fcd17d981984dd1411afe1623dc5b38e1c7e331538a19bdf7ba"
SCAN = (
    "https://archive.org/download/ogai-2c44dd18-486d-4440-a72c-0eb14201ebd8/"
    "ogai-2c44dd18-486d-4440-a72c-0eb14201ebd8.pdf#page=3"
)
WIKISOURCE = (
    "https://zh.wikisource.org/w/index.php?title="
    + quote("御定全唐詩 (四庫全書本)/卷804")
    + "&oldid=669708"
)

# The comparison is a separately credited edition; the curated excerpts are
# not the complete raw revision. Hashes cannot establish visual collation.
SELECTION = (
    {
        "slug": "willow", "title": "賦得江邊柳",
        "hash": "c21ba6ddf9bc1a04e5be7e3693a6f7d52b3d804dc89c68eac4171430f7b49483",
        "adjustments": (("逺", "遠"), ("蕭蕭", "瀟瀟")),
        "note": (
            "The facsimile reads ‘瀟瀟風雨夜’; the Wikisource comparison has ‘蕭蕭風雨夜’ "
            "and records several other alternate characters."
        ),
    },
    {
        "slug": "neighbour", "title": "贈鄰女",
        "hash": "620e147610c893844abcfcf95bcdb3246f245f1187b1c277475c2c4983d76c29",
        "adjustments": (("嬾", "懶"), ("妝", "粧"), ("寳", "寶")),
        "note": (
            "The facsimile reads ‘懶起粧’; the Wikisource comparison has ‘嬾起妝’ and notes "
            "‘寄李憶員外’ as another title. Yang Liu’s 2020 study discusses this poem as Yu’s."
        ),
    },
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def characters(value):
    return "".join(char for char in unicodedata.normalize("NFKC", value) if "\u3400" <= char <= "\u9fff")


def blocks(raw, allow_comments=False):
    parts = re.split(r"^=== ([a-z0-9-]+) ===\n", raw.decode("utf8"), flags=re.MULTILINE)
    preamble = parts.pop(0)
    if preamble and (not allow_comments or any(not line.startswith("#") for line in preamble.splitlines())):
        raise ValueError("Unexpected file preamble")
    if len(parts) != len(SELECTION) * 2:
        raise ValueError("Unexpected section count")
    entries = [(parts[i], parts[i + 1].strip()) for i in range(0, len(parts), 2)]
    if tuple(slug for slug, _ in entries) != tuple(row["slug"] for row in SELECTION):
        raise ValueError("Unexpected selection or order")
    return entries


def compare_excerpt(excerpt, row, reading):
    source = re.sub(r"\{\{SK notes\|[^{}]*\}\}", "", excerpt)
    source = re.sub(r"\{\{SK anchor\|([^{}]*)\}\}", r"\1", source)
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
    scan = (directory / SCAN_FILE).read_bytes()
    if digest(scan) != SCAN_SHA256:
        raise ValueError("Reviewed scan changed")
    readings = READINGS.read_bytes()
    excerpts = EXCERPTS.read_bytes()
    if digest(readings) != READINGS_SHA256:
        raise ValueError("Reviewed readings changed")
    if digest(excerpts) != EXCERPTS_SHA256:
        raise ValueError("Reviewed comparison excerpts changed")
    selected = blocks(readings)
    comparisons = blocks(excerpts, allow_comments=True)
    result = []
    for row, (_, text), (_, excerpt) in zip(SELECTION, selected, comparisons, strict=True):
        lines = text.splitlines()
        if len(lines) != 8 or any(not re.fullmatch(r"[\u3400-\u9fff]{5}[，。]", line) for line in lines):
            raise ValueError(f"Unexpected reading-line boundaries: {row['slug']}")
        if digest(text.encode("utf8")) != row["hash"]:
            raise ValueError(f"Reviewed poem changed: {row['slug']}")
        compare_excerpt(excerpt, row, text)
        context = (
            "A complete poem attributed to Yu Xuanji in the University of Tokyo's facsimile "
            "with a title dated 1899, PDF p. 3. Its complete verse and following boundary were "
            "checked visually against that scan and an earlier saved view of a similar 1920 "
            "National Central Library scan. The latter's catalogue credits Wu Weiye, although its "
            "printed heading names Yu Xuanji; the reason for the conflict is not established. "
            "The linked Wikisource transcription of a different Siku quanshu edition was a "
            "comparison aid. The scans may be related and are not independent proof of textual "
            "descent or authorship. Punctuation, reading lines and some character forms are "
            "normalized; this is not a diplomatic transcription. China is associated with Yu, "
            "not asserted as the composition place; the exact year is unknown. " + row["note"]
        )
        result.append({
            "id": f"yu-xuanji-1899-{row['slug']}",
            "title": row["title"],
            "author": "Yu Xuanji",
            "authorId": "yu-xuanji",
            "authorOriginal": "魚玄機",
            "authorYears": "9th century",
            "country": "China",
            "language": "Chinese",
            "lang": "zh-Hant",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Tang dynasty · exact composition year unknown",
            "era": "Tang dynasty",
            "form": "Five-character poem",
            "collection": "唐女郎魚玄機詩 · 1899-dated title",
            "themes": [],
            "mood": "paper",
            "context": context,
            "contextSource": WIKISOURCE,
            "contextSourceTitle": "Chinese Wikisource contributors · Quan Tangshi, revision 669708",
            "sourceTitle": "University of Tokyo / Internet Archive · 唐女郎魚玄機詩, PDF p. 3",
            "source": SCAN,
            "rights": (
                "The historical poems are public domain in the United States; check local law. "
                "Scans are linked, not republished. This reading adapts the linked Chinese Wikisource "
                "transcription, credited to its contributors including 維基小霸王, and is distributed "
                "under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/); see the linked "
                "revision and contributor history. No translation is supplied."
            ),
            "text": text,
            "translations": [],
        })
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the reviewed scan PDF")
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

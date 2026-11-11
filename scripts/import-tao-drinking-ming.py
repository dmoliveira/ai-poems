#!/usr/bin/env python3
"""Reproduce ten scan-checked Tao Yuanming readings from a Ming printing."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/tao-drinking-ming-readings.txt"
OUTPUT = ROOT / "content/poems/tao-drinking-ming.json"
READINGS_SHA256 = "0f8fcf9c5c9e268a605500d4c20d001c430da394f93db1bb31292a662e5c35b7"
EVIDENCE = {
    "tao-ming.pdf": "af6c58dda3293130fa0d03738c854c7f1ab76b31ad14dd9d870f5d26ee4eddbb",
    "wikisource-drinking-oldid2692638.txt": "bd4912bc701c370d247f3f7d0ef655ec11c66ca5b4846d5e854009c90461d06d",
}
COMPARISON_FILE = "wikisource-drinking-oldid2692638.txt"
SCAN = (
    "https://upload.wikimedia.org/wikipedia/commons/3/3e/"
    "NCL-09399_%E9%99%B6%E6%B7%B5%E6%98%8E%E9%9B%86.pdf"
)
WIKISOURCE = (
    "https://zh.wikisource.org/w/index.php?title="
    "%E9%A3%B2%E9%85%92%E4%BA%8C%E5%8D%81%E9%A6%96&oldid=2692638"
)

# PDF pages and five-character couplets, not printed column counts. Each
# numbered poem is a complete selection; the shared prose preface is omitted.
SELECTION = (
    ("01", "一", "衰榮無定在", (59, 59), 5),
    ("02", "二", "積善云有報", (60, 60), 4),
    ("03", "三", "道喪向千載", (60, 60), 5),
    ("05", "五", "結廬在人境", (60, 61), 5),
    ("06", "六", "行止千萬端", (61, 61), 4),
    ("08", "八", "青松在東園", (62, 62), 5),
    ("09", "九", "清晨聞叩門", (62, 62), 8),
    ("14", "十四", "故人賞我趣", (64, 64), 5),
    ("16", "十六", "少年罕人事", (65, 65), 6),
    ("17", "十七", "幽蘭生前庭", (65, 65), 4),
)
CHARACTER_FORMS = {"14": (("荆", "荊"),), "16": (("游", "遊"),)}
NOTES = {
    "05": "The print reads ‘悠然見南山’; its commentary reports 望 as a reading in other texts.",
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def strip_marks(value):
    return re.sub(r"[\s，。！？、]", "", value)


def records(directory):
    for name, expected in EVIDENCE.items():
        if digest((directory / name).read_bytes()) != expected:
            raise ValueError(f"Reviewed evidence changed: {name}")
    raw = READINGS.read_bytes()
    if digest(raw) != READINGS_SHA256:
        raise ValueError("Reviewed readings changed")
    parts = re.split(r"^=== (\d{2}) ===\n", raw.decode("utf8"), flags=re.MULTILINE)
    if parts.pop(0) or len(parts) != len(SELECTION) * 2:
        raise ValueError("Unexpected readings format")
    readings = [(parts[i], parts[i + 1].strip()) for i in range(0, len(parts), 2)]
    if tuple(number for number, _ in readings) != tuple(row[0] for row in SELECTION):
        raise ValueError("Unexpected selection or order")

    comparison = (directory / COMPARISON_FILE).read_text(encoding="utf8")
    result = []
    for row, (_, text) in zip(SELECTION, readings, strict=True):
        number, numeral, incipit, pages, count = row
        if not (1 <= pages[0] <= pages[1] <= 200):
            raise ValueError(f"Invalid PDF page range: {number}")
        lines = text.splitlines()
        if len(lines) != count or any(len(re.sub(r"[，。！？]", "", line)) != 10 for line in lines):
            raise ValueError(f"Unexpected couplet boundaries: {number}")
        if not text.startswith(incipit) or any(line != line.strip() for line in lines):
            raise ValueError(f"Unexpected incipit or whitespace: {number}")
        if any(mark in text for mark in ("□", "�")):
            raise ValueError(f"Unresolved reading: {number}")
        matches = re.findall(
            rf"^===其{re.escape(numeral)}===\s*<poem>\s*([\s\S]*?)</poem>",
            comparison,
            flags=re.MULTILINE,
        )
        if len(matches) != 1:
            raise ValueError(f"Missing or repeated comparison poem: {number}")
        aid = re.sub(r"-\{(.*?)\}-", r"\1", matches[0])
        for old, new in CHARACTER_FORMS.get(number, ()):
            aid = aid.replace(old, new)
        if strip_marks(aid) != strip_marks(text):
            raise ValueError(f"Undocumented comparison difference: {number}")
        page_label = str(pages[0]) if pages[0] == pages[1] else f"{pages[0]}–{pages[1]}"
        context = (
            f"Poem {int(number)} is separately numbered in the Ming Chongzhen printing of "
            f"Tao Yuanming ji, PDF pp. {page_label}. Its complete verse and boundaries were "
            "checked against the linked scan. This reading adapts the linked Chinese Wikisource "
            "transcription by its contributors; punctuation, reading lines and some character "
            "forms are normalized. It is not a diplomatic edition, and other witnesses can "
            "differ. The series' shared prose preface is not a separate poem here. China is "
            "associated with the poet, not asserted as the place of composition; the exact "
            "composition year is not established."
        )
        if number in NOTES:
            context += " " + NOTES[number]
        result.append({
            "id": f"tao-yuanming-drinking-ming-{number}",
            "title": f"飲酒（其{numeral} · {incipit}）",
            "author": "Tao Yuanming",
            "authorId": "tao-yuanming",
            "authorOriginal": "陶淵明",
            "authorYears": "4th–5th century",
            "country": "China",
            "language": "Chinese",
            "lang": "zh-Hant",
            "direction": "ltr",
            "year": None,
            "yearLabel": "4th–5th century · exact composition year unknown",
            "era": "Eastern Jin and Liu Song",
            "form": "Five-character verse",
            "collection": "Drinking Wine · Ming Chongzhen printing",
            "themes": [],
            "mood": "paper",
            "context": context,
            "contextSource": WIKISOURCE,
            "contextSourceTitle": "Chinese Wikisource contributors · Drinking Wine, revision 2692638",
            "sourceTitle": f"NCL scan via Wikimedia Commons · Tao Yuanming ji, PDF pp. {page_label}",
            "source": f"{SCAN}#page={pages[0]}",
            "rights": (
                "The historical poems and pre-1931 printing are public domain in the United "
                "States; check local law. The scan is linked, not republished. The adapted "
                "Wikisource transcription is credited to its contributors under CC BY-SA 4.0 "
                "(https://creativecommons.org/licenses/by-sa/4.0/); see the linked revision "
                "and its contributor history."
            ),
            "text": text,
            "translations": [],
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

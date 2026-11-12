#!/usr/bin/env python3
"""Reproduce four 1921 Ayscough and Lowell translations of existing poems."""

import argparse
import hashlib
import html
import json
import re
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "content/fir-flower-translations.mjs"
EVIDENCE = {
    "gutenberg-48222.html": "9b160638c1501b301809940aa84fe76b1e0693e86b8c8aba1efad300ae1c9506",
    "firflower-1921-michigan.pdf": "ac0f04799809a3adffc379a4a099e1a064368fe0db2c7a594923ca67968d9f63",
    "firflower-1921-michigan-ocr.xml": "f1654de7c7b6e7ef44e758f3e335e90587a0708a94464c219ab9b82a25e8cf3f",
}
SELECTION = (
    {
        "id": "tang-015", "anchor": "THE_BLUE-GREEN_STREAM", "heading": "THE BLUE-GREEN STREAM",
        "author": "BY WANG WEI", "title": "The Blue-Green Stream", "page": 229, "lines": 15, "italics": 1,
        "sha256": "d281a74712c16c0bd1628047ef1fa1106bf74b0209fc6635361adac01477a2bc",
        "first": "Every time I have started", "last": "Dropping my fish-line forever.",
        "corrections": (
            ("one hundred H.", "one hundred li."), ("Riingled", "mingled"), ("stoaes", "stones"),
            ("heart b clean", "heart is clean"), ("pladd river", "placid river"),
        ),
        "note": "‘Clean and white as silk’ elaborates the displayed Chinese description of the heart.",
    },
    {
        "id": "tang-016", "anchor": "FARM_HOUSE", "heading": "FARM HOUSE ON THE WEI STREAM",
        "author": "BY WANG WEI", "title": "Farm House on the Wei Stream", "page": 230, "lines": 10, "italics": 0,
        "sha256": "9a170d327732ab8db3a6fb42a4128ea977ec8d882a57e30aee6ec353e5b446a7",
        "first": "The slanting sun shines", "last": "Shrunken ■",
        "corrections": (("thom-branch", "thorn-branch"), ("Silk-wonns", "Silk-worms")),
        "note": (
            "‘Upon the heights’ is not explicit in the displayed Chinese. ‘Dwindled and Shrunken’ "
            "is the translators’ rendering of the song title 式微."
        ),
    },
    {
        "id": "tang-022", "anchor": "SEEKING_FOR_THE_HERMIT_OF_THE_WEST",
        "heading": "SEEKING FOR THE HERMIT OF THE WEST HILL; NOT MEETING HIM", "author": "BY CH'IU WEI",
        "title": "Seeking for the Hermit of the West Hill; Not Meeting Him", "page": 231, "lines": 16, "italics": 1,
        "sha256": "3fa98c8efaa2ed5c593ad692f945b35b707254f6f12f6ae9b90b4fedb491689c",
        "first": "On the Nothing-B^ond Peak", "last": "Why should I wait for the Man of Wisdom?",
        "corrections": (
            ("Nothing-B^ond", "Nothing-Beyond"), ("moimt", "mount"), ("thirty /(", "thirty li"),
            ("«tting", "sitting"), ("eais hear", "ears hear"),
        ),
        "note": (
            "‘Nothing-Beyond Peak’ and ‘red grass’ are interpretive additions not explicit in the "
            "displayed Chinese; ‘Man of Wisdom’ interprets the absent person."
        ),
    },
    {
        "id": "tang-023", "anchor": "FLOATING_ON_THE_POOL_OF_JO_YA_SPRING",
        "heading": "FLOATING ON THE POOL OF JO YA. SPRING", "author": "BY CHI WU-CH'IEN",
        "title": "Floating on the Pool of Jo Ya. Spring", "page": 232, "lines": 10, "italics": 0,
        "sha256": "93ac438833cab9b4ed9b09c44090707b4ebd351069adbd96017eb5a78920c530",
        "first": "SouTART meditation", "last": "bamboo fishing-rod.",
        "corrections": (
            ("SouTART", "Solitary"), ("iteelf", "itself"), ("enfolds die", "enfolds the"),
            ("Soats", "floats"), ("gendy", "gently"), ("buunesB", "business"), ("^reading", "spreading"),
        ),
        "note": (
            "‘The serrated hills face the Southern Constellation’ differs from the displayed "
            "Chinese’s view of the Southern Dipper across a mountain."
        ),
    },
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verse(source, row):
    start = f'<h2 id="{row["anchor"]}">'
    if source.count(start) != 1:
        raise ValueError(f"Unexpected heading: {row['id']}")
    tail = source[source.index(start) + len(start):]
    section = tail[:tail.index('<hr class="chap">')]
    heading = section[:section.index('</h2>')]
    if " ".join(heading.split()) != row["heading"]:
        raise ValueError(f"Unexpected heading: {row['id']}")
    section = section[section.index('</h2>') + len('</h2>'):].strip()
    author = f'<p class="ph3">{row["author"]}</p>'
    if not section.startswith(author):
        raise ValueError(f"Unexpected author: {row['id']}")
    section = section[len(author):].strip()
    start_block = '<div class="poetry-container"><div class="poetry"><div class="stanza">'
    end_block = '</div></div></div>'
    if not section.startswith(start_block) or not section.endswith(end_block):
        raise ValueError(f"Unexpected poem block: {row['id']}")
    block = section[len(start_block):-len(end_block)]
    pattern = r'<div class="verse">([^<>]*)</div>'
    raw_lines = re.findall(pattern, block)
    if re.sub(pattern, "", block).strip() or len(raw_lines) != row["lines"]:
        raise ValueError(f"Unexpected verse boundaries: {row['id']}")
    text = "\n".join(" ".join(html.unescape(line).split()) for line in raw_lines)
    if text.count("_li_") != row["italics"]:
        raise ValueError(f"Unexpected italic markers: {row['id']}")
    text = text.replace("_li_", "li")
    if "_" in text or digest(text.encode("utf8")) != row["sha256"]:
        raise ValueError(f"Reviewed translation changed: {row['id']}")
    return text


def normalize_words(text):
    return "".join(char for char in unicodedata.normalize("NFKD", text).casefold() if char.isalnum())


def compare_ocr(data, text, row):
    pages = ET.fromstring(data).findall(".//OBJECT")
    if not 1 <= row["page"] <= len(pages):
        raise ValueError(f"Unexpected OCR page: {row['id']}")
    source = "\n".join(
        " ".join("".join(word.itertext()).strip() for word in line.iter("WORD"))
        for line in pages[row["page"] - 1].iter("LINE")
    )
    start, end = row["first"], row["last"]
    if source.count(start) != 1 or source.count(end) != 1 or source.index(end) < source.index(start):
        raise ValueError(f"Unexpected OCR boundaries: {row['id']}")
    source = source[source.index(start):source.index(end) + len(end)]
    for old, new in row["corrections"]:
        if source.count(old) != 1:
            raise ValueError(f"Unexpected OCR correction: {row['id']}")
        source = source.replace(old, new, 1)
    if normalize_words(source) != normalize_words(text):
        raise ValueError(f"OCR comparison differs: {row['id']}")


def records(directory):
    evidence = {name: (directory / name).read_bytes() for name in EVIDENCE}
    for name, expected in EVIDENCE.items():
        if digest(evidence[name]) != expected:
            raise ValueError(f"Reviewed evidence changed: {name}")
    source = evidence["gutenberg-48222.html"].decode("utf8")
    result = {}
    for row in SELECTION:
        text = verse(source, row)
        compare_ocr(evidence["firflower-1921-michigan-ocr.xml"], text, row)
        if row["id"] in result:
            raise ValueError("Duplicate selected poem")
        result[row["id"]] = [{
            "language": "English", "title": row["title"], "text": text,
            "translator": "Florence Ayscough · Chinese translation; Amy Lowell · English version · 1921",
            "source": f'https://www.gutenberg.org/cache/epub/48222/pg48222-images.html#{row["anchor"]}',
            "rights": (
                "This 1921 English version is public domain in the United States; check local law. "
                "Gutenberg credits David Edwards, Christopher Wright and the Online Distributed Proofreading Team. "
                "The Chinese source edition is not established; this historical interpretation is not a claim "
                "of an exact match to the displayed Chinese. " + row["note"]
            ),
        }]
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing reviewed source files")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = (
        "// Generated by scripts/import-fir-flower-translations.py from the reviewed 1921 edition.\n"
        + "export const firFlowerTranslations = "
        + json.dumps(records(args.directory), ensure_ascii=False, indent=2)
        + ";\n"
    )
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Translations differ from the reviewed readings")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

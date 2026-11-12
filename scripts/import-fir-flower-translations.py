#!/usr/bin/env python3
"""Reproduce seven 1921 Ayscough and Lowell translations of existing poems."""

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
    {
        "id": "tang-102", "anchor": "SAYING_GOOD-BYE_TO_A_FRIEND",
        "heading": "SAYING GOOD-BYE TO A FRIEND", "author": "BY LI T'AI-PO",
        "title": "Saying Good-Bye to a Friend", "page": 156, "lines": 9, "italics": 1,
        "sha256": "7d253c3f38424d897643c264a420ad6f8e78dd8397049b7c2a01f1476bf0af42",
        "first": "Clear greoi hills", "last": "U^ao, hsiao.",
        "corrections": (
            ("greoi", "green"), ("Here la", "Here is"), ("'Ilie", "The"), ("thousand It", "thousand li"),
            ("fHend", "friend"), ("H^ao, h^ao", "Hsiao, hsiao"), ("U^ao", "Hsiao"),
        ),
        "note": (
            "‘At a right angle’ and the repeated horse-call are interpretive; the version’s "
            "‘water-plants’ renders 孤蓬, often understood as a lone drifting plant."
        ),
    },
    {
        "id": "tang-175", "anchor": "FENG_HUANG_TAI", "heading": "FÊNG HUANG T'AI",
        "subtitle": "ASCENDING THE TERRACE OF THE SILVER-CRESTED LOVE-PHEASANTS AT THE CITY OF THE GOLDEN MOUND",
        "author": "BY LI T'AI-PO", "page": 127, "lines": 9, "stanzas": (4, 5), "indents": ((1, 4),), "italics": 0,
        "title": "Fêng Huang T’ai · Ascending the Terrace of the Silver-Crested Love-Pheasants at the City of the Golden Mound",
        "sha256": "0f0e50bf088bc8c73581def438373c4d26452ce70138b12ce567ddf4ee5dd0ed",
        "first": "The ^Iver-crested", "last": "Therefore am I sorrowful.",
        "corrections": (("^Iver-crested", "silver-crested"), ("Tarace", "Terrace"),
                        ("generadons", "generations"), ("&llen", "fallen")),
        "note": (
            "‘Silver-crested love-pheasants’ is this version’s interpretation of the mythical 鳳凰; "
            "‘Green Heaven’ differs from the displayed 青山外 (beyond the green mountains)."
        ),
    },
    {
        "id": "tang-268", "anchor": "YELLOW_CRANE_TOWER",
        "heading": "AT THE YELLOW CRANE TOWER, TAKING LEAVE OF MÊNG HAO JAN ON HIS DEPARTURE TO KUANG LING",
        "author": "BY LI T'AI-PO", "page": 199, "lines": 4, "italics": 0,
        "title": "At the Yellow Crane Tower, Taking Leave of Mêng Hao Jan on His Departure to Kuang Ling",
        "sha256": "e0e84c24a3d352bb576806d5afffd6365c7d940b78e5ef63e33f2a4f71e91a64",
        "first": "I TAKE leave", "last": "flowing to the edge of Heaven.",
        "corrections": (("Tlie ungle", "The single"),),
        "note": "‘Flower-smelling mist’ and the ‘jade-coloured distance’ are interpretive renderings.",
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
    if "subtitle" in row:
        opening, closing = '<p class="ph4">', '</p>'
        if not section.startswith(opening) or closing not in section:
            raise ValueError(f"Unexpected subtitle: {row['id']}")
        subtitle = section[len(opening):section.index(closing)]
        if " ".join(subtitle.split()) != row["subtitle"]:
            raise ValueError(f"Unexpected subtitle: {row['id']}")
        section = section[section.index(closing) + len(closing):].strip()
    author = f'<p class="ph3">{row["author"]}</p>'
    if not section.startswith(author):
        raise ValueError(f"Unexpected author: {row['id']}")
    section = section[len(author):].strip()
    start_block = '<div class="poetry-container"><div class="poetry"><div class="stanza">'
    end_block = '</div></div></div>'
    if not section.startswith(start_block) or not section.endswith(end_block):
        raise ValueError(f"Unexpected poem block: {row['id']}")
    block = section[len(start_block):-len(end_block)]
    pattern = r'<div class="(verse(?: indent2)?)">([^<>]*)</div>'
    parts = block.split('</div><div class="stanza">')
    expected_stanzas = row.get("stanzas", (row["lines"],))
    stanzas, indents = [], []
    for stanza_index, part in enumerate(parts):
        matches = re.findall(pattern, part)
        if re.sub(pattern, "", part).strip():
            raise ValueError(f"Unexpected verse boundaries: {row['id']}")
        lines = []
        for line_index, (kind, raw) in enumerate(matches):
            if kind == "verse indent2":
                indents.append((stanza_index, line_index))
            lines.append(("  " if kind == "verse indent2" else "") + " ".join(html.unescape(raw).split()))
        stanzas.append(lines)
    if (tuple(map(len, stanzas)) != expected_stanzas or sum(map(len, stanzas)) != row["lines"]
            or tuple(indents) != row.get("indents", ())):
        raise ValueError(f"Unexpected verse boundaries: {row['id']}")
    text = "\n\n".join("\n".join(lines) for lines in stanzas)
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

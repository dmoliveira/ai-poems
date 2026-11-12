#!/usr/bin/env python3
"""Reproduce three reviewed Arthur Waley translations of existing poems."""

import argparse
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "content/waley-translations.mjs"
EVIDENCE = {
    "gutenberg-42290.html": "98972d3192f9b2eef6a5ab43fd13bcb596d1079999bdc247d6a09d70f2ea5b97",
    "gutenberg-16500.html": "d6468b8fac10269aabae70f1a723123ef9f73895a6b23d3da3d3c50eebbea33c",
    "waley-1918-london.pdf": "27832536f73834c705ed75c5f808843fe4dfee06a4eef41e5526e52d487f76b1",
    "waley-1919-ny.pdf": "6a8c374240798634a1cce090b92c616de7d6450f7c565c72847bb6b9d34a59f7",
}
TAO_START = '<h4 class="title">POEMS BY T’AO CH’IEN</h4>'
TAO_END = '<h3>CHAPTER IV</h3>'
LI_START = '<a id="DRINKING_ALONE_BY_MOONLIGHT"></a>'
LI_END = '<h4>II</h4>'

SELECTION = (
    {
        "id": "tao-yuanming-drinking-ming-05",
        "book": "1918",
        "start": '<h5 class="title">(7)</h5>',
        "end": '<h5 class="title">(8)<br>',
        "lines": 10,
        "sha256": "5d710c65d4837ca0dbd0742dd8d5d4bb48d2bd8ab0824eaef1675bb521ea4829",
        "title": "I built my hut in a zone of human habitation",
        "note": (
            "Waley prints number (7), not a title; the English title here is editorial. "
            "His ‘summer hills’ differs from the displayed Chinese ‘南山’ (southern mountain)."
        ),
    },
    {
        "id": "tao-yuanming-drinking-ming-09",
        "book": "1918",
        "start": '<h5 class="title">(2)</h5>',
        "end": '<h5 class="title">(3)</h5>',
        "lines": 16,
        "sha256": "3a9ef63e0bf2998d7c7eef60262e8c45912563f26ded2b86b69075a896aca619",
        "title": "In the quiet of the morning I heard a knock at my door",
        "note": "Waley prints number (2), not a title; the English title here is editorial.",
    },
    {
        "id": "tang-006",
        "book": "1919",
        "start": "<h4>I</h4>",
        "end": LI_END,
        "lines": 14,
        "sha256": "52a5d7d887987b92a00a9e3b7ae57f4207ab6b011d8a92f583cc0837c48c1eee",
        "title": "Drinking Alone by Moonlight · I",
        "note": (
            "This is the complete first poem in Waley’s three-poem group. "
            "His ‘shadow as slave’ is an interpretive addition not explicit in the displayed Chinese; "
            "his note identifies the Cloudy River as the Milky Way."
        ),
    },
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def between(text, start, end):
    if text.count(start) != 1 or text.count(end) != 1:
        raise ValueError("Unexpected source boundaries")
    first = text.index(start) + len(start)
    last = text.index(end)
    if last < first:
        raise ValueError("Unexpected source boundaries")
    return text[first:last]


class VerseLine(HTMLParser):
    """Drop source footnote links while preserving the words of the verse."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.text = ""
        self.anchor_depth = 0
        self.anchors = []

    def handle_starttag(self, tag, attrs):
        if tag != "a" or self.anchor_depth:
            raise ValueError("Unexpected verse markup")
        attributes = dict(attrs)
        if attributes not in ({"id": "FNanchor_1_4"},
                              {"class": "fnanchor pginternal", "href": "#Footnote_1_4"}):
            raise ValueError("Unexpected verse anchor")
        self.anchors.append(attributes)
        self.anchor_depth += 1

    def handle_endtag(self, tag):
        if tag != "a" or self.anchor_depth != 1:
            raise ValueError("Unexpected verse markup")
        self.anchor_depth -= 1

    def handle_data(self, data):
        if not self.anchor_depth:
            self.text += data


def verse(section, row):
    block_pattern = r'<div class="poem"><div class="stanza">(.*?)</div></div>'
    blocks = re.findall(block_pattern, section, re.DOTALL)
    if len(blocks) != 1:
        raise ValueError(f"Unexpected poem block: {row['id']}")
    remainder = re.sub(block_pattern, "", section, flags=re.DOTALL)
    remainder = re.sub(r'<p><span class="pagenum">.*?</span></p>', "", remainder, flags=re.DOTALL)
    if remainder.strip():
        raise ValueError(f"Unexpected material outside verse: {row['id']}")
    block = re.sub(r'<span class="pagenum">.*?</span>', "", blocks[0], flags=re.DOTALL)
    pattern = r'<span class="i\d+">(.*?)<br></span>'
    lines = []
    anchors = []
    for match in re.finditer(pattern, block, re.DOTALL):
        parser = VerseLine()
        parser.feed(match.group(1))
        parser.close()
        if parser.anchor_depth:
            raise ValueError(f"Unclosed verse markup: {row['id']}")
        lines.append(" ".join(parser.text.split()))
        anchors.extend(parser.anchors)
    expected_anchors = ([{"id": "FNanchor_1_4"}, {"class": "fnanchor pginternal", "href": "#Footnote_1_4"}]
                        if row["id"] == "tang-006" else [])
    if anchors != expected_anchors:
        raise ValueError(f"Unexpected footnote markers: {row['id']}")
    if re.sub(pattern, "", block, flags=re.DOTALL).strip() or len(lines) != row["lines"]:
        raise ValueError(f"Unexpected verse boundaries: {row['id']}")
    text = "\n".join(lines)
    if digest(text.encode("utf8")) != row["sha256"]:
        raise ValueError(f"Reviewed translation changed: {row['id']}")
    return text


def records(directory):
    for name, expected in EVIDENCE.items():
        if digest((directory / name).read_bytes()) != expected:
            raise ValueError(f"Reviewed evidence changed: {name}")
    london = (directory / "gutenberg-42290.html").read_text(encoding="utf8")
    new_york = (directory / "gutenberg-16500.html").read_text(encoding="utf8")
    tao = between(london, TAO_START, TAO_END)
    if new_york.count(LI_START) != 1:
        raise ValueError("Unexpected Li Bai heading")
    li = new_york[new_york.index(LI_START):]
    if li.count(LI_END) != 1 or "<h4>[<i>Three Poems</i>]</h4>" not in li[:li.index(LI_END)]:
        raise ValueError("Unexpected Li Bai group boundaries")
    result = {}
    for row in SELECTION:
        source = tao if row["book"] == "1918" else li
        text = verse(between(source, row["start"], row["end"]), row)
        if row["book"] == "1918":
            translator = "Arthur Waley · London 1918"
            url = "https://www.gutenberg.org/ebooks/42290"
            attribution = "Gutenberg credits Henry Flower and the Online Distributed Proofreading Team."
        else:
            translator = "Arthur Waley · New York 1919"
            url = "https://www.gutenberg.org/ebooks/16500"
            attribution = "Gutenberg credits David Starner, Jonathan Niehof and the Online Distributed Proofreading Team."
        rights = (
            f"This {row['book']} English translation is public domain in the United States; check local law. "
            f"{attribution} The translator’s Chinese source edition is not established here; this is an "
            f"interpretive rendering, not a claim of an exact match to the displayed original. {row['note']}"
        )
        if row["id"] in result:
            raise ValueError("Duplicate selected poem")
        result[row["id"]] = [{
            "language": "English", "title": row["title"], "text": text,
            "translator": translator, "source": url, "rights": rights,
        }]
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the reviewed source files")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = (
        "// Generated by scripts/import-waley-translations.py from reviewed historical editions.\n"
        + "export const waleyTranslations = "
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

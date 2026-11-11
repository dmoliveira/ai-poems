#!/usr/bin/env python3
"""Reproduce reviewed Christina Rossetti poems from Gutenberg's 1906 text."""

import argparse
import hashlib
import json
import re
import unicodedata
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/rossetti-1906.json"
OUTPUT = ROOT / "content/poems/rossetti-1906.json"
MANIFEST_SHA256 = "0c98f4598629843bbccd24b7b7516346b8fa3a7487e8497b0450d3d696b40a2c"
EVIDENCE = {
    "gutenberg-19188.html": "90ee7895bca510598633ccc128e867ca2348fce173293eabfae618ced635dae7",
    "rossetti-1888-boston.pdf": "de07c9925c5f4ac2f2a6e5ea32a84a9c321dc2b7d5834af27f6f26ad9ad523ec",
    "rossetti-1888-boston-ocr.xml": "8a7f13a425d22a13cf90ec859e4a98522b360a3bbd4dc5f1e1a0f1552a4f3b5a",
}
SELECTED = (
    "dream-land", "at-home", "from-sunset", "love-from-the-north", "winter-rain", "a-dirge", "spring",
    "lambs-of-grasmere", "a-birthday", "remember", "after-death", "an-end", "song-roses", "a-summer-wish",
    "an-apple-gathering", "song-doves", "maude-clare", "echo", "winter-my-secret", "another-spring",
    "fata-morgana", "no-thank-you-john", "may", "song-when-i-am-dead", "up-hill",
)
GUTENBERG = "https://www.gutenberg.org/ebooks/19188"
SCAN = "https://archive.org/details/poems00ross5"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def normalized(value):
    return "".join(char for char in unicodedata.normalize("NFKC", value).casefold() if char.isalnum())


class Source(HTMLParser):
    """Capture headings and preformatted blocks without printed page labels."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.elements = []
        self.current = None
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if self.current is None and tag in {"h3", "h4", "h5", "p", "pre"}:
            self.current = {"tag": tag, "text": "", "href": "", "inner": []}
            return
        if self.current is None:
            return
        if self.hidden:
            self.hidden += 1
        elif self.current["tag"] == "pre" and tag == "span" and "pagenum" in attrs.get("class", "").split():
            self.hidden = 1
        else:
            self.current["inner"].append(tag)
            if self.current["tag"] == "h4" and tag == "a":
                if self.current["href"]:
                    raise ValueError("Multiple source heading links")
                self.current["href"] = attrs.get("href", "")

    def handle_endtag(self, tag):
        if self.current is None:
            return
        if self.hidden:
            self.hidden -= 1
        elif tag == self.current["tag"]:
            self.elements.append(self.current)
            self.current = None

    def handle_data(self, data):
        if self.current is not None and not self.hidden:
            self.current["text"] += data
        elif self.current is None and data.strip():
            self.elements.append({"tag": "outside", "text": data, "href": "", "inner": []})


def extract(elements, row):
    starts = [i for i, item in enumerate(elements) if item["tag"] == "h4" and item["href"] == row["heading"]]
    ends = [i for i, item in enumerate(elements) if item["tag"] == "h4" and item["href"] == row["nextHeading"]]
    if len(starts) != 1 or len(ends) != 1 or starts[0] >= ends[0]:
        raise ValueError(f"Unexpected source boundaries: {row['slug']}")
    if " ".join(elements[starts[0]]["text"].split()) != row["sourceHeading"]:
        raise ValueError(f"Unexpected source heading: {row['slug']}")
    selected = elements[starts[0] + 1:ends[0]]
    if any(item["tag"] not in {"pre", "h3", "h5"} for item in selected):
        raise ValueError(f"Unexpected source element: {row['slug']}")
    labels = [" ".join(item["text"].split()) for item in selected if item["tag"] in {"h3", "h5"}]
    if labels != row.get("labels", []):
        raise ValueError(f"Unexpected source labels: {row['slug']}")
    blocks = []
    for item in selected:
        if item["tag"] != "pre" or not item["text"].strip():
            continue
        if set(item["inner"]) - {"a", "span", "i", "em", "b", "strong"}:
            raise ValueError(f"Unexpected verse markup: {row['slug']}")
        lines = [" ".join(line.split()) for line in item["text"].splitlines()]
        block = "\n".join(lines).strip()
        blocks.append(re.sub(r"\n{3,}", "\n\n", block))
    joins = row.get("joins", [])
    if not blocks or len(joins) != len(blocks) - 1 or any(join not in {"line", "stanza"} for join in joins):
        raise ValueError(f"Unexpected source block boundaries: {row['slug']}")
    text = blocks[0]
    for join, block in zip(joins, blocks[1:], strict=True):
        text += ("\n" if join == "line" else "\n\n") + block
    stanzas = [len(stanza.splitlines()) for stanza in text.split("\n\n")]
    if stanzas != row["stanzas"]:
        raise ValueError(f"Unexpected stanza boundaries: {row['slug']}")
    if digest(text.encode("utf8")) != row["textSha256"]:
        raise ValueError(f"Reviewed reading changed: {row['slug']}")
    return text


def compare_ocr(objects, row, reading):
    """Require an ordered complete match after explicitly reviewed OCR noise."""
    start_page, start_line = row["ocrStart"]
    end_page, end_line = row["ocrEnd"]
    if not 1 <= start_page <= end_page <= len(objects) or end_page - start_page > 3:
        raise ValueError(f"Invalid scan page range: {row['slug']}")
    verse = [normalized(line) for line in reading.splitlines() if line.strip()]
    position = 0
    noise = []
    corrections = dict(row.get("ocrCorrections", []))
    if len(corrections) != len(row.get("ocrCorrections", [])):
        raise ValueError(f"Duplicate OCR correction: {row['slug']}")
    differences = dict(row.get("comparisonDifferences", []))
    if len(differences) != len(row.get("comparisonDifferences", [])):
        raise ValueError(f"Duplicate comparison difference: {row['slug']}")
    used_corrections = []
    used_differences = []
    for page in range(start_page, end_page + 1):
        lines = [
            " ".join(word.text or "" for word in line.findall(".//WORD"))
            for line in objects[page - 1].findall(".//LINE")
        ]
        first = start_line if page == start_page else 0
        last = end_line + 1 if page == end_page else len(lines)
        if not 0 <= first < last <= len(lines):
            raise ValueError(f"Invalid scan line range: {row['slug']}")
        for raw in lines[first:last]:
            line = corrections.get(raw, raw)
            if raw in corrections:
                used_corrections.append(raw)
            if line in differences:
                used_differences.append(line)
                line = differences[line]
            value = normalized(line)
            if value and position < len(verse) and value == verse[position]:
                position += 1
            elif value:
                noise.append(raw)
    if (
        position != len(verse)
        or noise != row.get("ocrNoise", [])
        or sorted(used_corrections) != sorted(corrections)
        or sorted(used_differences) != sorted(differences)
    ):
        raise ValueError(f"Unexpected OCR text or noise: {row['slug']}")


def records(directory):
    files = {}
    for name, expected in EVIDENCE.items():
        data = (directory / name).read_bytes()
        if digest(data) != expected:
            raise ValueError(f"Reviewed evidence changed: {name}")
        files[name] = data
    raw_manifest = MANIFEST.read_bytes()
    if digest(raw_manifest) != MANIFEST_SHA256:
        raise ValueError("Reviewed manifest changed")
    selection = json.loads(raw_manifest)["poems"]
    if tuple(row["slug"] for row in selection) != SELECTED:
        raise ValueError("Unexpected selection or order")
    parser = Source()
    parser.feed(files["gutenberg-19188.html"].decode("utf8"))
    parser.close()
    if parser.current is not None or parser.hidden:
        raise ValueError("Unclosed source element")
    objects = ET.fromstring(files["rossetti-1888-boston-ocr.xml"]).findall(".//OBJECT")
    result = []
    for row in selection:
        text = extract(parser.elements, row)
        compare_ocr(objects, row, text)
        first, last = row["pages"]
        page_label = f"p. {first}" if first == last else f"pp. {first}–{last}"
        context = (
            f"A complete, separately titled poem in the 1906 Boston edition of Poems, {page_label}. "
            "The Gutenberg text identifies it as the author's revised and enlarged edition; the "
            "linked 1888 Roberts Brothers printing names the same author edition but is not "
            "established as the same copy or impression. The verse was compared in order with "
            "punctuation-insensitive OCR of that scan; headings, work boundaries, page turns "
            "and OCR artifacts were checked visually. This is not exhaustive punctuation "
            "collation or a diplomatic transcription; indentation is omitted. Earlier or later "
            "printings may have different readings. England is associated with Rossetti, not "
            "asserted as this poem's place of composition; the exact composition year is unknown."
        )
        if row.get("note"):
            context += " " + row["note"]
        result.append({
            "id": f"rossetti-1906-{row['slug']}", "title": row["title"],
            "author": "Christina Rossetti", "authorId": "christina-rossetti", "authorYears": "1830–1894",
            "country": "England", "language": "English", "lang": "en", "direction": "ltr",
            "year": None, "yearLabel": "1906 printing · composition year not established", "era": "Victorian",
            "form": row.get("form", "Poem"), "collection": "Poems · 1906 author edition",
            "themes": [], "mood": "paper", "context": context,
            "contextSource": f"{SCAN}/page/n{row['ocrStart'][0] - 1}/mode/1up",
            "contextSourceTitle": f"Library of Congress / Internet Archive · Poems, 1888, {page_label}",
            "sourceTitle": "Project Gutenberg · Poems (eBook 19188)", "source": GUTENBERG,
            "rights": (
                "The historical poems and pre-1931 editions are public domain in the United States; "
                "check local law. Project Gutenberg credits Steven desJardins, Jeffrey Johnson and "
                "the Online Distributed Proofreading Team for the eBook and marks it public domain "
                "in the USA. The scan is linked, not republished. No translation is supplied."
            ),
            "text": text, "translations": [],
        })
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the pinned Gutenberg and scan evidence")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Records differ from the reviewed source")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

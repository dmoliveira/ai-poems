#!/usr/bin/env python3
"""Reproduce selected complete poems from Gutenberg's Love Songs text."""

import argparse
import hashlib
import json
import unicodedata
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/teasdale-love-songs.json"
OUTPUT = ROOT / "content/poems/teasdale-love-songs.json"
MANIFEST_SHA256 = "1cfefd190bf9f3a2363a6ebde45c1438d3a8f241f5df7b005472df1887393171"
EVIDENCE = {
    "gutenberg-442.html": "bbd81acf28e5080abc51c43c33b5ee77077ed5b5ba7e7c00cab150bb73dda6b9",
    "teasdale-michigan.pdf": "0591849508a8601e3bc1463ba0cfdb18fefc9689dcbcebd648a74ff81531b436",
    "teasdale-michigan-ocr.xml": "a5273468887f0b5a6956c6a861c8658cefae64a41fc36981953c567eef10b56c",
}
SELECTED = (
    "barter", "twilight", "night-song-at-amalfi", "the-look", "a-winter-night", "but-not-to-me",
    "song-at-capri", "love-me", "pierrot", "wild-asters", "the-song-for-colin", "debt", "faults",
    "the-fountain", "i-shall-not-care", "after-parting", "a-prayer", "spring-night", "after-love",
    "new-love-and-old", "the-kiss", "swans", "the-river", "spring-rain", "jewels",
)
GUTENBERG = "https://www.gutenberg.org/ebooks/442"
SCAN = "https://archive.org/details/lovesongs01teasgoog"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def normalized(value):
    return "".join(char for char in unicodedata.normalize("NFKD", value).casefold() if char.isalnum())


class Paragraphs(HTMLParser):
    """Keep Gutenberg's explicit verse breaks, not HTML source wrapping."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.elements = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag in {"p", "h1", "h2", "h3", "h4", "h5", "h6"}:
            if self.current is not None:
                raise ValueError("Unexpected nested source element")
            self.current = {"tag": tag, "id": attributes.get("id", ""), "parts": [""], "breaks": 0}
        elif tag == "br" and self.current is not None:
            self.current["parts"].append("")
            self.current["breaks"] += 1

    def handle_data(self, data):
        if self.current is not None:
            self.current["parts"][-1] += data

    def handle_endtag(self, tag):
        if self.current is not None and tag == self.current["tag"]:
            self.elements.append(self.current)
            self.current = None


def extract(document, row):
    parser = Paragraphs()
    parser.feed(document)
    parser.close()
    if parser.current is not None:
        raise ValueError("Unclosed source element")
    elements = parser.elements
    starts = [i for i, element in enumerate(elements) if element["id"] == row["heading"]]
    ends = [i for i, element in enumerate(elements) if element["id"] == row["nextHeading"]]
    if len(starts) != 1 or len(ends) != 1 or starts[0] >= ends[0]:
        raise ValueError(f"Unexpected source boundaries: {row['slug']}")
    heading = elements[starts[0]]
    if heading["tag"] != "p" or " ".join(heading["parts"][0].split()) != row["title"]:
        raise ValueError(f"Unexpected source heading: {row['slug']}")
    stanzas = []
    for element in elements[starts[0] + 1:ends[0]]:
        if element["tag"] != "p" or not element["breaks"]:
            raise ValueError(f"Unexpected non-verse source element: {row['slug']}")
        if element["parts"][-1].strip() or any(not part.strip() for part in element["parts"][:-1]):
            raise ValueError(f"Unexpected empty or unterminated verse line: {row['slug']}")
        lines = [" ".join(part.split()) for part in element["parts"][:-1]]
        stanzas.append(lines)
    if [len(lines) for lines in stanzas] != row["stanzas"]:
        raise ValueError(f"Unexpected stanza boundaries: {row['slug']}")
    text = "\n\n".join("\n".join(lines) for lines in stanzas)
    if digest(text.encode("utf8")) != row["textSha256"]:
        raise ValueError(f"Reviewed reading changed: {row['slug']}")
    return text


def compare_ocr(objects, row, reading):
    """Compare all OCR text in the named print pages, excluding pinned noise."""
    first, last = row["pages"]
    if not 3 <= first <= last <= 43 or last - first > 1 or last + 19 > len(objects):
        raise ValueError(f"Invalid scan page range: {row['slug']}")
    remaining = normalized(reading)
    noise = []
    corrections = dict(row.get("ocrCorrections", []))
    used_corrections = []
    for printed in range(first, last + 1):
        lines = [
            " ".join(word.text or "" for word in line.findall(".//WORD"))
            for line in objects[printed + 18].findall(".//LINE")
        ]
        heading = row.get("ocrHeading", row["title"]) if printed == first else row.get("continuationHeading", "")
        found = [i for i, line in enumerate(lines) if heading and normalized(line) == normalized(heading)]
        if not found:
            raise ValueError(f"Missing OCR heading: {row['slug']}")
        if printed == first:
            prefix = [line for line in lines[:found[0]] if normalized(line)]
            if prefix != row.get("ocrPrefixNoise", []):
                raise ValueError(f"Unexpected OCR before heading: {row['slug']}")
        else:
            noise.extend(line for line in lines[:found[0]] if normalized(line))
        for raw in lines[found[0] + 1:]:
            line = corrections.get(raw, raw)
            if raw in corrections:
                used_corrections.append(raw)
            value = normalized(line)
            if value and remaining.startswith(value):
                remaining = remaining[len(value):]
            elif value:
                noise.append(raw)
    if remaining or noise != row["ocrNoise"] or sorted(used_corrections) != sorted(corrections):
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
    document = files["gutenberg-442.html"].decode("utf8")
    objects = ET.fromstring(files["teasdale-michigan-ocr.xml"]).findall(".//OBJECT")
    result = []
    for row in selection:
        text = extract(document, row)
        compare_ocr(objects, row, text)
        first, last = row["pages"]
        page_label = f"p. {first}" if first == last else f"pp. {first}–{last}"
        context = (
            f"A complete, separately titled poem in Love Songs, printed {page_label}. "
            "The Gutenberg text identifies its source as a 1918 reprint of the 1917 edition; "
            "the linked Michigan scan has a 1918 title page, but is not established as the "
            "same copy. The text was compared in order with punctuation-insensitive OCR of "
            "that scan; headings, work boundaries, page turns and OCR artifacts were checked visually. "
            "This is not exhaustive punctuation collation or a diplomatic transcription; "
            "indentation is omitted and printed line wraps are rejoined. The collection includes "
            "poems from earlier books, which may have different readings. The United States is "
            "associated with Teasdale, not asserted as this poem's place of composition; the "
            "exact composition year is not established."
        )
        result.append({
            "id": f"teasdale-love-songs-{row['slug']}",
            "title": row["title"],
            "author": "Sara Teasdale",
            "authorId": "sara-teasdale",
            "authorYears": "1884–1933",
            "country": "United States",
            "language": "English",
            "lang": "en",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Printed in 1918 reprint · exact composition year unknown",
            "era": "Early twentieth century",
            "form": "Poem",
            "collection": "Love Songs · 1918 reprint",
            "themes": [],
            "mood": "paper",
            "context": context,
            "contextSource": f"{SCAN}/page/n{first + 18}/mode/1up",
            "contextSourceTitle": f"University of Michigan / Internet Archive · Love Songs, 1918, {page_label}",
            "sourceTitle": "Project Gutenberg · Love Songs (eBook 442)",
            "source": GUTENBERG,
            "rights": (
                "The historical poems and pre-1931 printing are public domain in the United States; "
                "check local law. Project Gutenberg credits A. Light and L. Bowser for the eText and "
                "marks it public domain in the USA. The scan is linked, not republished. No translation is supplied."
            ),
            "text": text,
            "translations": [],
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

#!/usr/bin/env python3
"""Reproduce selected Keats poems from Gutenberg's scan-backed 1909 edition."""

import argparse
import hashlib
import io
import json
import re
import zipfile
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/keats-1909.json"
OUTPUT = ROOT / "content/poems/keats-1909.json"
ARCHIVE = "pg23684-h.zip"
ARCHIVE_SHA256 = "4a5c04ccf6a3e6b0e74a3ed86fa3f53ab524a45bbac5c35d6918c994d865004f"
HTML_NAME = "23684-h/23684-h.htm"
SELECTED = ("nightingale", "urn", "psyche", "fancy", "bards", "mermaid", "robin", "autumn", "melancholy")
GUTENBERG = "https://www.gutenberg.org/ebooks/23684"
IMAGE = "https://www.gutenberg.org/files/23684/23684-h/images/"


def digest(data):
    return hashlib.sha256(data).hexdigest()


class VerseParser(HTMLParser):
    """Collect verse spans and stanzas, not page numbers or editor's line numbers."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.divs = []
        self.spans = []
        self.stanzas = []
        self.numbers = []
        self.current = ""
        self.poem_count = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "div":
            kind = attrs.get("class", "")
            self.divs.append(kind)
            if kind == "poem":
                self.poem_count += 1
            elif kind == "stanza" and "poem" in self.divs:
                self.stanzas.append([])
        elif tag == "span":
            self.spans.append(attrs.get("class", ""))
        elif tag == "br" and any(re.fullmatch(r"i\d+", item) for item in self.spans):
            line = self.current.strip()
            self.current = ""
            if not line or not self.stanzas:
                raise ValueError("Unexpected empty verse line")
            if re.fullmatch(r"\d+\.", line):
                self.numbers.append(int(line[:-1]))
            else:
                self.stanzas[-1].append(line)

    def handle_endtag(self, tag):
        if tag == "div":
            if not self.divs:
                raise ValueError("Unexpected closing div")
            self.divs.pop()
        elif tag == "span":
            if not self.spans:
                raise ValueError("Unexpected closing span")
            self.spans.pop()

    def handle_data(self, data):
        if any(re.fullmatch(r"i\d+", item) for item in self.spans) and "linenum" not in self.spans:
            if "poem" not in self.divs or "stanza" not in self.divs:
                raise ValueError("Verse outside a poem stanza")
            self.current += data


def extract(html, item):
    first, last = item["pages"]
    if not 1 <= first <= last < 500:
        raise ValueError(f"Invalid page range: {item['slug']}")
    start_marker = f'id="Page_{first}"'
    end_marker = f'id="Page_{last + 1}"'
    if html.count(start_marker) != 1 or html.count(end_marker) != 1:
        raise ValueError(f"Ambiguous page boundaries: {item['slug']}")
    start = html.rfind("<span", 0, html.index(start_marker))
    end = html.rfind("<span", 0, html.index(end_marker))
    if start < 0 or end <= start:
        raise ValueError(f"Invalid page boundaries: {item['slug']}")
    segment = html[start:end]
    if any(segment.count(heading) != 1 for heading in item["headings"]):
        raise ValueError(f"Unexpected poem heading: {item['slug']}")
    parser = VerseParser()
    parser.feed(segment)
    parser.close()
    if parser.poem_count != 1 or parser.divs or parser.spans or parser.current:
        raise ValueError(f"Unexpected poem markup: {item['slug']}")
    stanzas = [stanza for stanza in parser.stanzas if stanza]
    if [len(stanza) for stanza in stanzas] != item["stanzas"] or parser.numbers != item["numbers"]:
        raise ValueError(f"Unexpected stanza boundaries: {item['slug']}")
    text = "\n\n".join("\n".join(stanza) for stanza in stanzas)
    lines = text.splitlines()
    if not lines or lines[0] != item["first"] or lines[-1] != item["last"]:
        raise ValueError(f"Unexpected first or last line: {item['slug']}")
    if digest(text.encode("utf8")) != item["textSha256"]:
        raise ValueError(f"Reviewed reading changed: {item['slug']}")
    return text


def records(directory):
    archive = (directory / ARCHIVE).read_bytes()
    if digest(archive) != ARCHIVE_SHA256:
        raise ValueError("Reviewed Gutenberg archive changed")
    items = json.loads(MANIFEST.read_text(encoding="utf8"))["poems"]
    if tuple(item["slug"] for item in items) != SELECTED:
        raise ValueError("Unexpected reviewed selection")
    for item in items:
        first, last = item["pages"]
        if not 1 <= first <= last < 500:
            raise ValueError(f"Invalid page range: {item['slug']}")
    with zipfile.ZipFile(io.BytesIO(archive)) as source:
        names = source.namelist()
        required = [HTML_NAME, *(f"23684-h/images/{page}.png" for item in items for page in range(item["pages"][0], item["pages"][1] + 1))]
        if any(names.count(name) != 1 for name in required):
            raise ValueError("Missing or repeated reviewed archive member")
        html = source.read(HTML_NAME).decode("utf8")
    output = []
    for item in items:
        first, last = item["pages"]
        pages = str(first) if first == last else f"{first}–{last}"
        context = (
            f"A complete poem as printed in M. Robertson's 1909 Keats: Poems Published "
            f"in 1820, pp. {pages}. The Gutenberg HTML reading was compared, in verse "
            "order, with punctuation-insensitive OCR of the linked page images; OCR "
            "mismatches, headings, boundaries and page turns were checked visually. "
            "Punctuation has not been independently collated character by character. "
            "Indentation, typographic detail, printed stanza numbers and the editor's "
            "line numbers are omitted; "
            "wrapped verse lines are rejoined. This is not a diplomatic transcription. "
            "Robertson says this edition reprints an 1820 British Museum copy, adding "
            "line numbers and correcting a few misprints; the 1820 copy was not "
            "independently checked here. England is associated with Keats, not asserted "
            "as the place of composition; the exact composition year is not established."
        )
        if item["slug"] == "bards":
            context += " The edition titles this work ‘Ode’; the opening words disambiguate the title here."
        elif item["slug"] == "robin":
            context += " The print subtitles this poem ‘To a Friend’."
        output.append({
            "id": f"keats-1909-{item['slug']}",
            "title": item["title"],
            "author": "John Keats",
            "authorId": "john-keats",
            "authorYears": "1795–1821",
            "country": "England",
            "language": "English",
            "lang": "en",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Printed in 1909 edition · composition year not established",
            "era": "Romanticism",
            "form": "Poem",
            "collection": "Poems Published in 1820 · 1909 edition",
            "themes": [],
            "mood": "paper",
            "context": context,
            "contextSource": f"{IMAGE}{first}.png",
            "contextSourceTitle": f"Project Gutenberg · 1909 scan, p. {first}",
            "sourceTitle": "Project Gutenberg · Keats: Poems Published in 1820 (eBook 23684)",
            "source": GUTENBERG,
            "rights": (
                "The historical poems and 1909 edition are public domain in the United "
                "States; check local law. Gutenberg credits Jonathan Ingram, Lisa Reigel "
                "and the Project Gutenberg Online Distributed Proofreading Team. "
                "The scanned pages are linked, not republished."
            ),
            "text": extract(html, item),
            "translations": [],
        })
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the reviewed Gutenberg archive")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Records differ from the reviewed edition")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

#!/usr/bin/env -S uv run --no-project --with beautifulsoup4 python
"""Reproduce the reviewed Hugo selection from locally saved source pages.

Run with a directory containing `hugo-1858.html` and each `BOOK-NUMBER.html`
listed in scripts/sources/hugo-1911.json. Use --check to compare, not write.
The manifest pins the extracted 1911 texts and Wikisource article revisions;
transcluded scan pages may change independently, so any text drift fails.
"""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/hugo-1911.json"
OUTPUT = ROOT / "content/poems/hugo-contemplations.json"
GUTENBERG_SHA256 = "69159440dc617b373d21063e7073e540676a1e0e1115309d2c68ae063d6ee344"


def roman(number):
    result = ""
    for value, letter in [(10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]:
        while number >= value:
            result += letter
            number -= value
    return result


def hidden(node, parent):
    for ancestor in node.parents:
        if ancestor is parent:
            break
        if isinstance(ancestor, Tag):
            classes = set(ancestor.get("class", []))
            if classes & {"pagenum", "reference", "noprint"}:
                return True
            if "visibility:hidden" in ancestor.get("style", "").replace(" ", ""):
                return True
    return False


def verse_text(soup):
    main = soup.select_one("#mw-content-text .prp-pages-output")
    if main is None:
        raise ValueError("Wikisource page has no transcluded content")
    blocks = []
    for block in main.select("div.poem"):
        if block.select_one("div.poem, table, ul, ol, blockquote, h1, h2, h3, h4, h5, pre"):
            raise ValueError("Unexpected nested structure in verse")
        paragraphs = []
        for paragraph in block.find_all("p"):
            parts = []
            for item in paragraph.descendants:
                if hidden(item, paragraph):
                    continue
                if isinstance(item, Tag) and item.name == "br":
                    parts.append("\n")
                elif isinstance(item, NavigableString):
                    parts.append(re.sub(r"\s+", " ", str(item).replace("\ufeff", "")))
            text = "".join(parts)
            paragraphs.append("\n".join(line.strip() for line in text.split("\n")))
        if not paragraphs:
            raise ValueError("Verse block without a paragraph")
        blocks.append("\n".join(paragraphs).strip(" "))
    if not blocks:
        raise ValueError("No verse blocks found")
    # Scan-page breaks do not themselves start stanzas; explicit <br>s do.
    return re.sub(r"\n{3,}", "\n\n", "\n".join(blocks).strip())


def comparison_lines(soup, book, number):
    anchor = soup.find("a", id="abc"[book - 1] + roman(number))
    if anchor is None:
        raise ValueError(f"Missing 1858 anchor for {book}.{number}")
    lines = []
    for node in anchor.parent.next_siblings:
        if not isinstance(node, Tag):
            continue
        if node.find("a", id=re.compile(r"^[abc][IVX]+$")):
            break
        if node.name == "div" and "poem" in node.get("class", []):
            for paragraph in node.find_all("p"):
                value = re.sub(r"\s+", " ", paragraph.get_text(" ", strip=True)).strip()
                if value:
                    lines.append(value)
    # The separate edition colophon is not part of the verse panel.
    if lines and re.search(r"\b18(?:\d\d|\.\.)", lines[-1]):
        lines.pop()
    return lines


def comparable(line):
    value = line.lower().replace("œ", "oe").replace("æ", "ae")
    value = unicodedata.normalize("NFKD", value)
    return "".join(char for char in value if char.isalnum() and not unicodedata.combining(char))


def build_records(directory):
    original = (directory / "hugo-1858.html").read_bytes()
    if hashlib.sha256(original).hexdigest() != GUTENBERG_SHA256:
        raise ValueError("The Gutenberg comparison source changed; review it before importing")
    comparison = BeautifulSoup(original, "html.parser")
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    if len(manifest) != 55 or len({(item["book"], item["number"]) for item in manifest}) != 55:
        raise ValueError("Unexpected reviewed selection")
    records = []
    for item in manifest:
        book, number = item["book"], item["number"]
        soup = BeautifulSoup((directory / f"{book}-{number:02}.html").read_bytes(), "html.parser")
        permalink = soup.select_one("#t-permalink a")
        year = soup.select_one(".ws-year")
        quality = soup.select_one("table.pr_quality")
        if not permalink or "https://fr.wikisource.org" + permalink.get("href", "") != item["source"]:
            raise ValueError(f"Wikisource article revision changed: {book}.{number}")
        if not year or year.get_text(strip=True) != "1911" or not quality or not re.search(
            r"0 pages? corrigées? et 0 pages? non corrigées?", quality.get("title", "")
        ):
            raise ValueError(f"Edition or proofreading status changed: {book}.{number}")
        text = verse_text(soup)
        lines = [line for line in text.split("\n") if line]
        if len(lines) != item["lines"] or hashlib.sha256(text.encode()).hexdigest() != item["sha256"]:
            raise ValueError(f"Wikisource text changed: {book}.{number}")
        if list(map(comparable, lines)) != list(map(comparable, comparison_lines(comparison, book, number))):
            raise ValueError(f"1858 comparison no longer matches: {book}.{number}")
        untitled = item["title"].startswith("«")
        title = lines[0] if untitled else item["title"]
        note = " Its title here is the opening line; the edition numbers the poem without a title." if untitled else ""
        if (book, number) == (3, 21):
            note += " The edition dedicates the poem to Mademoiselle Louise B."
        records.append({
            "id": f"hugo-contemplations-{book}-{number:02}",
            "title": title,
            "author": "Victor Hugo",
            "authorId": "victor-hugo",
            "authorYears": "1802–1885",
            "country": "France",
            "language": "French",
            "lang": "fr",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Composition date not established",
            "era": "Romanticism",
            "form": "Verse",
            "collection": "Les Contemplations",
            "themes": [],
            "mood": "paper",
            "context": (
                f"Book {roman(book)}, poem {number} of Les Contemplations, first published in 1856. "
                "The verse follows Wikisource's proofread Nelson edition of 1911; "
                "the 1858 edition is linked for comparison. Printed colophons and notes are not included below. "
                "Dates and composition places are not independently established here." + note
            ),
            "contextSource": f"https://www.gutenberg.org/cache/epub/29843/pg29843-images.html#{'abc'[book - 1]}{roman(number)}",
            "contextSourceTitle": "Project Gutenberg · 1858 edition for comparison",
            "sourceTitle": f"Wikisource · Les Contemplations, Nelson 1911, book {roman(book)}, no. {number}",
            "source": item["source"],
            "rights": (
                "Historical original and 1911 edition are public domain in the United States. "
                "Transcription by Wikisource contributors under CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/; "
                "See the linked article and scan-page histories for contributors; check local law."
            ),
            "text": text,
            "translations": [],
        })
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing reviewed local source HTML files")
    parser.add_argument("--check", action="store_true", help="compare with committed records without writing")
    args = parser.parse_args()
    rendered = json.dumps(build_records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Committed records differ from reviewed source extraction")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

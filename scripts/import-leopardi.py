#!/usr/bin/env -S uv run --no-project --with beautifulsoup4 python
"""Reproduce the reviewed Leopardi selection from locally saved editions.

The source directory contains hoepli-1920.html and donati-NN.html and
starita-NN.html for each numbered selection, as described in the sources
guide. Article revisions do not freeze transcluded scan pages; the manifest
therefore also pins the extracted text and comparison results.
"""

import argparse
import difflib
import hashlib
import json
import re
import unicodedata
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/leopardi-1917.json"
OUTPUT = ROOT / "content/poems/leopardi-canti.json"
GUTENBERG_SHA256 = "e4a729031751e69a6816fc80249ea07556bb1fca7143354e9a4bcb5070c81177"


def digest(text):
    return hashlib.sha256(text.encode("utf8")).hexdigest()


def roman(number):
    result = ""
    for value, letter in [(10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]:
        while number >= value:
            result += letter
            number -= value
    return result


def hidden(item, paragraph):
    for ancestor in item.parents:
        if ancestor is paragraph:
            return False
        if isinstance(ancestor, Tag) and (
            ancestor.name in {"style", "script", "sup"}
            or set(ancestor.get("class", []))
            & {"numeroriga", "numeropagina", "pagenum", "reference", "noprint", "ws-noexport"}
            or "visibility:hidden" in ancestor.get("style", "").replace(" ", "")
        ):
            return True
    return False


def verse_text(soup, verify_markers=True):
    root = soup.select_one("#mw-content-text .prp-pages-output")
    if root is None:
        raise ValueError("Wikisource page has no transcluded content")
    blocks = root.select("div.poem")
    if not blocks:
        raise ValueError("No verse blocks found")
    result = ""
    completed = 0
    for block in blocks:
        if block.select_one("div.poem, table, ul, ol, blockquote, h1, h2, h3, h4, h5, pre"):
            raise ValueError("Unexpected nested structure in verse")
        paragraphs = []
        for paragraph in block.find_all("p"):
            pieces = []
            current = ""
            for item in paragraph.descendants:
                if verify_markers and isinstance(item, Tag) and "numeroriga" in item.get("class", []):
                    marker = item.get_text(strip=True)
                    if not marker.isdigit() or int(marker) != completed + 1:
                        raise ValueError(f"Line marker {marker!r} disagrees with extracted line {completed + 1}")
                if hidden(item, paragraph):
                    continue
                if isinstance(item, Tag) and item.name == "br":
                    pieces.append("\n")
                    if current.strip():
                        completed += 1
                    current = ""
                elif isinstance(item, NavigableString):
                    value = re.sub(r"\s+", " ", str(item).replace("\ufeff", ""))
                    pieces.append(value)
                    current += value
            if current.strip():
                completed += 1
            paragraphs.append("\n".join(line.strip() for line in "".join(pieces).split("\n")))
        if not paragraphs:
            raise ValueError("Verse block without a paragraph")
        if result and not result.endswith("\n"):
            result += "\n"
        result += "\n".join(paragraphs)
    result = re.sub(r"\n{3,}", "\n\n", result).strip()
    if len([line for line in result.split("\n") if line]) != completed:
        raise ValueError("Inconsistent verse extraction")
    return result


def comparable(value):
    value = value.lower().replace("œ", "oe").replace("æ", "ae")
    value = unicodedata.normalize("NFKD", value)
    return "".join(char for char in value if char.isalnum() and not unicodedata.combining(char))


def gutenberg_lines(soup, number, first):
    anchor = soup.find("a", id=roman(number))
    if anchor is None:
        raise ValueError(f"Missing 1920 anchor for {number}")
    anchors = {roman(n) for n in range(1, 42)}
    lines, current = [], ""
    for item in anchor.next_elements:
        if isinstance(item, Tag) and item.name == "a" and item.get("id") in anchors:
            break
        if any(
            isinstance(parent, Tag)
            and (parent.name in {"style", "script", "sup"} or set(parent.get("class", [])) & {"title", "fnanchor"})
            for parent in item.parents if parent is not soup
        ):
            continue
        if isinstance(item, Tag) and item.name == "br":
            if current.strip():
                lines.append(re.sub(r"\s+", " ", current).strip())
            current = ""
        elif isinstance(item, NavigableString):
            current += str(item)
    if current.strip():
        lines.append(re.sub(r"\s+", " ", current).strip())
    start = next(
        (i for i, line in enumerate(lines) if difflib.SequenceMatcher(None, comparable(line), comparable(first)).ratio() >= 0.85),
        None,
    )
    if start is None:
        raise ValueError(f"Could not identify the 1920 verse start for {number}")
    lines = lines[start:]
    if number == 36:
        lines = [line for line in lines if line != "FRAMMENTI."]
    return lines


def article(soup):
    link = soup.select_one("#t-permalink a")
    quality = soup.select_one("table.pr_quality")
    if not link or not quality:
        raise ValueError("Missing article revision or proofreading status")
    return "https://it.wikisource.org" + link.get("href", ""), quality.get("title", "")


def unsupported_lines(number, original, older, later):
    """Identify lines needing a separate scan check, without conflating editions."""
    norm = lambda lines: list(map(comparable, lines))
    first, third = norm(original), norm(later)
    if number not in {32, 34}:
        if len(original) != len(older) or len(original) != len(later):
            raise ValueError(f"Comparison line counts differ for {number}")
        second = norm(older)
        return [i + 1 for i, (a, b, c) in enumerate(zip(first, second, third)) if a != b and a != c]
    if number == 32:
        if len(original) != len(later):
            raise ValueError("Unexpected 1920 Palinodia length")
        return [i + 1 for i, (a, b) in enumerate(zip(first, third)) if a != b]
    reviewed = []
    insertions = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, first, third, autojunk=False).get_opcodes():
        if tag == "equal":
            continue
        if tag == "insert":
            insertions.extend(later[j1:j2])
        elif tag == "replace" and i2 - i1 == j2 - j1:
            reviewed.extend(range(i1 + 1, i2 + 1))
        else:
            raise ValueError("Unreviewed Ginestra boundary or alignment difference")
    if list(map(comparable, insertions)) != list(map(comparable, [
        "E ben facil mi fòra",
        "Imitar gli altri, e vaneggiando in prova,",
        "Farmi agli orecchi tuoi cantando accetto:",
    ])):
        raise ValueError("Unexpected Ginestra edition difference")
    return reviewed


def corrected_text(number, text, corrections):
    lines = text.split("\n")
    for correction in corrections:
        indices = [i for i, line in enumerate(lines) if line]
        index = indices[correction["line"] - 1]
        if lines[index] != correction["before"]:
            raise ValueError(f"Correction input changed for {number}.{correction['line']}")
        lines[index] = correction["after"]
    if number == 10:
        # The 1917 edition indents each tercet; make those breaks readable in plain text.
        verse = [line for line in lines if line]
        return "\n\n".join("\n".join(verse[i:i + 3]) for i in range(0, len(verse), 3))
    return "\n".join(lines)


def build_records(directory):
    raw = (directory / "hoepli-1920.html").read_bytes()
    if hashlib.sha256(raw).hexdigest() != GUTENBERG_SHA256:
        raise ValueError("The 1920 comparison source changed")
    comparison = BeautifulSoup(raw, "html.parser")
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    if len(manifest) != 32 or len({entry["number"] for entry in manifest}) != 32:
        raise ValueError("Unexpected reviewed selection")
    records = []
    for item in manifest:
        number = item["number"]
        source = BeautifulSoup((directory / f"donati-{number:02}.html").read_bytes(), "html.parser")
        source_url, quality = article(source)
        if source_url != item["source"] or "0 pagine solo trascritte e 0 pagine incomplete" not in quality:
            raise ValueError(f"Article revision or proofreading status changed for {number}")
        raw_text = verse_text(source)
        if digest(raw_text) != item["sourceTextSha256"]:
            raise ValueError(f"Wikisource text changed for {number}")
        original = [line for line in raw_text.split("\n") if line]
        older_soup = BeautifulSoup((directory / f"starita-{number:02}.html").read_bytes(), "html.parser") if number != 34 else None
        older = []
        if older_soup:
            older_url, older_quality = article(older_soup)
            if older_url != item["olderSource"]:
                raise ValueError(f"Comparison article revision changed for {number}")
            if number != 33 and "0 pagine solo trascritte e 0 pagine incomplete" not in older_quality:
                raise ValueError(f"Comparison proofreading status changed for {number}")
            # The comparison edition has at least one misplaced line-number marker.
            older_text = verse_text(older_soup, verify_markers=False)
            if digest(older_text) != item["olderTextSha256"]:
                raise ValueError(f"Comparison text changed for {number}")
            older = [line for line in older_text.split("\n") if line]
        later = gutenberg_lines(comparison, number, original[0])
        if digest("\n".join(later)) != item["gutenbergLinesSha256"]:
            raise ValueError(f"1920 comparison extraction changed for {number}")
        reviewed = unsupported_lines(number, original, older, later)
        if reviewed != [review["line"] for review in item["scanReviews"]]:
            raise ValueError(f"Unreviewed textual difference for {number}")
        text = corrected_text(number, raw_text, item["corrections"])
        if digest(text) != item["sha256"] or len([line for line in text.split("\n") if line]) != item["lines"]:
            raise ValueError(f"Output text changed for {number}")
        context = (
            f"Poem {roman(number)} in Giacomo Leopardi's Canti, in Alessandro Donati's 1917 edition. "
            "The original follows the proofread Wikisource transcription, with edition differences, "
            "scan checks and editorial corrections documented in the source notes. Composition date is not established here."
        )
        if item["contextNote"]:
            context += " " + item["contextNote"]
        context_url = f"https://www.gutenberg.org/cache/epub/55236/pg55236-images.html#{roman(number)}"
        context_title = "Project Gutenberg · 1920 edition for comparison"
        if number == 33:
            context_url = item["olderSource"]
            context_title = "Wikisource · annotated Starita copy, comparison and editorial note"
        records.append({
            "id": f"leopardi-canti-{number:02}",
            "title": item["title"],
            "author": "Giacomo Leopardi",
            "authorId": "giacomo-leopardi",
            "authorYears": "1798–1837",
            "country": "Italy",
            "language": "Italian",
            "lang": "it",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Composition date not established",
            "era": "Romanticism",
            "form": "Verse",
            "collection": "Canti",
            "themes": [],
            "mood": "paper",
            "context": context,
            "contextSource": context_url,
            "contextSourceTitle": context_title,
            "sourceTitle": f"Wikisource · Canti, Donati edition 1917, no. {roman(number)}",
            "source": item["source"],
            "rights": (
                "Historical original and 1917 edition are public domain in the United States. "
                "Transcription by Wikisource contributors under CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/; "
                "see the linked article and scan-page histories for contributors; check local law."
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

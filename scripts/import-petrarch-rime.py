#!/usr/bin/env -S uv run --no-project --with beautifulsoup4 python
"""Reproduce the scan-reviewed 1739 Petrarch selection from saved sources."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/petrarch-rime-1739.json"
OUTPUT = ROOT / "content/poems/petrarch-rime-1739.json"
QUALITY = "1 pagina riletta, 0 pagine solo trascritte e 0 pagine incomplete"
RIGHTS = (
    "Historical original and 1739 edition are public domain in the United States. "
    "Wikisource transcription by contributors under CC BY-SA 4.0: "
    "https://creativecommons.org/licenses/by-sa/4.0/; consult the linked article and "
    "scan-page histories for contributors; check local law."
)


def digest(value):
    return hashlib.sha256(value.encode("utf8") if isinstance(value, str) else value).hexdigest()


def article(path, expected):
    soup = BeautifulSoup(path.read_bytes(), "html.parser")
    link = soup.select_one("#t-permalink a")
    quality = soup.select_one("table.pr_quality")
    if not link or "https://it.wikisource.org" + link.get("href", "") != expected:
        raise ValueError(f"Article revision changed: {path.name}")
    if not quality or quality.get("title") != QUALITY:
        raise ValueError(f"Proofreading status changed: {path.name}")
    return soup


def hidden(node, block):
    for ancestor in node.parents:
        if ancestor is block:
            return False
        if isinstance(ancestor, Tag) and (
            ancestor.name in {"style", "script", "sup"}
            or set(ancestor.get("class", []))
            & {"numeroriga", "numeropagina", "pagenum", "reference", "noprint", "ws-noexport", "dropinitial"}
        ):
            return True
    return False


def verse(soup):
    """Extract the whole sonnet, including the decorative first line."""
    root = soup.select_one("#mw-content-text .prp-pages-output")
    blocks = root.select("div.poem") if root else []
    if len(blocks) != 1:
        raise ValueError("Expected one transcluded sonnet")
    block = blocks[0]
    if block.select_one("div.poem, table, ul, ol, blockquote, h1, h2, h3, h4, pre"):
        raise ValueError("Unexpected nested verse structure")
    if len(block.select("div.dropinitial")) != 1:
        raise ValueError("Expected one decorative initial")
    pieces, markers = [], []
    for node in block.descendants:
        if isinstance(node, Tag) and "numeroriga" in node.get("class", []):
            value = node.get_text(strip=True)
            completed = len([line for line in "".join(pieces).split("\n") if line.strip()])
            if not value.isdigit() or int(value) != completed + 1:
                raise ValueError(f"Incorrect verse marker {value!r}")
            markers.append(int(value))
        if hidden(node, block):
            continue
        if isinstance(node, Tag) and "dropinitial" in node.get("class", []):
            initial = node.get_text("", strip=True)
            if len(initial) != 1:
                raise ValueError("Unrecognized decorative initial")
            pieces.append(initial)
        elif isinstance(node, Tag) and node.name == "br":
            pieces.append("\n")
        elif isinstance(node, NavigableString):
            pieces.append(re.sub(r"\s+", " ", str(node).replace("\ufeff", "")))
    if markers != [4, 8, 11, 14]:
        raise ValueError("Unexpected sonnet line markers")
    lines = [line.strip() for line in "".join(pieces).split("\n") if line.strip()]
    if len(lines) != 14:
        raise ValueError("The sonnet is not exactly fourteen lines")
    # The opening letters are printed as decorative small capitals.
    lines[0] = re.sub(r"^\w+", lambda match: match.group().capitalize(), lines[0])
    return [unicodedata.normalize("NFC", line) for line in lines]


def scan_page(soup):
    root = soup.select_one("#mw-content-text .prp-pages-output")
    pages = [int(node["data-pagenum"]) for node in root.select("span.numeropagina[data-pagenum]")]
    if len(pages) != 1:
        raise ValueError("Unexpected scan-page boundary")
    # Wikisource's divided DJVU has one extra leading leaf relative to this IA copy.
    return pages[0] - 1


def comparison_line(value):
    value = unicodedata.normalize("NFKD", value.casefold())
    value = "".join(char for char in value if not unicodedata.combining(char))
    return " ".join(re.sub(r"[^\w]+", " ", value).split())


def differences(original, other):
    if len(original) != 14 or len(other) != 14:
        raise ValueError("Comparison is not a complete sonnet")
    return [
        {"line": index, "original": left, "comparison": right}
        for index, (left, right) in enumerate(zip(original, other), 1)
        if comparison_line(left) != comparison_line(right)
    ]


def gutenberg_verse(soup, page):
    anchor = soup.find(id=f"Page_{page}")
    heading = anchor.parent.parent.find_next_sibling("h3") if anchor else None
    table = heading.find_next_sibling("table") if heading else None
    original = table.select_one('span[lang="it"]') if table else None
    if original is None:
        raise ValueError(f"Missing Italian Gutenberg sonnet on page {page}")
    pieces = []
    for node in original.descendants:
        if isinstance(node, Tag) and node.name == "br":
            pieces.append("\n")
        elif isinstance(node, NavigableString):
            pieces.append(re.sub(r"\s+", " ", str(node)))
    return [line.strip() for line in "".join(pieces).split("\n") if line.strip()]


def edited_lines(raw, edits):
    lines = raw.copy()
    seen = set()
    for edit in edits:
        index = edit["line"] - 1
        if index in seen or not 0 <= index < 14 or lines[index] != edit["before"]:
            raise ValueError(f"Scan correction no longer applies: line {index + 1}")
        seen.add(index)
        lines[index] = edit["after"]
    return lines


def arranged(lines):
    return "\n\n".join("\n".join(lines[start:end]) for start, end in [(0, 4), (4, 8), (8, 11), (11, 14)])


def build_records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    items = manifest["poems"]
    if [item["number"] for item in items] != [*range(1, 57), 69, 98, 126]:
        raise ValueError("Unexpected reviewed selection")
    for filename, expected in manifest["scanSha256"].items():
        if digest((directory / filename).read_bytes()) != expected:
            raise ValueError(f"Reviewed scan changed: {filename}")
    raw_gutenberg = (directory / "gutenberg-1903.html").read_bytes()
    if digest(raw_gutenberg) != manifest["gutenbergSha256"]:
        raise ValueError("Gutenberg comparison changed")
    gutenberg = BeautifulSoup(raw_gutenberg, "html.parser")
    output = []
    for item in items:
        number = item["number"]
        soup = article(directory / f"sonnet-{number:03}.html", item["source"])
        if scan_page(soup) != item["scanPage"] or f"scan-{item['scanPage']:03}.jp2" not in manifest["scanSha256"]:
            raise ValueError(f"Scan page changed: {number}")
        raw = verse(soup)
        if digest("\n".join(raw)) != item["sourceSha256"]:
            raise ValueError(f"Transcluded sonnet changed: {number}")
        lines = edited_lines(raw, item["corrections"])
        text = arranged(lines)
        if digest(text) != item["sha256"] or item["title"] != lines[0].rstrip(".,;:?!"):
            raise ValueError(f"Reviewed sonnet changed: {number}")
        comparison = item.get("comparison")
        if bool(comparison) != (number in {1, 7, 28, 69, 98, 126}):
            raise ValueError(f"Unexpected comparison coverage: {number}")
        if comparison:
            if comparison["type"] == "oxford-1910":
                other = article(directory / comparison["filename"], comparison["url"])
                other_lines = verse(other)
            elif comparison["type"] == "gutenberg-1903":
                other_lines = gutenberg_verse(gutenberg, comparison["page"])
            else:
                raise ValueError(f"Unknown comparison for {number}")
            if digest("\n".join(other_lines)) != comparison["sha256"]:
                raise ValueError(f"Comparison text changed: {number}")
            if differences(lines, other_lines) != comparison["differences"]:
                raise ValueError(f"Unreviewed edition difference: {number}")
        edits = item["corrections"]
        edit_note = " ".join(
            f"Line {edit['line']}: “{edit['before']}” → “{edit['after']}”." for edit in edits
        )
        output.append({
            "id": f"petrarch-rime-{number:03}",
            "title": item["title"],
            "author": "Petrarch",
            "authorOriginal": "Francesco Petrarca",
            "authorId": "francesco-petrarca",
            "authorYears": "1304–1374",
            "country": "Italy",
            "language": "Italian",
            "lang": "it",
            "direction": "ltr",
            "year": None,
            "yearLabel": "14th century · exact year not established here",
            "era": "Medieval",
            "form": "Sonnet",
            "collection": "Le rime · Bortoli edition (1739)",
            "themes": ["Faith"] if number == 48 else [],
            "mood": "paper",
            "context": (
                f"Sonetto {item['roman']} in the 1739 Bortoli edition; its sonnet-only numbering "
                "is not the modern Canzoniere sequence. The title is the first verse. "
                "The wording was checked against the print; punctuation may follow the Wikisource "
                "transcription rather than the print. Capitalization and spacing are normalized, and the "
                "stanza breaks are editorial. Exact composition date and place are not established here. "
                + (f"Transcription edits: {edit_note} " if edit_note else "")
                + item.get("note", "")
            ).strip(),
            "contextSource": f"https://archive.org/details/ScansionePIII200MiscellaneaOpal/page/n{item['scanPage'] - 1}/mode/1up",
            "contextSourceTitle": f"Internet Archive · 1739 scan, leaf {item['scanPage']}",
            "sourceTitle": f"Wikisource · Le rime, Bortoli 1739, Sonetto {item['roman']}",
            "source": item["source"],
            "rights": RIGHTS,
            "text": text,
            "translations": [],
        })
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing reviewed articles, comparisons and scans")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(build_records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Records differ from the reviewed sources")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

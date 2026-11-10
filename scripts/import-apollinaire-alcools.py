#!/usr/bin/env -S uv run --no-project --with beautifulsoup4 python
"""Reproduce the reviewed 1920 Alcools selection from saved source pages."""

import argparse
import difflib
import hashlib
import json
import re
import runpy
import unicodedata
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/apollinaire-alcools-1920.json"
OUTPUT = ROOT / "content/poems/apollinaire-alcools.json"
HUGO = runpy.run_path(str(ROOT / "scripts/import-hugo.py"))
RIGHTS = (
    "Original and 1920 edition are public domain in the United States. "
    "Wikisource transcription by contributors under CC BY-SA 4.0: "
    "https://creativecommons.org/licenses/by-sa/4.0/; see linked article and scan-page "
    "histories for contributors; check local law."
)


def digest(value):
    return hashlib.sha256(value.encode("utf8") if isinstance(value, str) else value).hexdigest()


def comparable(value):
    value = value.casefold().replace("œ", "oe").replace("æ", "ae")
    value = unicodedata.normalize("NFKD", value)
    value = "".join(c for c in value if not unicodedata.combining(c))
    return " ".join(re.sub(r"[^\w]+", " ", value).split())


def zone_text(soup):
    """Keep the long lines in inline-block divs, including those crossing pages."""
    blocks = soup.select("#mw-content-text .prp-pages-output div.poem")
    if len(blocks) != 9:
        raise ValueError("Unexpected Zone page structure")
    rendered = []
    for block in blocks:
        parts = []
        for node in block.descendants:
            if HUGO["hidden"](node, block):
                continue
            if isinstance(node, Tag) and node.name == "br":
                parts.append("\n")
            elif isinstance(node, Tag) and node.name == "div":
                if "display:inline-block" not in node.get("style", "").replace(" ", ""):
                    raise ValueError("Unexpected nested Zone block")
                if parts and not parts[-1].endswith("\n"):
                    parts.append("\n")
            elif isinstance(node, NavigableString) and node.parent.name != "div":
                parts.append(re.sub(r"\s+", " ", str(node).replace("\ufeff", "")))
        rendered.append("\n".join(line.strip() for line in "".join(parts).split("\n")))
    return re.sub(r"\n{3,}", "\n\n", "\n".join(rendered).strip())


def source_text(soup, number):
    if number == 1:
        return zone_text(soup)
    if number == 6:
        matches = soup.select('#mw-content-text .prp-pages-output div[style="text-align:center;clear:both;"]')
        if len(matches) != 1:
            raise ValueError("Unexpected Chantre layout")
        return matches[0].get_text(" ", strip=True)
    return HUGO["verse_text"](soup)


def edited_text(raw, item):
    text = raw
    for edit in item.get("edits", []):
        before, after = edit["before"], edit["after"]
        if text.count(before) != 1:
            raise ValueError(f"Scan correction no longer applies: {item['number']}")
        text = text.replace(before, after)
    return text


def comparison_lines(soup, item, first_line):
    start = soup.find(id=item["comparisonStart"])
    end = soup.find(id=item["comparisonEnd"])
    if start is None or end is None:
        raise ValueError(f"Missing Gutenberg boundaries: {item['number']}")
    lines = []
    for node in start.next_elements:
        if node is end:
            break
        if isinstance(node, Tag) and node.name == "p" and node.get("id", "").startswith("id"):
            lines.extend(node.get_text("\n", strip=True).splitlines())
    # Separately printed dates are not poem text.
    lines = [line for line in lines if not re.match(r"^(?:Septembre 1901|Mai 1902)", line)]
    openings = [i for i, line in enumerate(lines) if comparable(line) == comparable(first_line)]
    if not openings:
        raise ValueError(f"Missing Gutenberg opening: {item['number']}")
    return lines[openings[0]:]


def comparison_differences(original, comparison, number):
    if number == 1:
        # Gutenberg wraps several long verses into physical lines, so compare words.
        left = comparable(" ".join(original)).split()
        right = comparable(" ".join(comparison)).split()
        matcher = difflib.SequenceMatcher(None, left, right, autojunk=False)
        return [
            {"original": " ".join(left[a:b]), "comparison": " ".join(right[c:d])}
            for kind, a, b, c, d in matcher.get_opcodes() if kind != "equal"
        ]
    if number == 2:
        if len(original) != len(comparison) + 2 or original[-2:] != [
            "Vienne la nuit sonne l’heure", "Les jours s’en vont je demeure"
        ]:
            raise ValueError("Unexpected Mirabeau comparison ending")
        original = original[:-2]
    if len(original) != len(comparison):
        raise ValueError(f"Comparison line count changed: {number}")
    return [
        {"line": i, "original": left, "comparison": right}
        for i, (left, right) in enumerate(zip(original, comparison), 1)
        if comparable(left) != comparable(right)
    ]


def records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    items = manifest["poems"]
    expected = [1, 2, 4, 6, 7, 8, 10, 12, 14, 15, 17, 18, 19, 21, 23, 25, 27,
                29, 31, 32, 34, 35, 36, 37, 38, 39, 40, 41, 42, 44, 45, 47, 48, 49]
    if [item["number"] for item in items] != expected:
        raise ValueError("Unexpected reviewed selection")
    original = (directory / "gutenberg.html").read_bytes()
    if digest(original) != manifest["gutenbergSha256"]:
        raise ValueError("Gutenberg comparison changed")
    comparison = BeautifulSoup(original, "html.parser")
    for page, expected_hash in manifest["scanSha256"].items():
        if digest((directory / f"scan-{page}.jpg").read_bytes()) != expected_hash:
            raise ValueError(f"Reviewed scan changed: {page}")

    output = []
    for item in items:
        number = item["number"]
        soup = BeautifulSoup((directory / f"{number:02}.html").read_bytes(), "html.parser")
        permalink = soup.select_one("#t-permalink a")
        quality = soup.select_one("table.pr_quality")
        year = soup.select_one(".ws-year")
        if not permalink or "https://fr.wikisource.org" + permalink.get("href", "") != item["source"]:
            raise ValueError(f"Wikisource revision changed: {number}")
        if not quality or quality.get("title") != item["quality"] or not year or year.get_text(strip=True) != "1920":
            raise ValueError(f"Edition or proofreading status changed: {number}")
        raw = source_text(soup, number)
        if digest(raw) != item["sourceSha256"]:
            raise ValueError(f"Transcluded text changed: {number}")
        text = edited_text(raw, item)
        lines = [line for line in text.splitlines() if line]
        if len(lines) != item["lines"] or digest(text) != item["sha256"]:
            raise ValueError(f"Reviewed text changed: {number}")
        other = comparison_lines(comparison, item, lines[0])
        if comparison_differences(lines, other, number) != item["comparisonDifferences"]:
            raise ValueError(f"Unreviewed comparison difference: {number}")
        output.append({
            "id": f"apollinaire-alcools-{number:02}",
            "title": item["title"],
            "author": "Guillaume Apollinaire",
            "authorId": "guillaume-apollinaire",
            "authorYears": "1880–1918",
            "country": "France",
            "language": "French",
            "lang": "fr",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Printed 1920 · composition date not established here",
            "era": "Date not established",
            "form": "Verse",
            "collection": "Alcools · third edition (1920)",
            "themes": [],
            "mood": "paper",
            "context": (
                "Guillaume Apollinaire's original in the third edition of Alcools (1920), "
                "a collection first published in 1913. The verse follows Wikisource's "
                "validated transcription, with scan checks and editorial details in the source notes. "
                "The exact composition date and place are not established here. " + item["note"]
            ).strip(),
            "contextSource": f"https://www.gutenberg.org/cache/epub/15462/pg15462-images.html#{item['comparisonStart']}",
            "contextSourceTitle": "Project Gutenberg · separate transcription for comparison",
            "sourceTitle": "Wikisource · Alcools, third edition (1920)",
            "source": item["source"],
            "rights": RIGHTS,
            "text": text,
            "translations": [],
        })
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing reviewed HTML and scan images")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Records differ from the reviewed sources")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

#!/usr/bin/env -S uv run --no-project --with beautifulsoup4 python
"""Reproduce the scan-reviewed 1834 Les Pleurs selection from saved sources."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/desbordes-valmore-pleurs-1834.json"
OUTPUT = ROOT / "content/poems/desbordes-valmore-pleurs-1834.json"
EXPECTED = (
    "attente", "dors-tu", "amour", "jumeau", "adieu-tout-bas", "ne-me-plains-pas",
    "detachement", "croix-belge", "sincere", "une-fleur", "les-fleurs", "rameau",
    "fiancee", "ondine",
)
RIGHTS = (
    "The historical originals and 1834 edition are public domain in the United States. "
    "Wikisource transcription by contributors under CC BY-SA 4.0: "
    "https://creativecommons.org/licenses/by-sa/4.0/; consult the linked article and "
    "scan-page histories for contributors. Check local law."
)


def digest(value):
    return hashlib.sha256(value.encode("utf8") if isinstance(value, str) else value).hexdigest()


def reading(soup, item):
    root = soup.select_one("#mw-content-text .prp-pages-output")
    if root is None:
        raise ValueError(f"Missing transclusion: {item['slug']}")
    headings = root.select("h3")
    if len(headings) != 1 or headings[0].get_text(" ", strip=True) != item["roman"] + ".":
        raise ValueError(f"Unexpected printed numbering: {item['slug']}")
    heading = root.select_one("h2")
    if not heading or " ".join(heading.get_text(" ", strip=True).split()) != item["heading"]:
        raise ValueError(f"Unexpected printed heading: {item['slug']}")
    leaves = [int(node["title"].rsplit("/", 1)[-1]) for node in root.select("span.pagenum[title]")]
    if leaves != item["leaves"]:
        raise ValueError(f"Unexpected scan pages: {item['slug']}")
    blocks = [block for block in root.select("div.poem") if block.find_previous("h3") is headings[0]]
    if len(blocks) != len(leaves) - 1:
        raise ValueError(f"Unexpected verse blocks: {item['slug']}")
    lines = []
    for block, leaf in zip(blocks, leaves[1:]):
        marker = block.find_previous("span", class_="pagenum")
        if not marker or int(marker["title"].rsplit("/", 1)[-1]) != leaf:
            raise ValueError(f"Unexpected verse page: {item['slug']}")
        for child in block.find_all():
            if child.name not in {"p", "br", "span"}:
                raise ValueError(f"Unexpected verse markup: {item['slug']}")
            if child.name == "span" and child.get("class", []) != ["mw-poem-indented"]:
                raise ValueError(f"Unexpected verse span: {item['slug']}")
        parts = []
        for node in block.descendants:
            if isinstance(node, Tag) and node.name == "br":
                parts.append("\n")
            elif isinstance(node, NavigableString):
                parts.append(re.sub(r"\s+", " ", str(node).replace("\ufeff", "")))
        lines.extend(
            unicodedata.normalize("NFC", " ".join(line.split()))
            for line in "".join(parts).split("\n") if line.strip()
        )
    return lines


def corrected(lines, edits):
    lines = lines.copy()
    seen = set()
    for edit in edits:
        index = edit["line"] - 1
        if index in seen or not 0 <= index < len(lines) or lines[index] != edit["before"]:
            raise ValueError(f"Scan correction no longer applies: line {index + 1}")
        seen.add(index)
        lines[index] = edit["after"]
    return lines


def arranged(lines, sizes):
    if not sizes or not all(isinstance(size, int) and size > 0 for size in sizes) or sum(sizes) != len(lines):
        raise ValueError("Stanza lengths do not match the reviewed text")
    stanzas, start = [], 0
    for size in sizes:
        stanzas.append("\n".join(lines[start:start + size]))
        start += size
    return "\n\n".join(stanzas)


def records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    items = manifest["poems"]
    if tuple(item["slug"] for item in items) != EXPECTED:
        raise ValueError("Unexpected reviewed selection")
    leaves = {1}
    for item in items:
        leaves.update(item["leaves"])
        leaves.add(item["leaves"][-1] + 1)
    if 166 in leaves:
        raise ValueError("The composite scan leaf 166 is not an original witness")
    expected_files = {
        "les-pleurs-1834.djvu", "fiancee-memorial-1831.jpg",
        *(f"leaf-{leaf:03}.jpg" for leaf in leaves),
    }
    if set(manifest["scanSha256"]) != expected_files:
        raise ValueError("Unexpected scan selection")
    for name, expected in manifest["scanSha256"].items():
        if digest((directory / name).read_bytes()) != expected:
            raise ValueError(f"Reviewed scan changed: {name}")

    output = []
    for item in items:
        slug = item["slug"]
        soup = BeautifulSoup((directory / f"{slug}.html").read_bytes(), "html.parser")
        link = soup.select_one("#t-permalink a")
        quality = soup.select_one("table.pr_quality")
        year = soup.select_one(".ws-year")
        if not link or "https://fr.wikisource.org" + link.get("href", "") != item["source"]:
            raise ValueError(f"Article revision changed: {slug}")
        expected_quality = f"{len(item['leaves'])} pages validées, 0 page corrigée et 0 page non corrigée"
        if not quality or quality.get("title") != expected_quality or not year or year.get_text(strip=True) != "1834":
            raise ValueError(f"Edition or proofreading status changed: {slug}")
        raw = reading(soup, item)
        if digest("\n".join(raw)) != item["sourceSha256"]:
            raise ValueError(f"Transcluded text changed: {slug}")
        lines = corrected(raw, item["corrections"])
        text = arranged(lines, item["stanzas"])
        if len(lines) != item["lines"] or digest(text) != item["sha256"]:
            raise ValueError(f"Reviewed poem changed: {slug}")
        correction_note = " ".join(
            f"Line {edit['line']}: “{edit['before']}” → “{edit['after']}”." for edit in item["corrections"]
        )
        context = (
            f"No. {item['roman']} in the 1834 Goullet second edition of Les Pleurs; the "
            "complete verse and its printed ending were checked against that copy. "
            "Historical spelling is retained; spacing is normalized, page-spanning stanzas "
            "are rejoined, and punctuation and accents may follow the Wikisource transcription. "
            "Exact composition date and place are not established here; France is associated "
            "with the poet. " + item["note"] +
            (f" Scan-based punctuation correction: {correction_note}" if correction_note else "")
        )
        scan = f"https://fr.wikisource.org/wiki/Page:Desbordes-Valmore_-_Les_Pleurs,_1834.djvu/{item['leaves'][0]}"
        context_source = item.get("comparisonSource", scan)
        context_title = item.get("comparisonTitle", f"Wikisource · 1834 title and scan, leaf {item['leaves'][0]}")
        output.append({
            "id": f"desbordes-valmore-pleurs-{slug}",
            "title": item["title"],
            "author": "Marceline Desbordes-Valmore",
            "authorOriginal": "Marceline Desbordes-Valmore",
            "authorId": "marceline-desbordes-valmore",
            "authorYears": "1786–1859",
            "country": "France",
            "language": "French",
            "lang": "fr",
            "direction": "ltr",
            "year": None,
            "yearLabel": "1834 edition · composition date not established here",
            "era": "19th century",
            "form": "Verse",
            "collection": "Les Pleurs · second edition (1834)",
            "themes": ["Faith"] if slug == "rameau" else [],
            "mood": "paper",
            "context": context.strip(),
            "contextSource": context_source,
            "contextSourceTitle": context_title,
            "sourceTitle": f"Wikisource · Les Pleurs, second edition (1834), no. {item['roman']}",
            "source": item["source"],
            "rights": RIGHTS,
            "text": text,
            "translations": [],
        })
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing reviewed articles and scans")
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

#!/usr/bin/env -S uv run --no-project --with beautifulsoup4 python
"""Reproduce selected Dias poems from the pinned 1860 transcription and scans."""

import argparse
import hashlib
import json
import re
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/goncalves-dias-cantos-1860.json"
OUTPUT = ROOT / "content/poems/goncalves-dias-cantos-1860.json"
GUTENBERG = "https://www.gutenberg.org/ebooks/74854"
SCAN = "https://literaturabrasileira.ufsc.br/midias/stream?id=117524&raw=1"
EXPECTED = (
    "guerreiro", "piaga", "indio", "pedido", "leito", "maraba", "tamoyo",
    "mangueira", "olhos", "cumprimento", "urge", "tumulo", "menina", "concha", "pedes",
)
RIGHTS = (
    "The historical original and 1860 printing are public domain in the United States; "
    "check local law. Project Gutenberg credits Rita Farinha, Laura Natal, Alberto "
    "Manuel Brandão Simões and the Online Distributed Proofreading Team."
)


def digest(value):
    if isinstance(value, str):
        value = value.encode("utf8")
    return hashlib.sha256(value).hexdigest()


def clean(element):
    for marker in element.select(".pagenum, .fnanchor"):
        marker.decompose()
    return re.sub(r"\s+", " ", element.get_text(" ", strip=True)).strip()


def extract(soup, item):
    heading = soup.find("h3", id=item["anchor"])
    if not heading:
        raise ValueError(f"Missing heading: {item['anchor']}")
    segments, headings, metadata = [], [], []
    container = 0
    element = heading.find_next_sibling()
    while element and element.name not in {"h2", "h3"}:
        classes = element.get("class", [])
        if element.name == "div" and "poetry-container" in classes:
            container += 1
            if container in item.get("epigraphContainers", []):
                element = element.find_next_sibling()
                continue
            for stanza in element.select("div.stanza"):
                lines = []
                for verse in stanza.find_all("div", class_="verse", recursive=False):
                    line = clean(verse)
                    if line in item.get("excludedLines", []):
                        metadata.append(line)
                        continue
                    if not line:
                        raise ValueError(f"Empty verse: {item['slug']}")
                    lines.append(line)
                if lines:
                    segments.append("\n".join(lines))
        elif element.name == "p":
            line = clean(element)
            if re.fullmatch(r"[IVXLCDM]+\.", line):
                headings.append(line)
                segments.append(line)
            elif line:
                metadata.append(line)
        elif element.name != "hr":
            raise ValueError(f"Unexpected element in {item['slug']}: {element.name}")
        element = element.find_next_sibling()
    if headings != item.get("headings", []) or metadata != item.get("metadata", []):
        raise ValueError(f"Unexpected headings or non-verse material: {item['slug']}: {headings}, {metadata}")
    text = "\n\n".join(segments)
    for before, after in item.get("corrections", []):
        if text.count(before) != 1:
            raise ValueError(f"Correction input changed: {item['slug']}")
        text = text.replace(before, after)
    return text


def records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    for name, expected in manifest["sourceSha256"].items():
        if digest((directory / name).read_bytes()) != expected:
            raise ValueError(f"Reviewed source changed: {name}")
    soup = BeautifulSoup((directory / "gutenberg-74854.html").read_bytes(), "html.parser")
    items = manifest["poems"]
    if [item["slug"] for item in items] != list(EXPECTED) or len({item["anchor"] for item in items}) != len(items):
        raise ValueError("Unexpected selection or duplicate anchor")
    result = []
    for item in items:
        text = extract(soup, item)
        if len([line for line in text.splitlines() if line]) != item["lines"] or digest(text) != item["sha256"]:
            raise ValueError(f"Reviewed reading changed: {item['slug']}")
        first, last = item["pages"]
        label = str(first) if first == last else f"{first}–{last}"
        context = (
            f"From the 1860 third edition of Cantos, pp. {label}. The reading follows "
            "an electronic transcription, compared in order with OCR of the linked 1860 "
            "scan and with an earlier separately printed edition using scan-backed "
            "transcriptions as comparison aids. Selected differences and boundaries "
            "were checked visually; this is not a diplomatic or exhaustive collation. "
            "Completeness refers to this printing, not every witness. Historical spelling "
            "is retained; indentation, spacing and some punctuation are normalized. "
            "Brazil is associated with the poet, not necessarily the poem's composition place."
        )
        if item.get("note"):
            context += " " + item["note"]
        result.append({
            "id": f"dias-cantos-1860-{item['slug']}",
            "title": item["title"],
            "author": "Gonçalves Dias",
            "authorId": "goncalves-dias",
            "authorYears": "1823–1864",
            "country": "Brazil",
            "language": "Portuguese",
            "lang": "pt",
            "direction": "ltr",
            "year": item.get("year"),
            "yearLabel": item.get("yearLabel", "Printed 1860 · exact composition date not established"),
            "era": "Romanticism",
            "form": "Verse",
            "collection": "Cantos (1860 edition)",
            "themes": [],
            "mood": "paper",
            "context": context,
            "contextSource": f"{SCAN}#page={first + 28}",
            "contextSourceTitle": f"UFSC · 1860 scan, p{'p' if first != last else ''}. {label}",
            "sourceTitle": f"Project Gutenberg · Cantos, third edition, p{'p' if first != last else ''}. {label}",
            "source": GUTENBERG,
            "rights": RIGHTS,
            "text": text,
            "translations": [],
        })
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the reviewed evidence")
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

#!/usr/bin/env -S uv run --no-project --with beautifulsoup4 python
"""Reproduce scan-reviewed Francisca Júlia poems from saved source pages."""

import argparse
import hashlib
import json
import re
import runpy
from pathlib import Path
from urllib.parse import unquote

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/francisca-julia-marmores-reviewed.json"
OUTPUT = ROOT / "content/poems/francisca-julia-marmores-reviewed.json"
HELPERS = runpy.run_path(str(ROOT / "scripts/import-machado.py"))
SCAN = "https://commons.wikimedia.org/wiki/File:Marmores.pdf"
RIGHTS = (
    "The historical poems and 1895 edition are public domain in the United States. "
    "Wikisource transcription by contributors under CC BY-SA 4.0: "
    "https://creativecommons.org/licenses/by-sa/4.0/; consult the linked article and "
    "scan-page histories for contributors; check local law."
)


def digest(value):
    if isinstance(value, str):
        value = value.encode("utf8")
    return hashlib.sha256(value).hexdigest()


def scan_pages(soup):
    root = soup.select_one("#mw-content-text .prp-pages-output")
    if root is None:
        raise ValueError("Missing scan-backed transcription")
    pages = []
    for marker in root.select(".pagenum[title]"):
        match = re.search(r"Página:Marmores\.pdf/(\d+)", unquote(marker["title"]))
        if match:
            pages.append(int(match.group(1)))
    return pages


def records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    if digest((directory / "Marmores.pdf").read_bytes()) != manifest["scanSha256"]:
        raise ValueError("The reviewed 1895 scan has changed")
    selected = manifest["poems"]
    if len(selected) != 24 or len({item["slug"] for item in selected}) != 24:
        raise ValueError("Unexpected reviewed selection")
    output = []
    for item in selected:
        slug = item["slug"]
        soup = BeautifulSoup((directory / f"article-{item['articleNumber']:02}.html").read_bytes(), "html.parser")
        url, quality = HELPERS["article"](soup)
        if url != item["source"] or quality != item["quality"] or scan_pages(soup) != item["pages"]:
            raise ValueError(f"Article revision, proofreading status or page range changed: {slug}")
        text = HELPERS["source_verse"](soup)
        if digest(text) != item["sourceSha256"]:
            raise ValueError(f"Transcluded text changed: {slug}")
        text = HELPERS["corrected"](item, text)
        if len([line for line in text.splitlines() if line]) != item["lines"] or digest(text) != item["sha256"]:
            raise ValueError(f"Reviewed output changed: {slug}")
        printed = [page - 36 for page in item["pages"]]
        page_label = f"pp. {printed[0]}–{printed[-1]}"
        context = (
            "Included in Francisca Júlia's Mármores (1895), this reading follows the "
            "scan-backed Wikisource transcription, checked against the linked first edition. "
            "Historical spelling is retained; typography and indentation are normalized for reading. "
            "Her birth year is disputed: 1871 is commonly given, while the original preface and "
            "one USP catalogue entry give 1874. Brazil is an association with the poet; the "
            "composition date and place are not established here."
        )
        if item["note"]:
            context += " " + item["note"]
        output.append({
            "id": f"francisca-julia-{slug}",
            "title": item["title"],
            "author": "Francisca Júlia",
            "authorId": "francisca-julia",
            "authorYears": "1871?–1920",
            "country": "Brazil",
            "language": "Portuguese",
            "lang": "pt",
            "direction": "ltr",
            "year": None,
            "yearLabel": "In Mármores (1895) · composition date not established",
            "era": "19th century",
            "form": item["form"],
            "collection": "Mármores",
            "themes": ["Faith"] if item["faith"] else [],
            "mood": "paper",
            "context": context,
            "contextSource": f"{SCAN}?page={item['pages'][0]}",
            "contextSourceTitle": f"Commons · 1895 first-edition scan, {page_label}",
            "sourceTitle": "Wikisource · Mármores (1895)",
            "source": item["source"],
            "rights": RIGHTS,
            "text": text,
            "translations": [],
        })
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the saved scan and article HTML")
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

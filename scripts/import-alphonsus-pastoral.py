#!/usr/bin/env -S uv run --no-project --with beautifulsoup4 python
"""Reproduce reviewed Alphonsus de Guimaraens poems from saved sources."""

import argparse
import hashlib
import json
import re
import runpy
from pathlib import Path
from urllib.parse import unquote

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/alphonsus-pastoral-reviewed.json"
OUTPUT = ROOT / "content/poems/alphonsus-pastoral-reviewed.json"
HELPERS = runpy.run_path(str(ROOT / "scripts/import-machado.py"))
SCAN = "https://digital.bbm.usp.br/bitstream/bbm/7695/1/45000023470_Output.o.pdf"
RIGHTS = (
    "Historical originals and the 1923 edition are public domain in the United States. "
    "Wikisource transcription by contributors under CC BY-SA 4.0: "
    "https://creativecommons.org/licenses/by-sa/4.0/; consult article and scan-page "
    "histories for contributors; check local law. USP's catalogue applies a default "
    "all-rights-reserved notice unless otherwise indicated; the scan is linked, not reproduced."
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
        title = unquote(marker["title"]).replace("_", " ")
        match = re.search(r"Página:Pastoral aos crentes do amor e da morte \(1923\)\.djvu/(\d+)", title)
        if match:
            pages.append(int(match.group(1)))
    return pages


def selected_verse(item, raw_text):
    omitted = item["omittedFinalLine"]
    if omitted:
        suffix = "\n\n" + omitted
        if not raw_text.endswith(suffix) or raw_text.count(omitted) != 1:
            raise ValueError(f"Printed date changed for {item['slug']}")
        raw_text = raw_text[: -len(suffix)]
    return HELPERS["corrected"](item, raw_text)


def records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    if digest((directory / "Pastoral-USP.pdf").read_bytes()) != manifest["scanSha256"]:
        raise ValueError("The reviewed 1923 scan has changed")
    selected = manifest["poems"]
    if len(selected) != 8 or len({item["slug"] for item in selected}) != 8:
        raise ValueError("Unexpected reviewed selection")
    output = []
    for item in selected:
        slug = item["slug"]
        soup = BeautifulSoup((directory / f"article-{item['articleNumber']:02}.html").read_bytes(), "html.parser")
        url, quality = HELPERS["article"](soup)
        if url != item["source"] or quality != item["quality"] or scan_pages(soup) != item["pages"]:
            raise ValueError(f"Article revision, proofreading status or page range changed: {slug}")
        raw_text = HELPERS["source_verse"](soup)
        if digest(raw_text) != item["sourceSha256"]:
            raise ValueError(f"Transcluded text changed: {slug}")
        text = selected_verse(item, raw_text)
        if len([line for line in text.splitlines() if line]) != item["lines"] or digest(text) != item["sha256"]:
            raise ValueError(f"Reviewed output changed: {slug}")
        printed = [page - 4 for page in item["pages"]]
        page_label = f"p. {printed[0]}" if len(printed) == 1 else f"pp. {printed[0]}–{printed[-1]}"
        context = (
            "From Alphonsus de Guimaraens's posthumous Pastoral aos crentes do amor e da morte (1923). "
            "This reading follows the scan-backed Wikisource transcription, checked against the linked "
            "1923 printing. Historical spelling is retained; typography and indentation are normalized "
            "for reading. Brazil is an association with the poet; the place of composition is not "
            "established here. "
            + ("A stanza break at a page turn follows the surrounding pattern; the page turn alone "
               "does not establish it. " if item["restoredBreaks"] else "")
            + item["note"]
        )
        record = {
            "id": f"alphonsus-{slug}",
            "title": item["title"],
            "author": "Alphonsus de Guimaraens",
            "authorId": "alphonsus-de-guimaraens",
            "authorYears": "1870–1921",
            "country": "Brazil",
            "language": "Portuguese",
            "lang": "pt",
            "direction": "ltr",
            "year": None,
            "yearLabel": item["yearLabel"],
            "era": "Date not established",
            "form": item["form"],
            "collection": "Pastoral aos crentes do amor e da morte",
            "themes": item["themes"],
            "mood": "paper",
            "context": context,
            "contextSource": f"{SCAN}#page={item['pages'][0]}",
            "contextSourceTitle": f"USP · 1923 scan, {page_label}",
            "sourceTitle": "Wikisource · Pastoral (1923)",
            "source": item["source"],
            "rights": RIGHTS,
            "text": text,
            "translations": [],
        }
        if item["displayTitle"]:
            record["displayTitle"] = item["displayTitle"]
            record["displayTitleLang"] = "pt"
        output.append(record)
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing saved scan and article HTML")
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

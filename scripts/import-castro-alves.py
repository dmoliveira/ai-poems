#!/usr/bin/env -S uv run --no-project --with beautifulsoup4 python
"""Reproduce reviewed Castro Alves poems from saved historical sources."""

import argparse
import copy
import hashlib
import json
import re
import runpy
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/castro-alves-reviewed.json"
OUTPUT = ROOT / "content/poems/castro-alves-reviewed.json"
HELPERS = runpy.run_path(str(ROOT / "scripts/import-machado.py"))
RIGHTS = (
    "Historical original and the early Garnier edition are public domain in the United States. "
    "Wikisource transcription by contributors under CC BY-SA 4.0: "
    "https://creativecommons.org/licenses/by-sa/4.0/; consult linked article and scan-page "
    "histories for contributors; check local law."
)


def digest(value):
    return hashlib.sha256(value.encode("utf8") if isinstance(value, str) else value).hexdigest()


def source_text(soup):
    root = soup.select_one("#mw-content-text .prp-pages-output")
    if root is None:
        raise ValueError("Missing scan-backed transcription")
    blocks = root.select("div.poem")
    if not blocks:
        raise ValueError("Missing verse blocks")
    texts = []
    for original in blocks:
        block = copy.copy(original)
        for part in block.select("blockquote, .nop, div.tiInherit"):
            part.decompose()
        texts.append(HELPERS["verse"](block).strip())
    return re.sub(r"\n{3,}", "\n\n", "\n".join(texts)).strip()


def records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    for filename, expected in manifest["scanSha256"].items():
        if digest((directory / filename).read_bytes()) != expected:
            raise ValueError(f"Scan changed: {filename}")
    selected = manifest["poems"]
    if len(selected) != 9 or len({item["slug"] for item in selected}) != len(selected):
        raise ValueError("Unexpected selection")
    output = []
    for item in selected:
        slug = item["slug"]
        soup = BeautifulSoup((directory / f"{slug}.html").read_bytes(), "html.parser")
        url, quality = HELPERS["article"](soup)
        root = soup.select_one("#mw-content-text .prp-pages-output")
        if root is None:
            raise ValueError(f"No transclusion: {slug}")
        attrs = json.loads(root["data-mw"])["attrs"]
        pages = [int(attrs["from"]), int(attrs["to"])]
        if url != item["source"] or quality != item["quality"] or pages != item["laterPages"]:
            raise ValueError(f"Article, page range or proofreading status changed: {slug}")
        raw = source_text(soup)
        if digest(raw) != item["sourceTextSha256"]:
            raise ValueError(f"Transcluded text changed: {slug}")
        text = raw
        for change in item["corrections"]:
            if text.count(change["before"]) != 1:
                raise ValueError(f"Correction is not unique: {slug}")
            text = text.replace(change["before"], change["after"], 1)
        for line in item["breakAfter"]:
            anchor = line + "\n"
            if text.count(anchor) != 1 or anchor + "\n" in text:
                raise ValueError(f"Stanza boundary is not unique: {slug}")
            text = text.replace(anchor, anchor + "\n", 1)
        if digest(text) != item["textSha256"] or len([x for x in text.splitlines() if x]) != item["lines"]:
            raise ValueError(f"Output changed: {slug}")
        context = (
            "From Castro Alves's Espumas fluctuantes, first published in 1870. "
            "This reading follows the scan-backed Garnier edition catalogued as 1913; "
            "its title page is undated and Commons gives that date with a question mark. "
            "The linked 1870 first edition provides a comparison. Historical spelling is retained; "
            "punctuation and layout follow the reading transcription, not a facsimile. "
            "The exact composition date and place are not independently established here. "
            + item["note"]
        )
        output.append({
            "id": f"castro-alves-{slug}",
            "title": item["title"],
            "author": "Castro Alves",
            "authorId": "castro-alves",
            "authorYears": "1847–1871",
            "country": "Brazil",
            "language": "Portuguese",
            "lang": "pt",
            "direction": "ltr",
            "year": None,
            "yearLabel": "First published 1870 · composition date not established here",
            "era": "19th century",
            "form": "Verse",
            "collection": "Espumas fluctuantes",
            "themes": [],
            "mood": "paper",
            "context": context,
            "contextSource": f"https://literaturabrasileira.ufsc.br/midias/stream?id=114609&raw=1#page={item['firstPages'][0]}",
            "contextSourceTitle": "UFSC · 1870 first-edition scan for comparison",
            "sourceTitle": "Wikisource · Garnier edition (catalogued 1913, uncertain)",
            "source": item["source"],
            "rights": RIGHTS,
            "text": text,
            "translations": [],
        })
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the saved articles and scans")
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

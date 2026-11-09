#!/usr/bin/env -S uv run --no-project --with beautifulsoup4 python
"""Reproduce the reviewed Bashō verses from locally saved source pages."""

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/basho-oku-reviewed.json"
OUTPUT = ROOT / "content/poems/basho-oku-reviewed.json"


def digest(text):
    return hashlib.sha256(text.encode("utf8")).hexdigest()


def paragraph_text(paragraph):
    node = BeautifulSoup(str(paragraph), "html.parser")
    for element in node.select("style,script,rp,rt,sup,.ws-pagenum"):
        element.decompose()
    return re.sub(r"\s+", "", node.get_text())


def permalink(soup):
    link = soup.select_one("#t-permalink a")
    if not link:
        raise ValueError("Missing source permalink")
    return parse_qs(urlparse(link["href"]).query)


def make_records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    if len(manifest) != 40 or len({item["number"] for item in manifest}) != len(manifest):
        raise ValueError("Unexpected reviewed selection")
    association = BeautifulSoup((directory / "basho-association.html").read_bytes(), "html.parser")
    attributed = [paragraph_text(p) for p in association.select(".haiku p")]
    if len(attributed) != 50:
        raise ValueError("Bashō association list changed")
    oku = BeautifulSoup((directory / "oku-1911.html").read_bytes(), "html.parser")
    if permalink(oku).get("oldid") != ["247172"]:
        raise ValueError("Wrong 1911 Wikisource revision")
    oku_root = oku.select_one("#mw-content-text .mw-parser-output")
    if oku_root is None:
        raise ValueError("Missing 1911 Wikisource text")
    comparison = [paragraph_text(p) for p in oku_root.find_all("p", recursive=False)]
    result = []
    for item in manifest:
        number, page = item["number"], item["scanPage"]
        if number in {16, 23} or not 1 <= number <= len(attributed):
            raise ValueError(f"Existing or invalid selection {number}")
        source = BeautifulSoup((directory / f"source-page-{page}.html").read_bytes(), "html.parser")
        expected = parse_qs(urlparse(item["source"]).query)
        actual = permalink(source)
        if actual.get("oldid") != expected.get("oldid") or actual.get("title") != expected.get("title"):
            raise ValueError(f"Wrong scan page revision for {number}")
        paragraphs = [paragraph_text(p) for p in source.select(".pagetext .mw-parser-output p")]
        if paragraphs.count(item["sourceText"]) != 1:
            raise ValueError(f"Source text missing or duplicated for {number}")
        if comparison.count(item["comparisonText"]) != 1:
            raise ValueError(f"1911 comparison missing or duplicated for {number}")
        if digest(attributed[number - 1]) != item["associationSha256"]:
            raise ValueError(f"Independent attribution list changed for {number}")
        text = item["sourceText"]
        if number == 20:
            text = text.replace("かいやが", "かひやが")
        if number == 38:
            text = text.replace("あか〳〵", "あかあか")
        if number == 40:
            text = text.replace("きり〴〵", "きりぎり")
        if text != item["text"] or digest(text) != item["sha256"]:
            raise ValueError(f"Unexpected correction or text drift for {number}")
        context = (
            "One of Bashō's verses listed in Oku no Hosomichi by the Bashō Memorial Association. "
            "This text follows Kōzan Ōtsuka's 1903 anthology; the 1911 travelogue transcription "
            "sometimes differs in spelling or reading. Composition date and place are not established here."
        )
        if item["note"]:
            context += " " + item["note"]
        result.append({
            "id": f"basho-oku-{number:02}",
            "title": text,
            "author": "Matsuo Bashō",
            "authorOriginal": "松尾芭蕉",
            "authorId": "matsuo-basho",
            "authorYears": "1644–1694",
            "country": "Japan",
            "language": "Japanese",
            "lang": "ja",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Edo period · exact year not established here",
            "era": "Edo period",
            "form": "Haiku",
            "collection": "Bashō Haiku Collection",
            "themes": [],
            "mood": "paper",
            "context": context,
            "contextSource": "https://www.basho-bp.jp/?page_id=28",
            "contextSourceTitle": "Bashō Memorial Association · 50 Oku no Hosomichi verses",
            "sourceTitle": f"Japanese Wikisource · Ōtsuka, Bashō Haiku Collection (1903), p. {page - 5}",
            "source": item["source"],
            "rights": (
                "Historical original and 1903 edition are public domain in the United States. "
                "Wikisource transcription by contributors under CC BY-SA 4.0: "
                "https://creativecommons.org/licenses/by-sa/4.0/ · See the linked page history "
                "for contributors and check local law."
            ),
            "text": text,
            "translations": [],
        })
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the reviewed source HTML files")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(make_records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Committed records differ from reviewed source extraction")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

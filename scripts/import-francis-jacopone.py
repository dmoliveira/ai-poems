#!/usr/bin/env -S uv run --no-project --with beautifulsoup4 python
"""Reproduce scan-reviewed Francis and Jacopone originals from saved sources."""

import argparse
import hashlib
import json
import re
import runpy
import unicodedata
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/francis-jacopone-reviewed.json"
OUTPUT = ROOT / "content/poems/francis-jacopone-reviewed.json"
HELPERS = runpy.run_path(str(ROOT / "scripts/import-leopardi.py"))
RIGHTS = (
    "Historical original and pre-1931 edition are public domain in the United States. "
    "Transcription by Wikisource contributors under CC BY-SA 4.0: "
    "https://creativecommons.org/licenses/by-sa/4.0/; see the linked article and scan-page "
    "histories for contributors; check local law."
)


def digest(data):
    if isinstance(data, str):
        data = data.encode("utf8")
    return hashlib.sha256(data).hexdigest()


def article(path, url):
    soup = BeautifulSoup(path.read_bytes(), "html.parser")
    actual, quality = HELPERS["article"](soup)
    if actual != url or "0 pagine solo trascritte e 0 pagine incomplete" not in quality:
        raise ValueError(f"Article revision or proofreading status changed: {path.name}")
    return soup


def verse(soup, expected_hash):
    text = HELPERS["verse_text"](soup, verify_markers=False)
    if digest(text) != expected_hash:
        raise ValueError("A transcluded verse changed since review")
    return text.splitlines()


def normalize_comparison(line):
    line = unicodedata.normalize("NFC", line).replace("’", "'").replace("‘", "'")
    line = re.sub(r"\s+", " ", line)
    line = re.sub(r"\s+([,;:.!?])", r"\1", line)
    return re.sub(r"\s*—\s*", " — ", line).strip()


def gutenberg_lines(soup, roman):
    anchor = soup.find("a", id=roman)
    block = anchor.parent.find_next_sibling("div", class_="poem") if anchor else None
    if not block:
        raise ValueError(f"No Gutenberg poem for {roman}")
    return [
        text for span in block.select("div.stanza > span")
        if (text := re.sub(r"\s+", " ", span.get_text(" ", strip=True)).strip())
    ]


def arrange(lines, sizes, expected_hash):
    if sum(sizes) != len(lines) or any(size < 1 for size in sizes):
        raise ValueError("Unexpected line or stanza count")
    groups, position = [], 0
    for size in sizes:
        groups.append("\n".join(lines[position:position + size]))
        position += size
    text = "\n\n".join(groups)
    if digest(text) != expected_hash:
        raise ValueError("Reviewed output text changed")
    return text


def francis_record(directory, item):
    source = article(directory / "francis-lucas-1910.html", item["source"])
    block = source.select_one("#mw-content-text .prp-pages-output div.poem")
    initial = block.select_one(":scope > div.dropinitial") if block else None
    prefix = ""
    if initial:
        for child in initial.next_siblings:
            if getattr(child, "name", None) == "p":
                break
            if isinstance(child, NavigableString):
                prefix += str(child)
    if not initial or initial.get_text(strip=True) != "A" or prefix.strip() != "LTISSIMU onnipotente bon signore,":
        raise ValueError("The printed opening or its drop capital changed")
    lines = ["Altissimu onnipotente bon signore,"] + verse(source, item["sourceTextSha256"])
    if lines[15] != "La quale e molto utile e humele e pretiosa e casta.":
        raise ValueError("Unexpected Francis correction input")
    lines[15] = "La quale è molto utile e humele e pretiosa e casta."

    comparison = article(directory / "francis-codex-338.html", item["comparison"])
    root = comparison.select_one("#mw-content-text .prp-pages-output")
    if root is None:
        raise ValueError("No Codex 338 comparison text")
    for node in root.select(".numeropagina, style, script, link"):
        node.decompose()
    comparison_text = re.sub(r"\s+", " ", root.get_text(" ", strip=True)).strip()
    if digest(comparison_text) != item["comparisonTextSha256"]:
        raise ValueError("Codex 338 transcription changed")
    if "lo qual è iorno et allumini noi per loi" not in comparison_text:
        raise ValueError("The reviewed Codex 338 variant was not found")
    return {
        "id": "francis-laudes-creaturarum",
        "title": "Laudes Creaturarum",
        "displayTitle": "Canticle of the Creatures",
        "author": "Francis of Assisi",
        "authorOriginal": "Francesco d’Assisi",
        "authorId": "francis-of-assisi",
        "authorYears": "c. 1182–1226",
        "country": "Italy",
        "language": "Italian",
        "lang": "it",
        "direction": "ltr",
        "year": None,
        "yearLabel": "13th century · exact year not established here",
        "era": "Medieval",
        "form": "Canticle",
        "collection": "The Oxford Book of Italian Verse (1910)",
        "themes": ["Faith", "Nature"],
        "mood": "paper",
        "context": (
            "Francis’s canticle follows the 1910 Oxford Book of Italian Verse; the linked Codex 338 transcription is a separate comparison. "
            "The 1910 print reads ‘Lo quale lu jorno allumeni per nui’; the linked Codex 338 transcription "
            "reads ‘lo qual è iorno et allumini noi per loi’. The opening is set as a drop capital, "
            "and the scan reads è in ‘La quale è’, where the Wikisource transcription has e."
        ),
        "contextSource": item["comparison"],
        "contextSourceTitle": "Wikisource · Codex 338 transcription for comparison",
        "sourceTitle": "Wikisource · The Oxford Book of Italian Verse (1910), pp. 37–38",
        "source": item["source"],
        "rights": RIGHTS,
        "text": arrange(lines, item["stanzas"], item["textSha256"]),
        "translations": [],
    }


def jacopone_records(directory, manifest):
    raw = (directory / "giacopone-ferri-1915-gutenberg.html").read_bytes()
    if digest(raw) != manifest["gutenbergSha256"]:
        raise ValueError("Gutenberg transcription changed")
    gutenberg = BeautifulSoup(raw, "html.parser")
    for node in gutenberg.select(".pagenum, .fnanchor, sup"):
        node.decompose()
    records = []
    for item in manifest["jacopone"]:
        number, roman = item["number"], item["roman"]
        source = article(directory / f"ferri-{number:02}.html", item["source"])
        lines = verse(source, item["sourceTextSha256"])
        other = gutenberg_lines(gutenberg, roman)
        if digest("\n".join(other)) != item["gutenbergTextSha256"] or len(lines) != len(other):
            raise ValueError(f"Gutenberg comparison changed for {roman}")
        differences = [
            index for index, (left, right) in enumerate(zip(lines, other), 1)
            if normalize_comparison(left) != normalize_comparison(right)
        ]
        if differences != item["comparisonDifferences"]:
            raise ValueError(f"Unreviewed comparison difference for {roman}")
        for correction in item["corrections"]:
            index = correction["line"] - 1
            before, after = correction["before"], correction["after"]
            if lines[index].count(before) != 1:
                raise ValueError(f"Correction input changed for {roman}.{index + 1}")
            lines[index] = lines[index].replace(before, after)
        lines = [re.sub(r"\s*—\s*", " — ", line).strip() for line in lines]
        record = {
            "id": f"jacopone-ferri-{number:02}",
            "title": item["title"],
            "author": "Jacopone da Todi",
            "authorOriginal": "Iacopone da Todi",
            "authorId": "jacopone-da-todi",
            "authorYears": "d. c. 1306",
            "country": "Italy",
            "language": "Italian",
            "lang": "it",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Medieval · exact year not established here",
            "era": "Medieval",
            "form": "Lauda",
            "collection": "Le Laude · Ferri 1915",
            "themes": ["Faith"] if number == 93 else [],
            "mood": "paper",
            "context": (
                f"Lauda {roman} in Giovanni Ferri’s 1915 printing of the 1490 collection. "
                "Wikisource and Gutenberg are separate transcriptions of the same edition, not independent historical editions. "
                + item["note"]
            ),
            "contextSource": f"https://www.gutenberg.org/files/29977/29977-h/29977-h.htm#{roman}",
            "contextSourceTitle": "Project Gutenberg · another transcription of Ferri’s 1915 edition",
            "sourceTitle": f"Wikisource · Le Laude, Ferri 1915, no. {roman}",
            "source": item["source"],
            "rights": RIGHTS,
            "text": arrange(lines, item["stanzas"], item["textSha256"]),
            "translations": [],
        }
        if item.get("displayTitle"):
            record["displayTitle"] = item["displayTitle"]
        records.append(record)
    return records


def make_records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    if [item["number"] for item in manifest["jacopone"]] != [18, 28, 32, 33, 93]:
        raise ValueError("Unexpected reviewed selection")
    for filename, expected in manifest["scanSha256"].items():
        if digest((directory / filename).read_bytes()) != expected:
            raise ValueError(f"Reviewed scan changed: {filename}")
    return [francis_record(directory, manifest["francis"]), *jacopone_records(directory, manifest)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory with the reviewed scans and transcriptions")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(make_records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Records differ from the reviewed sources")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

#!/usr/bin/env -S uv run --no-project --with beautifulsoup4 python
"""Reproduce the manually scan-reviewed Auta de Souza selection."""

import argparse
import hashlib
import json
import re
import runpy
import unicodedata
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/auta-horto-reviewed.json"
OUTPUT = ROOT / "content/poems/auta-horto-reviewed.json"
HELPERS = runpy.run_path(str(ROOT / "scripts/import-machado.py"))
RIGHTS = (
    "Historical original and 1910 edition are public domain in the United States. "
    "Wikisource transcription by contributors under CC BY-SA 4.0: "
    "https://creativecommons.org/licenses/by-sa/4.0/; see linked article and scan-page "
    "histories for contributors; check local law."
)


def digest(data):
    if isinstance(data, str):
        data = data.encode("utf8")
    return hashlib.sha256(data).hexdigest()


def comparable(line):
    line = unicodedata.normalize("NFC", line).replace("’", "'")
    for char in "“”«»":
        line = line.replace(char, '"')
    return re.sub(r'\s*"\s*', '"', line).strip()


def from_start(lines, start):
    if lines.count(start) != 1:
        raise ValueError(f"Expected one verse opening: {start}")
    return lines[lines.index(start):]


def differences(original, comparison):
    return [
        index for index, (left, right) in enumerate(zip(original, comparison), 1)
        if comparable(left) != comparable(right)
    ]


def records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    poems = manifest["poems"]
    if [item["slug"] for item in poems] != [
        "cantiga", "caminho", "nunca-mais", "bohemias", "regina", "supplica", "fio-partido"
    ]:
        raise ValueError("Unexpected reviewed selection")
    pages = {str(page) for item in poems for page in item["pages"]}
    if pages != set(manifest["scanSha256"]):
        raise ValueError("Scans do not cover exactly the reviewed pages")
    for page, expected in manifest["scanSha256"].items():
        if digest((directory / f"horto-{page}.jpg").read_bytes()) != expected:
            raise ValueError(f"Reviewed scan changed: {page}")

    output = []
    for item in poems:
        slug = item["slug"]
        source = BeautifulSoup((directory / f"{slug}.html").read_bytes(), "html.parser")
        url, quality = HELPERS["article"](source)
        raw = HELPERS["source_verse"](source)
        if url != item["source"] or quality != item["quality"] or digest(raw) != item["sourceTextSha256"]:
            raise ValueError(f"Wikisource revision, quality or transclusion changed for {slug}")
        scan_lines = [line for line in item["text"].splitlines() if line]
        source_lines = [line for line in raw.splitlines() if line and not re.fullmatch(r"[·. ]+", line)]
        start = item.get("sourceStart", scan_lines[0])
        source_lines = from_start(source_lines, start)
        if len(source_lines) != len(scan_lines) or differences(scan_lines, source_lines) != item["sourceDifferences"]:
            raise ValueError(f"Unreviewed Wikisource difference or boundary for {slug}")

        comparison_url = f"https://pt.wikisource.org/wiki/P%C3%A1gina:Horto_(1910).djvu/{item['pages'][0]}"
        comparison_title = "Wikisource · 1910 scan page"
        if "comparison" in item:
            comparison = BeautifulSoup((directory / f"comparison-{slug}.html").read_bytes(), "html.parser")
            body = comparison.select_one(".poem-body")
            if body is None:
                raise ValueError(f"Missing comparison text for {slug}")
            other = body.get_text("\n", strip=True)
            if digest(other) != item["comparisonSha256"]:
                raise ValueError(f"Later comparison changed for {slug}")
            other_lines = from_start(other.splitlines(), item.get("comparisonStart", start))
            other_lines = [line for line in other_lines if not line.startswith(("In: SOUSA,", "Janeiro, 1901"))]
            if (
                len(other_lines) != item["comparisonLines"]
                or len(other_lines) > len(scan_lines)
                or differences(scan_lines, other_lines) != item["comparisonDifferences"]
            ):
                raise ValueError(f"Unreviewed later-comparison difference or boundary for {slug}")
            comparison_url = item["comparison"]
            comparison_title = "Escritas.org · later comparison in modern spelling"

        context = (
            "Auta de Souza's original as printed in the second edition of Horto (1910). "
            "Historical spelling is retained; the exact composition date and place are not established here. "
            + item["note"]
        )
        output.append({
            "id": f"auta-horto-{slug}",
            "title": item["title"],
            "author": "Auta de Souza",
            "authorOriginal": "Auta de Sousa",
            "authorId": "auta-de-souza",
            "authorYears": "1876–1901",
            "country": "Brazil",
            "language": "Portuguese",
            "lang": "pt",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Printed 1910 · composition date not established here",
            "era": "Date not established",
            "form": "Sonnet" if slug in {"caminho", "supplica"} else "Verse",
            "collection": "Horto · second edition (1910)",
            "themes": ["Faith"] if slug in {"regina", "supplica", "fio-partido"} else [],
            "mood": "paper",
            "context": context,
            "contextSource": comparison_url,
            "contextSourceTitle": comparison_title,
            "sourceTitle": "Wikisource · Horto, second edition (1910)",
            "source": item["source"],
            "rights": RIGHTS,
            "text": item["text"],
            "translations": [],
        })
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory with the reviewed scans and transcriptions")
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

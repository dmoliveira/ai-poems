#!/usr/bin/env -S uv run --no-project --with beautifulsoup4 python
"""Reproduce the reviewed Machado selection from locally saved source pages.

The manifest pins article revisions, text, scan-checked corrections and
comparison results. Article revisions alone do not freeze transcluded pages.
"""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/machado-reviewed.json"
OUTPUT = ROOT / "content/poems/machado-reviewed.json"
GUTENBERG_SHA256 = "a6338d005f5e242a95d02a69d07fa86cdd3c25decbec4f294044209854aefa4c"


def digest(text):
    return hashlib.sha256(text.encode("utf8")).hexdigest()


def excluded(item, node):
    return any(
        isinstance(parent, Tag)
        and (
            parent.name in {"style", "script", "sup"}
            or set(parent.get("class", [])) & {"reference", "ws-noexport", "pagenum", "numeroriga", "numeroverso"}
        )
        for parent in item.parents
        if parent is not node
    )


def verse(node, stop_at_italic=False):
    result = ""
    for item in node.descendants:
        if stop_at_italic and isinstance(item, Tag) and item.name == "i":
            break
        if excluded(item, node):
            continue
        if isinstance(item, NavigableString):
            result += re.sub(r"\s+", " ", str(item))
        elif isinstance(item, Tag) and item.name == "br":
            result += "\n"
    return "\n".join(re.sub(r"\s+", " ", line).strip() for line in result.split("\n")).strip("\n")


def source_verse(soup):
    root = soup.select_one("#mw-content-text .prp-pages-output")
    if root is None:
        raise ValueError("Missing Wikisource transclusion")
    blocks = root.select("div.poem")
    if not blocks or any(block.select_one("div.poem, table, ul, ol, blockquote, h1, h2, h3") for block in blocks):
        raise ValueError("Unexpected Wikisource verse structure")
    completed = 0
    for block in blocks:
        current = ""
        for item in block.descendants:
            if isinstance(item, Tag) and set(item.get("class", [])) & {"numeroriga", "numeroverso"}:
                marker = item.get_text(strip=True)
                if not marker.isdigit() or int(marker) != completed + 1:
                    raise ValueError(f"Line marker {marker!r} disagrees with line {completed + 1}")
            if excluded(item, block):
                continue
            if isinstance(item, Tag) and item.name == "br":
                if current.strip():
                    completed += 1
                current = ""
            elif isinstance(item, NavigableString):
                current += re.sub(r"\s+", " ", str(item))
        if current.strip():
            completed += 1
    result = re.sub(r"\n{3,}", "\n\n", "\n".join(verse(block) for block in blocks)).strip()
    if len([line for line in result.split("\n") if line]) != completed:
        raise ValueError("Inconsistent verse extraction")
    return result


def gutenberg_verse(soup, anchor):
    marker = soup.find("a", id=anchor)
    if marker is None or marker.parent.name != "h4":
        raise ValueError(f"Missing 1901 heading {anchor}")
    parts = []
    for sibling in marker.parent.next_siblings:
        if not isinstance(sibling, Tag):
            continue
        if sibling.name == "h4" and sibling.find("a", id=True):
            break
        if sibling.name == "p" and sibling.find("br"):
            parts.append(verse(sibling))
    if not parts:
        raise ValueError(f"Missing 1901 verse for {anchor}")
    return re.sub(r"\n{3,}", "\n\n", "\n".join(parts)).strip()


def citador_verse(soup, title):
    heading = next((h for h in soup.select("div.panel-body h2") if h.get_text(strip=True) == title), None)
    body = heading.find_next_sibling("div") if heading else None
    if body is None:
        raise ValueError(f"Missing comparison text for {title}")
    return re.sub(r"\n{3,}", "\n\n", verse(body, stop_at_italic=True)).strip()


def layout(text):
    lines = [line for line in text.split("\n") if line]
    breaks, count = [], 0
    for chunk in text.split("\n\n")[:-1]:
        count += len([line for line in chunk.split("\n") if line])
        breaks.append(count)
    return lines, breaks


def comparable(text):
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(char if char.isalnum() else " " for char in text if not unicodedata.combining(char))
    return " ".join(text.split())


def article(soup):
    link = soup.select_one("#t-permalink a")
    quality = soup.select_one("table.pr_quality")
    if not link or not quality:
        raise ValueError("Missing article revision or proofreading status")
    return "https://pt.wikisource.org" + link["href"], quality.get("title", "")


def corrected(item, text):
    lines, original_breaks = layout(text)
    if original_breaks != item["sourceBreaks"]:
        raise ValueError(f"Source stanza layout changed for {item['slug']}")
    for change in item["corrections"]:
        index = change["line"] - 1
        if lines[index] != change["before"]:
            raise ValueError(f"Correction input changed for {item['slug']} line {index + 1}")
        lines[index] = change["after"]
    extras = item["restoredBreaks"]
    if len(set(extras)) != len(extras) or any(i <= 0 or i >= len(lines) or i in original_breaks for i in extras):
        raise ValueError(f"Invalid restored stanza break for {item['slug']}")
    breaks = set(original_breaks + extras)
    return "\n".join(line + ("\n" if i in breaks else "") for i, line in enumerate(lines, 1))


def records(directory):
    raw_pg = (directory / "gutenberg-1901.html").read_bytes()
    if hashlib.sha256(raw_pg).hexdigest() != GUTENBERG_SHA256:
        raise ValueError("The 1901 comparison source changed")
    pg = BeautifulSoup(raw_pg, "html.parser")
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    if len(manifest) != 23 or len({item["slug"] for item in manifest}) != len(manifest):
        raise ValueError("Unexpected reviewed selection")
    output = []
    for item in manifest:
        slug = item["slug"]
        source = BeautifulSoup((directory / f"{slug}.html").read_bytes(), "html.parser")
        source_url, quality = article(source)
        if source_url != item["source"] or quality != item["quality"] or "0 página não revista" not in quality:
            raise ValueError(f"Article revision or proofreading status changed for {slug}")
        raw_text = source_verse(source)
        if digest(raw_text) != item["sourceSha256"]:
            raise ValueError(f"Wikisource transclusion changed for {slug}")
        text = corrected(item, raw_text)
        lines, _ = layout(text)
        if len(lines) != item["lines"] or digest(text) != item["sha256"]:
            raise ValueError(f"Output changed for {slug}")
        if item["comparisonKind"] == "gutenberg":
            compared = gutenberg_verse(pg, item["comparisonKey"])
            comparison_url = f"https://www.gutenberg.org/cache/epub/61653/pg61653-images.html#{item['comparisonKey']}"
            comparison_title = "Project Gutenberg · 1901 edition for comparison"
        elif item["comparisonKind"] == "citador":
            comparison = BeautifulSoup((directory / f"citador-{slug}.html").read_bytes(), "html.parser", from_encoding="utf-8")
            compared = citador_verse(comparison, item["title"])
            comparison_url = item["comparisonUrl"]
            comparison_title = "Citador · comparison in modern spelling"
        else:
            raise ValueError(f"Unknown comparison for {slug}")
        other, _ = layout(compared)
        if digest("\n".join(other)) != item["comparisonSha256"] or len(lines) != len(other):
            raise ValueError(f"Comparison text or boundary changed for {slug}")
        differences = [i for i, (a, b) in enumerate(zip(lines, other), 1) if comparable(a) != comparable(b)]
        if differences != item["comparisonDifferences"]:
            raise ValueError(f"Unreviewed comparison differences for {slug}")
        if item["edition"] == 1902:
            context = (
                "From Occidentaes in Machado de Assis's Poesias Completas, first published in 1901. "
                "This original follows Wikisource's scan-backed 1902 edition; the 1901 transcription is linked for comparison."
            )
            source_title = "Wikisource · Poesias Completas, 1902 edition"
            collection = "Occidentaes"
        else:
            context = (
                "From Machado de Assis's Chrysalidas (1864). This original follows the scan-backed Wikisource "
                "transcription; a separately linked transcription is provided for comparison."
            )
            source_title = "Wikisource · Chrysalidas, 1864 edition"
            collection = "Chrysalidas"
        context += " Historical spelling is retained; the composition date and place are not established here."
        if item["contextNote"]:
            context += " " + item["contextNote"]
        if slug == "lindoya":
            comparison_url = "https://www.academia.org.br/academicos/basilio-da-gama/textos-escolhidos"
            comparison_title = "Academia Brasileira de Letras · Basílio da Gama, O Uraguai"
        output.append({
            "id": f"machado-{slug}",
            "title": item["title"],
            "author": "Machado de Assis",
            "authorId": "machado-de-assis",
            "authorYears": "1839–1908",
            "country": "Brazil",
            "language": "Portuguese",
            "lang": "pt",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Composition date not established",
            "era": "19th century" if item["edition"] == 1864 else "Date not established",
            "form": "Sonnet" if slug == "soneto-natal" else "Verse",
            "collection": collection,
            "themes": ["Faith"] if slug == "fe" else [],
            "mood": "paper",
            "context": context,
            "contextSource": comparison_url,
            "contextSourceTitle": comparison_title,
            "sourceTitle": source_title,
            "source": source_url,
            "rights": (
                "Historical original and edition are public domain in the United States. "
                "Transcription by Wikisource contributors under CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/; "
                "see the linked article and scan-page histories for contributors; check local law."
            ),
            "text": text,
            "translations": [],
        })
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the reviewed source HTML files")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Committed records differ from reviewed source extraction")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

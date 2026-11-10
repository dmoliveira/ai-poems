#!/usr/bin/env -S uv run --no-project --with beautifulsoup4 python
"""Reproduce the scan-reviewed Stampa and Colonna sonnets from saved sources."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/italian-women-sonnets.json"
OUTPUT = ROOT / "content/poems/italian-women-sonnets.json"
QUALITY = "1 pagina riletta, 0 pagine solo trascritte e 0 pagine incomplete"
ROMANS = ("I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII")
EXPECTED = (
    *(("stampa", number) for number in range(1, 13)),
    *(("colonna-love", number) for number in range(1, 5)),
    *(("colonna-spiritual", number) for number in range(1, 11)),
)
EXPECTED_SCANS = {
    "stampa-1554-full.pdf", "stampa-salza-1913.djvu", "colonna-1760.djvu",
    *(f"stampa-1554-leaf-{page:03}.png" for page in range(22, 29)),
    *(f"stampa-1913-leaf-{page:03}.jpg" for page in range(11, 18)),
    *(f"colonna-1760-leaf-{page:03}.jpg" for page in (53, 54, 55, 133, 134, 135, 136, 137, 138)),
}
RIGHTS = (
    "The historical original and cited pre-1931 edition are public domain in the United States. "
    "Wikisource transcription by contributors under CC BY-SA 4.0: "
    "https://creativecommons.org/licenses/by-sa/4.0/; consult the linked article and "
    "scan-page histories for contributors. Check local law."
)


def digest(value):
    return hashlib.sha256(value.encode("utf8") if isinstance(value, str) else value).hexdigest()


def article(path, expected):
    soup = BeautifulSoup(path.read_bytes(), "html.parser")
    link = soup.select_one("#t-permalink a")
    quality = soup.select_one("table.pr_quality")
    if not link or "https://it.wikisource.org" + link.get("href", "") != expected:
        raise ValueError(f"Article revision changed: {path.name}")
    if not quality or quality.get("title") != QUALITY:
        raise ValueError(f"Proofreading status changed: {path.name}")
    return soup


def hidden(node, block):
    for ancestor in node.parents:
        if ancestor is block:
            return False
        if isinstance(ancestor, Tag) and (
            ancestor.name in {"style", "script", "sup"}
            or set(ancestor.get("class", []))
            & {"numeroriga", "numeropagina", "pagenum", "reference", "noprint", "ws-noexport", "dropinitial"}
        ):
            return True
    return False


def verse(soup, group):
    root = soup.select_one("#mw-content-text .prp-pages-output")
    blocks = root.select("div.poem") if root else []
    if len(blocks) != 1:
        raise ValueError("Expected one transcluded sonnet")
    block = blocks[0]
    if block.select_one("div.poem, table, ul, ol, blockquote, h1, h2, h3, h4, pre"):
        raise ValueError("Unexpected nested verse structure")
    if len(block.select("div.dropinitial")) != (0 if group == "stampa" else 1):
        raise ValueError("Unexpected decorative initial")
    pieces, markers = [], []
    for node in block.descendants:
        if isinstance(node, Tag) and "numeroriga" in node.get("class", []):
            value = node.get_text(strip=True)
            completed = len([line for line in "".join(pieces).split("\n") if line.strip()])
            if not value.isdigit() or int(value) != completed:
                raise ValueError(f"Incorrect verse marker {value!r}")
            markers.append(int(value))
        if hidden(node, block):
            continue
        if isinstance(node, Tag) and "dropinitial" in node.get("class", []):
            initial = node.get_text("", strip=True)
            if not re.fullmatch(r"[A-Z](?:[’'])?", initial):
                raise ValueError("Unrecognized decorative initial")
            pieces.append(initial)
        elif isinstance(node, Tag) and node.name == "br":
            pieces.append("\n")
        elif isinstance(node, NavigableString):
            pieces.append(re.sub(r"\s+", " ", str(node).replace("\ufeff", "")))
    expected_markers = [] if group == "stampa" else [4, 8, 11, 14]
    if markers != expected_markers:
        raise ValueError("Unexpected sonnet line markers")
    lines = [line.strip() for line in "".join(pieces).split("\n") if line.strip()]
    if len(lines) != 14:
        raise ValueError("The sonnet is not exactly fourteen lines")
    if group != "stampa":
        lines[0] = re.sub(r"^\w+", lambda match: match.group().capitalize(), lines[0])
    return [unicodedata.normalize("NFC", line) for line in lines]


def edited_lines(raw, edits):
    lines = raw.copy()
    seen = set()
    for edit in edits:
        index = edit["line"] - 1
        if index in seen or not 0 <= index < 14 or lines[index] != edit["before"]:
            raise ValueError(f"Scan correction no longer applies: line {index + 1}")
        seen.add(index)
        lines[index] = edit["after"]
    return lines


def arranged(lines):
    return "\n\n".join("\n".join(lines[start:end]) for start, end in ((0, 4), (4, 8), (8, 11), (11, 14)))


def build_records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    if set(manifest["scanSha256"]) != EXPECTED_SCANS:
        raise ValueError("Unexpected reviewed scan selection")
    for filename, expected in manifest["scanSha256"].items():
        if digest((directory / filename).read_bytes()) != expected:
            raise ValueError(f"Reviewed scan changed: {filename}")
    items = manifest["poems"]
    if tuple((item["group"], item["number"]) for item in items) != EXPECTED:
        raise ValueError("Unexpected reviewed selection")
    output = []
    for item in items:
        group, number = item["group"], item["number"]
        roman, leaf = ROMANS[number - 1], item["scanLeaf"]
        if item["roman"] != roman:
            raise ValueError(f"Incorrect sonnet number: {group} {number}")
        soup = article(directory / f"{group}-{number:03}.html", item["source"])
        root = soup.select_one("#mw-content-text .prp-pages-output")
        pages = [int(node["data-pagenum"]) for node in root.select("span.numeropagina[data-pagenum]")]
        prefix = "stampa-1913" if group == "stampa" else "colonna-1760"
        if pages != [leaf] or f"{prefix}-leaf-{leaf:03}.jpg" not in manifest["scanSha256"]:
            raise ValueError(f"Unexpected scan page: {group} {number}")
        raw = verse(soup, group)
        if digest("\n".join(raw)) != item["sourceSha256"]:
            raise ValueError(f"Transcribed sonnet changed: {group} {number}")
        lines = edited_lines(raw, item["corrections"])
        text = arranged(lines)
        if digest(text) != item["sha256"] or item["title"] != lines[0].rstrip(".,;:?!"):
            raise ValueError(f"Reviewed sonnet changed: {group} {number}")
        edit_note = " ".join(
            f"Line {edit['line']}: “{edit['before']}” → “{edit['after']}”." for edit in item["corrections"]
        )
        common = (
            "The title is the first line; punctuation and accents may follow the Wikisource transcription "
            "rather than the print. Spacing and decorative initials are normalized, and stanza breaks "
            "are editorial. Exact composition date and place are not established here; Italy is a poet "
            "association. " + (f"Transcription correction: {edit_note} " if edit_note else "")
        )
        if group == "stampa":
            comparison = item["comparisonPdfPage"]
            if (
                comparison != (22 if number == 1 else 22 + number // 2)
                or f"stampa-1554-leaf-{comparison:03}.png" not in manifest["scanSha256"]
            ):
                raise ValueError(f"Unexpected 1554 comparison page: {number}")
            author, years, author_id = "Gaspara Stampa", "c. 1523–1554", "gaspara-stampa"
            collection = "Rime d’amore · Salza edition (1913)"
            context = (
                f"Sonnet {roman} in Salza's 1913 edition; its numbering and headings are editorial, "
                "not asserted as Stampa's own or as the 1554 sequence. Salza's headings are omitted. "
                "The fourteen lines were checked against that printing and occur as a separately "
                "printed poem in the Basel 1554 copy. " + common + item.get("note", "")
            )
            context_source = f"https://www.e-rara.ch/bau_1/download/pdf/1615631#page={comparison}"
            context_title = f"Basel University Library · 1554 Rime, PDF page {comparison}"
            source_title = f"Wikisource · Stampa, Salza 1913, sonnet {roman}"
            themes = []
        else:
            author, years, author_id = "Vittoria Colonna", "c. 1490–1547", "vittoria-colonna"
            spiritual = group == "colonna-spiritual"
            label = "Sonetti spirituali" if spiritual else "Rime, first sequence"
            collection = f"{label} · Bergamo edition (1760)"
            context = (
                f"Sonetto {roman} in the 1760 Bergamo {label}; the spiritual and first sequences "
                "are numbered separately. Its fourteen lines and following boundary were checked "
                "against this printing, not every textual tradition. " + common + item.get("note", "")
            )
            context_source = f"https://it.wikisource.org/wiki/Pagina:Colonna_-_Rime,_1760.djvu/{leaf}"
            context_title = f"Wikisource · 1760 scan, p. {leaf - 52}"
            source_title = f"Wikisource · Colonna, 1760, {label}, Sonetto {roman}"
            themes = ["Faith"] if spiritual else []
        output.append({
            "id": f"{group}-{number:03}",
            "title": item["title"],
            "author": author,
            "authorOriginal": author,
            "authorId": author_id,
            "authorYears": years,
            "country": "Italy",
            "language": "Italian",
            "lang": "it",
            "direction": "ltr",
            "year": None,
            "yearLabel": "16th century · exact year not established here",
            "era": "16th century",
            "form": "Sonnet",
            "collection": collection,
            "themes": themes,
            "mood": "paper",
            "context": context.strip(),
            "contextSource": context_source,
            "contextSourceTitle": context_title,
            "sourceTitle": source_title,
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
    rendered = json.dumps(build_records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Records differ from the reviewed sources")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

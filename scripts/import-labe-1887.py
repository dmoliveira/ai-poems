#!/usr/bin/env python3
"""Reproduce scan-collated Labé sonnets from saved Wikisource page snapshots."""

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/labe-1887-reviewed.json"
OUTPUT = ROOT / "content/poems/labe-1887-reviewed.json"
ROMANS = (
    "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII",
    "XIII", "XIIII", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI", "XXII", "XXIII", "XXIIII",
)
COMPARISONS = (67, 68, 72, 73, 78, 79, 80, 81, 82, 84, 85, 86, 87)
EXPECTED_SCANS = {
    *(f"labe-1887-{page:03}.jpg" for page in range(107, 122)),
    *(f"labe-1910-{page:03}.jpg" for page in COMPARISONS),
}
DISCUSSION = "https://www.france-memoire.fr/qui-etait-louise-labe-2/"
RIGHTS = (
    "The historical original and 1887 edition are public domain in the United States. "
    "Wikisource transcription by contributors under CC BY-SA 4.0: "
    "https://creativecommons.org/licenses/by-sa/4.0/; consult the linked scan-page "
    "histories for contributors. Check local law."
)


def digest(value):
    return hashlib.sha256(value.encode("utf8") if isinstance(value, str) else value).hexdigest()


def extract_pages(pages):
    """Extract numbered sonnets across page turns without treating them as new works."""
    items, current = [], None
    for page in pages:
        source = page["wikitext"]
        source = re.sub(r"<noinclude>.*?</noinclude>", "", source, flags=re.DOTALL)
        source = re.sub(r"<nowiki\s*/>", "", source)
        source = re.sub(r"\{\{Version sonore\|.*?\}\}", "", source)
        source = re.sub(r"\{\{t2\|.*?\}\}|\{\{c\|.*?\}\}|\{\{brn\|.*?\}\}", "", source)
        source = re.sub(r"\{\{PM\|([^|]+)\|([^}]+)\}\}", r"\1\2", source)
        source = source.replace("{{tab}}", "").replace("ſ", "s").replace("Ô", "O")
        source = re.sub(r"</?(?:poem|i)>\s*", "", source)
        for part in re.split(r"(\{\{t3\|[IVX]+\.\|.*?\}\})", source):
            heading = re.fullmatch(r"\{\{t3\|([IVX]+)\.\|.*?\}\}", part)
            if heading:
                current = {"roman": heading.group(1), "scans": [], "lines": []}
                items.append(current)
            elif current:
                for line in part.splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    if "{{" in line or "<" in line:
                        raise ValueError(f"Unexpected markup on page {page['page']}: {line}")
                    current["lines"].append(line)
                    if page["page"] not in current["scans"]:
                        current["scans"].append(page["page"])
    if tuple(item["roman"] for item in items) != ROMANS or any(len(item["lines"]) != 14 for item in items):
        raise ValueError("Unexpected sonnet numbering or verse length")
    return items


def corrected(lines, edits):
    lines = lines.copy()
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


def records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    if set(manifest["scanSha256"]) != EXPECTED_SCANS:
        raise ValueError("Unexpected scan selection")
    for name, expected in manifest["scanSha256"].items():
        if digest((directory / name).read_bytes()) != expected:
            raise ValueError(f"Reviewed scan changed: {name}")
    pages = json.loads((directory / "labe-1887-wikisource-snapshots.json").read_text(encoding="utf8"))
    if [page["page"] for page in pages] != list(range(107, 122)):
        raise ValueError("Unexpected Wikisource page sequence")
    if set(manifest["pageSnapshots"]) != {str(page["page"]) for page in pages}:
        raise ValueError("Unexpected snapshot selection")
    for page in pages:
        expected = manifest["pageSnapshots"][str(page["page"])]
        if page["revision"] != expected["revision"] or digest(page["wikitext"]) != expected["sha256"]:
            raise ValueError(f"Wikisource page snapshot changed: {page['page']}")
    inputs = extract_pages(pages)
    if [item["number"] for item in manifest["poems"]] != list(range(1, 25)):
        raise ValueError("Unexpected reviewed sonnet selection")

    output = []
    for item, raw in zip(manifest["poems"], inputs, strict=True):
        number = item["number"]
        if item["roman"] != raw["roman"] or item["scans"] != raw["scans"]:
            raise ValueError(f"Sonnet heading or page boundary changed: {number}")
        if digest("\n".join(raw["lines"])) != item["sourceSha256"]:
            raise ValueError(f"Source transcription changed: {number}")
        lines = corrected(raw["lines"], item["corrections"])
        text = arranged(lines)
        if digest(text) != item["sha256"] or item["title"] != lines[0].rstrip(".,;:?!"):
            raise ValueError(f"Reviewed text changed: {number}")
        first, last = item["scans"][0] - 14, item["scans"][-1] - 14
        pages_label = str(first) if first == last else f"{first}–{last}"
        title = f"Page:Labé - Œuvres, t. 1-2, éd. Boy, 1887.djvu/{item['scans'][0]}"
        source = "https://fr.wikisource.org/w/index.php?" + urlencode({
            "title": title, "oldid": manifest["pageSnapshots"][str(item["scans"][0])]["revision"],
        })
        context = (
            f"Sonnet {item['roman']} in the 1887 Boy edition, pp. {pages_label}; "
            "its complete fourteen lines and printed boundary were checked against that copy. "
            "These sonnets were published under Labé's name in 1555. Mireille Huchon proposed "
            "a male-authored literary hoax; Michèle Clément and Michel Jourde dispute that "
            "hypothesis using archival and publication evidence. "
            "The first line supplies the title. Long s and spacing are normalized, stanza "
            "breaks are editorial, and punctuation and accents may follow Wikisource. "
            "Composition date and place are not established here; France is associated with the poet. "
            + item.get("note", "")
        )
        output.append({
            "id": f"labe-1887-{number:02}",
            "title": item["title"],
            "author": "Louise Labé",
            "authorOriginal": "Louïze Labé",
            "authorId": "louise-labe",
            "authorYears": "c. 1524–1566",
            "country": "France",
            "language": "Italian" if number == 1 else "French",
            "lang": "it" if number == 1 else "fr",
            "direction": "ltr",
            "year": None,
            "yearLabel": "1555 collection · composition date not established here",
            "era": "Renaissance",
            "form": "Sonnet",
            "collection": "Sonnets · Boy edition (1887)",
            "themes": [],
            "mood": "paper",
            "context": context.strip(),
            "contextSource": DISCUSSION,
            "contextSourceTitle": "France Mémoire · Clément and Jourde on the Œuvres",
            "sourceTitle": f"Wikisource · Labé, Boy 1887, sonnet {item['roman']}, pp. {pages_label}",
            "source": source,
            "rights": RIGHTS,
            "text": text,
            "translations": [],
        })
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory with pinned snapshots and reviewed scans")
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

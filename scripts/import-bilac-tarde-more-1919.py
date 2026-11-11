#!/usr/bin/env python3
"""Reproduce three further reviewed Bilac sonnets from pinned 1919 scans."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/bilac-tarde-more-1919.json"
READING = ROOT / "scripts/sources/bilac-tarde-more-1919.txt"
OUTPUT = ROOT / "content/poems/bilac-tarde-more-1919.json"
SCANS = {"tarde-1919.pdf", "tarde-hathitrust-1919.djvu"}
SELECTED = ["fogo", "remorso", "symphonia"]
ESCRITAS = "https://www.escritas.org/pt/t/4899/remorso"
RECANTO = "https://www.recantodasletras.com.br/poesias-de-desilusao/7729174"


def digest_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def readings(items):
    source = READING.read_text(encoding="utf8")
    if source != unicodedata.normalize("NFC", source) or not source.endswith("\n"):
        raise ValueError("Readings must be NFC and end with a newline")
    parts = re.split(r"^=== ([a-z]+) ===\n", source, flags=re.MULTILINE)
    if parts.pop(0) or len(parts) != 2 * len(items):
        raise ValueError("Unexpected reading sections")
    output = {}
    for item in items:
        slug, raw = parts.pop(0), parts.pop(0)
        if slug != item["slug"]:
            raise ValueError("Unexpected reading order")
        text = raw.strip()
        if [len(stanza.splitlines()) for stanza in text.split("\n\n")] != [4, 4, 3, 3]:
            raise ValueError(f"Unexpected sonnet structure: {slug}")
        if any(line != line.strip() or "  " in line for line in text.splitlines()):
            raise ValueError(f"Unexpected whitespace: {slug}")
        if hashlib.sha256(text.encode("utf8")).hexdigest() != item["textSha256"]:
            raise ValueError(f"The reviewed reading changed: {slug}")
        output[slug] = text
    return output


def records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    witnesses = manifest["witnesses"]
    if set(witnesses) != SCANS:
        raise ValueError("Both reviewed scans are required")
    for name, witness in witnesses.items():
        if digest_file(directory / name) != witness["sha256"]:
            raise ValueError(f"The reviewed scan has changed: {name}")
    items = manifest["poems"]
    if [item["slug"] for item in items] != SELECTED:
        raise ValueError("Unexpected reviewed selection")
    text = readings(items)
    notes = {
        "fogo": "The 1919 title is Fogo fatuo; a modern comparison calls it Fogo-fátuo. ",
        "remorso": (
            "The 1919 printing reads ‘esperdicei’ and ‘calando’. Escritas.org gives "
            "‘desperdicei’; a separate online posting citing a 1970 edition gives "
            "‘calado’. We retain the 1919 wording; that cited edition was not "
            "independently checked. "
        ),
        "symphonia": "The 1919 title is Symphonia; a modern comparison calls it Sinfonia. ",
    }
    output = []
    for item in items:
        for field in ("printedPages", "uspLeaves", "princetonLeaves"):
            pages = item[field]
            if len(pages) != 2 or pages[1] != pages[0] + 1:
                raise ValueError(f"Unexpected {field}: {item['slug']}")
        first, last = item["printedPages"]
        context = (
            notes[item["slug"]]
            + "This complete sonnet follows the Princeton/HathiTrust copy of the "
            "posthumous 1919 Tarde and was checked line by line against the USP "
            "copy. They are copies of the same printing, not independent editions. "
            "Modern transcriptions were comparison aids, not the historical or "
            "rights basis. Historical wording and much of the spelling are retained; "
            "spacing, punctuation, some diacritics and typographic apostrophes are "
            "normalized for reading. This is not a diplomatic edition or a claim about "
            "a final author-approved text. Brazil is associated with Bilac, not "
            "asserted as the composition place; the composition date is not established here."
        )
        rights = (
            "The original as published in 1919 is public domain in the United States; "
            "Wikimedia Commons marks the Princeton scan public domain. USP requests "
            "noncommercial use and no online republication without authorization for its "
            "comparison scan; its images are linked, not reproduced. Check local law."
        )
        if item["slug"] == "remorso":
            rights += (
                f" The {RECANTO} posting is a comparison aid that cites a 1970 edition "
                "and carries a CC BY-NC 2.5 Brazil notice; it was not used as the "
                "historical text or rights basis."
            )
        poem = {
            "id": f"bilac-tarde-1919-{item['slug']}",
            "title": item["title"],
            "author": "Olavo Bilac",
            "authorId": "olavo-bilac",
            "authorYears": "1865–1918",
            "country": "Brazil",
            "language": "Portuguese",
            "lang": "pt",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Published 1919 · composition date not established",
            "era": "Date not established",
            "form": "Sonnet",
            "collection": "Tarde (1919)",
            "themes": [],
            "mood": "paper",
            "context": context,
            "contextSource": ESCRITAS if item["slug"] == "remorso" else f"{witnesses['tarde-1919.pdf']['url']}#page={item['uspLeaves'][0]}",
            "contextSourceTitle": "Escritas.org · modern comparison" if item["slug"] == "remorso" else f"USP · comparison copy, pp. {first}–{last}",
            "sourceTitle": f"Wikimedia Commons · Princeton copy of Tarde (1919), pp. {first}–{last}",
            "source": f"{witnesses['tarde-hathitrust-1919.djvu']['url']}?page={item['princetonLeaves'][0]}",
            "rights": rights,
            "text": text[item["slug"]],
            "translations": [],
        }
        if "displayTitle" in item:
            poem["displayTitle"] = item["displayTitle"]
            poem["displayTitleLang"] = "pt"
        output.append(poem)
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the two reviewed scans")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Records differ from the reviewed transcriptions")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Reproduce ten Poe readings from the pinned 1900 Gutenberg transcription."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/poe-1900.json"
OUTPUT = ROOT / "content/poems/poe-1900.json"
EVIDENCE = {
    "pg76996.txt": "c5a676010d4c071819f42c4a471cee5cfcf9baec9d41c0a4101e76d1b341eb2a",
    "poe-1900.pdf": "fa8832989d630f0666e7fb693cf37c4386b091370e419528e16cdfa788c87865",
}
SELECTED = (
    "raven", "bells", "annabel-lee", "city-in-the-sea", "conqueror-worm",
    "sleeper", "dreamland", "eldorado", "dream-within-a-dream", "haunted-palace",
)
GUTENBERG = "https://www.gutenberg.org/ebooks/76996"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def extract(book, item):
    # Bound the extraction to the collection's separately headed poems, not the
    # contents or quotations of the same lines later in the volume.
    book = book.split("\nTHE RAVEN\n", 1)[1]
    book = "\nTHE RAVEN\n" + book.split("\nPOEMS WRITTEN IN YOUTH\n", 1)[0]
    heading = "\n" + item["heading"] + "\n"
    following = "\n" + item["nextHeading"] + "\n"
    if book.count(heading) != 1 or book.count(following) != 1:
        raise ValueError(f"Ambiguous poem heading: {item['slug']}")
    raw = book.split(heading, 1)[1].split(following, 1)[0]
    pattern = r"\[Illustration(?:: [^\]]*)?\]"
    illustrations = re.findall(pattern, raw, flags=re.DOTALL)
    if len(illustrations) != item["illustrations"]:
        raise ValueError(f"Unexpected illustration markup: {item['slug']}")
    raw = re.sub(pattern, "", raw, flags=re.DOTALL)
    if "[" in raw or "]" in raw:
        raise ValueError(f"Unrecognized markup: {item['slug']}")
    rows = [line.strip().replace("_", "") for line in raw.splitlines()]
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(rows)).strip()
    if item["slug"] == "bells":
        # Gutenberg has a blank at the p. 15/16 page turn within section II.
        old = "On the moon!\n\nOh, from out the sounding cells,"
        if text.count(old) != 1:
            raise ValueError("The Bells page-turn boundary changed")
        text = text.replace(old, old.replace("\n\n", "\n"))
    if [len(part.splitlines()) for part in text.split("\n\n")] != item["segments"]:
        raise ValueError(f"Unexpected verse or section boundaries: {item['slug']}")
    lines = text.splitlines()
    if lines[0] != item["first"] or lines[-1] != item["last"]:
        raise ValueError(f"Unexpected first or last line: {item['slug']}")
    if digest(text.encode("utf8")) != item["textSha256"]:
        raise ValueError(f"Reviewed reading changed: {item['slug']}")
    return text


def records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    witnesses = manifest["witnesses"]
    if {name: item["sha256"] for name, item in witnesses.items()} != EVIDENCE:
        raise ValueError("Unexpected reviewed evidence")
    for name, expected in EVIDENCE.items():
        if digest((directory / name).read_bytes()) != expected:
            raise ValueError(f"Reviewed evidence changed: {name}")
    items = manifest["poems"]
    if tuple(item["slug"] for item in items) != SELECTED:
        raise ValueError("Unexpected reviewed selection")
    book = (directory / "pg76996.txt").read_text(encoding="utf8").replace("\r\n", "\n")
    output = []
    for item in items:
        start, end = item["printedPages"]
        first_leaf, last_leaf = item["pdfLeaves"]
        if first_leaf > last_leaf or start > end:
            raise ValueError(f"Unexpected page mapping: {item['slug']}")
        pages = str(start) if start == end else f"{start}–{end}"
        context = (
            f"A complete poem as printed in the 1900 Poems of Edgar Allan Poe, pp. {pages}. "
            "This reading follows Project Gutenberg's transcription and was compared with "
            "a University of California scan of the same edition, using OCR and visual checks "
            "of verse, boundaries and page turns. Gutenberg's source copy is not identified. "
            "Indentation and italics are omitted; this is not a diplomatic transcription "
            "or a claim to a final author-approved text. The United States is associated "
            "with Poe, not asserted as the poem's composition place; its exact composition "
            "date is not established here."
        )
        if item["slug"] == "raven":
            context += (
                " This printing reads ‘darkness gave no token’, ‘not an instant’ and "
                "‘sign of parting’; the Academy of American Poets' 1849 comparison reads "
                "‘stillness gave no token’, ‘not a minute’ and ‘sign in parting’."
            )
        if item["slug"] == "bells":
            context += (
                " Its four numbered parts form one work; the line count includes the four "
                "part headings. The Gutenberg blank at the page turn within part II is "
                "removed, not treated as a new stanza."
            )
        output.append({
            "id": f"poe-1900-{item['slug']}",
            "title": item["title"],
            "author": "Edgar Allan Poe",
            "authorId": "edgar-allan-poe",
            "authorYears": "1809–1849",
            "country": "United States",
            "language": "English",
            "lang": "en",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Published in 1900 edition · composition date not established",
            "era": "19th century",
            "form": "Poem",
            "collection": "The Poems of Edgar Allan Poe · 1900 edition",
            "themes": [],
            "mood": "paper",
            "context": context,
            "contextSource": f"{witnesses['poe-1900.pdf']['url']}#page={first_leaf}",
            "contextSourceTitle": f"Internet Archive · 1900 scan, pp. {pages}",
            "sourceTitle": "Project Gutenberg · The Poems of Edgar Allan Poe (eBook 76996)",
            "source": GUTENBERG,
            "rights": (
                "The originals and 1900 printing are public domain in the United States; "
                "check local law. Gutenberg marks its eBook public domain in the US and "
                "credits Chris Curnow, Turgut Dincer, Linda Cantoni and the Online Distributed "
                "Proofreading Team. The scan is linked, not reproduced."
            ),
            "text": extract(book, item),
            "translations": [],
        })
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the reviewed source files")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Records differ from the reviewed readings")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

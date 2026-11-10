#!/usr/bin/env python3
"""Reproduce scan-reviewed May Ziadé poems from pinned Wikisource pages."""

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/may-ziade-fleurs-reviewed.json"
OUTPUT = ROOT / "content/poems/may-ziade-fleurs-reviewed.json"
PDF = "fleurs-de-reve-1911.pdf"
PDF_SHA256 = "cb19a354da073f305bc8855aa575b2f405120f04cd2f52abccd4523b397e0086"
SNAPSHOT_SET_SHA256 = "631ed1ffd0bc957e338a065bb06552d8c16a496a7c8b2fe1ddfb1693b015fe49"
SELECTION = (
    ("a-la-lune", "À la lune", (25,)),
    ("a-pauline", "À Pauline", (26,)),
    ("superstition", "Superstition", (27, 28)),
    ("apres-le-travail", "Après le travail", (33, 34)),
    ("a-mon-cousin", "À mon cousin", (35,)),
    ("immortelles", "Immortelles", (41,)),
    ("un-matin", "Un matin", (42, 43)),
    ("acte-de-foi", "Acte de foi", (51,)),
    ("a-la-muse", "À la muse", (52,)),
    ("automne", "Automne", (53, 54)),
    ("a-mademoiselle-c", "À mademoiselle C.", (55,)),
    ("balance-toi", "Balance-toi !", (60, 61, 62)),
    ("le-printemps-sendort", "Le printemps s’endort", (68, 69)),
    ("abord", "Abord", (76,)),
    ("en-foret", "En forêt", (79, 80)),
    ("ennui", "Ennui", (83,)),
    ("crepuscule", "Crépuscule", (84, 85)),
    ("espoir", "Espoir !", (96,)),
)
BIOGRAPHY = "https://poets.org/poet/may-ziadeh"
RIGHTS = (
    "The historical work and pre-1931 printing are public domain in the United States. "
    "Transcription adapted from Wikisource contributors under CC BY-SA 4.0: "
    "https://creativecommons.org/licenses/by-sa/4.0/; see the linked page and subsequent "
    "page histories for contributors. Check local law."
)


def digest(value):
    return hashlib.sha256(value.encode("utf8") if isinstance(value, str) else value).hexdigest()


def extract_page(wikitext):
    matches = re.findall(r"<poem>(.*?)</poem>", wikitext, flags=re.DOTALL)
    if len(matches) != 1:
        raise ValueError("Expected one poem block on each selected page")
    verse = matches[0]
    verse = re.sub(r"\{\{em\|\d+\}\}", "", verse)
    verse = re.sub(r"\{\{sc\|([^{}]+)\}\}", r"\1", verse)
    # The first correction-template argument represents Wikisource's reading of the print.
    verse = re.sub(r"\{\{corr\|([^{}|]+)\|[^{}|]+\}\}", r"\1", verse)
    if "{{" in verse or "<" in verse:
        raise ValueError("Unexpected verse markup")
    return "\n".join(line.strip() for line in verse.strip().splitlines())


def reviewed_text(item, pages):
    text = "\n\n".join(extract_page(pages[str(page)]["wikitext"]) for page in item["pages"])
    for edit in item["corrections"]:
        if text.count(edit["before"]) != 1:
            raise ValueError(f"Scan correction no longer applies: {item['id']}")
        text = text.replace(edit["before"], edit["after"], 1)
    if digest(text) != item["sha256"]:
        raise ValueError(f"Reviewed text changed: {item['id']}")
    if [len(stanza.splitlines()) for stanza in text.split("\n\n")] != item["stanzas"]:
        raise ValueError(f"Stanza boundaries changed: {item['id']}")
    return text


def records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    if manifest["scanSha256"] != PDF_SHA256 or digest((directory / PDF).read_bytes()) != PDF_SHA256:
        raise ValueError("Reviewed PDF changed")
    pages = manifest["pageSnapshots"]
    expected_pages = {str(page) for _, _, numbers in SELECTION for page in numbers}
    if set(pages) != expected_pages:
        raise ValueError("Unexpected source-page selection")
    snapshot_set = [
        (int(number), page["revision"], page["sha256"])
        for number, page in sorted(pages.items(), key=lambda entry: int(entry[0]))
    ]
    if digest(json.dumps(snapshot_set, separators=(",", ":"))) != SNAPSHOT_SET_SHA256:
        raise ValueError("Wikisource revision set changed")
    for number, page in pages.items():
        if not isinstance(page["revision"], int) or digest(page["wikitext"]) != page["sha256"]:
            raise ValueError(f"Wikisource snapshot changed: {number}")
    items = manifest["poems"]
    if tuple((item["id"], item["title"], tuple(item["pages"])) for item in items) != SELECTION:
        raise ValueError("Unexpected work or page selection")

    output = []
    for item in items:
        text = reviewed_text(item, pages)
        first, last = item["pages"][0], item["pages"][-1]
        label = str(first) if first == last else f"{first}–{last}"
        source = "https://fr.wikisource.org/w/index.php?" + urlencode({
            "title": f"Page:Isis Copia - Fleurs de rêve, 1911.pdf/{first}",
            "oldid": pages[str(first)]["revision"],
        })
        context = (
            f"From Fleurs de rêve, pp. {label}, published under May Ziadé’s pseudonym Isis Copia. "
            "The linked Wikisource transcription was checked against the scanned printing, "
            "including its beginning and end; completeness refers to that printing. "
            "Wikisource and the Academy of American Poets date the collection 1911; "
            "the printed preface is dated Cairo, 1 March 1911. Indentation, spacing, "
            "capital accents and some punctuation are normalized. Palestine, Lebanon and Egypt "
            "are associations with the poet or publication, not claims about this poem’s "
            "place of composition; its composition date is not established here. "
            + item["note"]
        )
        output.append({
            "id": f"may-ziade-fleurs-{item['id']}",
            "title": item["title"],
            "author": "May Ziadé",
            "authorOriginal": "مي زيادة",
            "authorId": "may-ziade",
            "authorYears": "1886–1941",
            "country": "Palestine / Lebanon / Egypt",
            "language": "French",
            "lang": "fr",
            "direction": "ltr",
            "year": None,
            "yearLabel": "1911 collection · composition date not established",
            "era": "Date not established",
            "form": "Poetry",
            "collection": "Fleurs de rêve · Isis Copia",
            "themes": item["themes"],
            "mood": "paper",
            "context": context.strip(),
            "contextSource": BIOGRAPHY,
            "contextSourceTitle": "Academy of American Poets · May Ziadeh",
            "sourceTitle": f"Wikisource · Fleurs de rêve, pp. {label}",
            "source": source,
            "rights": RIGHTS,
            "text": text,
            "translations": [],
        })
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the reviewed PDF")
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

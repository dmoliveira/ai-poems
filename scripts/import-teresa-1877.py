#!/usr/bin/env python3
"""Reproduce reviewed Teresa records after checking the saved source scans."""

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/teresa-1877-reviewed.json"
OUTPUT = ROOT / "content/poems/teresa-1877-reviewed.json"
NUMBERS = (1, 4, 5, 6, 7, 9, 10, 15, 16, 25, 26)
PAGES = (509, 510, 511, 512, 513, 514, 517)
SCANS = {
    "madrid-position-011.jpg", "toronto-title-page-09.jpg", "stanbrook-1913.pdf",
    *(f"toronto-djvu-page-{page + 46:03}.jpg" for page in PAGES),
    *(
        f"madrid-1877-position-{page + 48}.jpg" if page in (509, 510)
        else f"madrid-position-{page + 48}.jpg"
        for page in PAGES
    ),
}
CONTEXT_SOURCE = "https://teresavila.com/poesias/"
RIGHTS = (
    "The historical original and 1877 edition are public domain in the United States. "
    "Transcribed from the cited printing; check local law."
)
TRANSLATION_RIGHTS = (
    "The Benedictines of Stanbrook translation was published in 1913 and is public "
    "domain in the United States. Check local law."
)


def digest(value):
    return hashlib.sha256(value.encode("utf8") if isinstance(value, str) else value).hexdigest()


def checked_text(item):
    text = item["text"]
    if (
        text != text.strip()
        or digest(text) != item["sha256"]
        or [len(stanza.splitlines()) for stanza in text.split("\n\n")] != item["stanzas"]
        or any(not line.strip() for stanza in text.split("\n\n") for line in stanza.splitlines())
    ):
        raise ValueError("Reviewed text or stanza boundaries changed")
    return text


def make_records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    if set(manifest["sourceSha256"]) != SCANS:
        raise ValueError("Unexpected evidence files")
    for filename, expected in manifest["sourceSha256"].items():
        if digest((directory / filename).read_bytes()) != expected:
            raise ValueError(f"Reviewed source changed: {filename}")
    items = manifest["poems"]
    if tuple(item["number"] for item in items) != NUMBERS:
        raise ValueError("Unexpected selection or numbering")
    if sum("translation" in item for item in items) != 7:
        raise ValueError("Unexpected translation selection")
    output = []
    for item in items:
        number, pages = item["number"], item["pages"]
        if not pages or any(page not in PAGES for page in pages):
            raise ValueError(f"Unexpected source pages: {number}")
        text = checked_text(item)
        if item["title"] != text.splitlines()[0].rstrip(".,;:!?"):
            raise ValueError(f"Unexpected first-line title: {number}")
        page_label = str(pages[0]) if len(pages) == 1 else f"{pages[0]}–{pages[-1]}"
        source = (
            "https://bibliotecavirtualmadrid.comunidad.madrid/bvmadrid_publicacion/"
            f"es/media/group/1081220.do?position={pages[0] + 48}&presentation=page"
        )
        context = (
            f"Poem {item['roman']} in Vicente de la Fuente’s 1877 edition, pp. {page_label}; "
            "the complete printed text and boundary were checked in that edition, not all witnesses. "
            "Teresa de Jesús was a Spanish Carmelite and Catholic writer. The attribution and "
            "text of her poems have a complicated manuscript history; some copies and editions differ. "
            "Spain is associated with the poet, not a claim about this work’s place of composition. "
            "The first line supplies the title; spacing and punctuation are normalized. "
            + item.get("note", "")
        )
        translations = []
        if "translation" in item:
            translated = item["translation"]
            translated_text = checked_text(translated)
            if translated["stanzas"] != item["stanzas"]:
                raise ValueError(f"Unmatched translation boundaries: {number}")
            first = translated["pages"][0]
            last = translated["pages"][-1]
            translation_pages = str(first) if first == last else f"{first}–{last}"
            translations.append({
                "language": "English",
                "title": translated["title"],
                "text": translated_text,
                "translator": "Benedictines of Stanbrook · 1913",
                "source": f"https://archive.org/details/minorworksofstte00tere/page/n{first + 43}/mode/1up",
                "rights": (
                    f"{TRANSLATION_RIGHTS} The translation on pp. {translation_pages} "
                    "is a poetic rendering; it may differ in wording from the 1877 printing."
                ),
            })
        output.append({
            "id": f"teresa-fuente-1877-{number:02}",
            "title": item["title"],
            "author": "Teresa of Ávila",
            "authorOriginal": "Teresa de Jesús",
            "authorId": "teresa-of-avila",
            "authorYears": "1515–1582",
            "country": "Spain",
            "language": "Spanish",
            "lang": "es",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Printed 1877 · composition date not established here",
            "era": "Renaissance",
            "form": "Poetry",
            "collection": "Escritos de Santa Teresa · Fuente edition (1877)",
            "themes": ["Faith"],
            "mood": "paper",
            "context": context.strip(),
            "contextSource": CONTEXT_SOURCE,
            "contextSourceTitle": "Monte Carmelo · Teresa’s poetry and manuscripts",
            "sourceTitle": f"Biblioteca Digital de Madrid · Fuente 1877, poem {item['roman']}, pp. {page_label}",
            "source": source,
            "rights": RIGHTS,
            "text": text,
            "translations": translations,
        })
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory with the pinned reviewed scans")
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

#!/usr/bin/env python3
"""Reproduce selected Blake reading texts checked against Met copy Y plates."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/blake-copy-y-readings.txt"
OUTPUT = ROOT / "content/poems/blake-copy-y.json"
READINGS_SHA256 = "f7384f0efd6f766bf5cc3ba482a50430b40239bc75dc4fb9dacbfbac17c115fb"
EVIDENCE = {
    "met-347905-lamb.jpg": "fc5223405ead48e6216fed296696ed03cc82b69401eef90e57cd900062f11000",
    "met-347934-infant-joy.jpg": "0041a3ed30d5f7e9d6c429f5dd0b2293da9d932f1527159d583e64fbe1868512",
    "met-347973-sick-rose.jpg": "1e1ab04a15be2e53bf5265444f0c5e3a33e822795c6c5ad6763cc77d5d3a1976",
    "met-347974-fly.jpg": "f5cdd12ebb9ffa1caf332d214baa71a5df746253880bb7892a0e58edd123bdfd",
    "met-347983-tyger.jpg": "4973f9b6a4a44c28dc3f2f53e66e9b6e8d6791c894440c22eb5c0a3310fdec67",
    "met-347980-rose-sunflower-lilly.jpg": "b6b5a9ddc52b6387bc95a0fe0b79116547a859c1ed446a01a495547ff5976e0d",
    "met-347987-garden-love.jpg": "0702722e0504f76641d90f45b9cf1bc91311b97f4e41a0c49a8369b172d48ff5",
    "met-347997-london.jpg": "a377a7c8e7c72914b00db250d3cf07e63c51c866857a074bfa5cb09ca50c9f90",
    "met-348004-infant-sorrow.jpg": "6117251a129558f452f6a4dfcafe9dc660d38c61ecebafdb590d81ce8ff9f173",
    "met-348006-poison-tree.jpg": "5a2ba63da6ac05394534b62831f6afba2590b9e65be056c1f55e19f73f78a3e8",
    "pg1934.txt": "d448789b9325f717a4bfa28170c84cfdb1e31b17c8b7100e372d55ff43818cc2",
}

# Each stanza count describes complete reading lines, not physical rows on the plate.
# Copy Y plate numbers and object IDs are the Met's, not another copy's ordering.
SELECTION = (
    ("lamb", "The Lamb", 347905, 8, 1789, (10, 10),
     "The plate reads 'Dost' and 'wooly'; Gutenberg's 1901 edition has 'Does' and 'woolly'."),
    ("infant-joy", "Infant Joy", 347934, 25, 1789, (6, 6), ""),
    ("sick-rose", "The Sick Rose", 347973, 39, 1794, (4, 4), ""),
    ("fly", "The Fly", 347974, 40, 1794, (4, 4, 4, 4, 4),
     "The plate's left column is read from top to bottom before its right column."),
    ("tyger", "The Tyger", 347983, 42, 1794, (4, 4, 4, 4, 4, 4),
     "The plate reads 'Tyger' and 'sieze'; Gutenberg's 1901 edition has 'Tiger' and 'seize'."),
    ("pretty-rose-tree", "My Pretty Rose Tree", 347980, 43, 1794, (4, 4),
     "Plate 43 contains three separately titled poems, counted separately."),
    ("sun-flower", "Ah! Sun-Flower", 347980, 43, 1794, (4, 4),
     "Plate 43 contains three separately titled poems, counted separately."),
    ("lilly", "The Lilly", 347980, 43, 1794, (4,),
     ("Plate 43 contains three separately titled poems, counted separately. The last word "
      "'bright' wraps below the preceding verse line and is rejoined here. 'The Lily' is "
      "an alternate display spelling; the plate's title is 'The Lilly'.")),
    ("garden-of-love", "The Garden of Love", 347987, 44, 1794, (4, 4, 4),
     ("The plate wraps 'rounds' below its verse line; the word is rejoined here. "
      "The plate's 'flow'rs' is expanded to 'flowers' in the tomb-stones line.")),
    ("london", "London", 347997, 46, 1794, (4, 4, 4, 4), ""),
    ("infant-sorrow", "Infant Sorrow", 348004, 48, 1794, (4, 4),
     "The plate reads 'swadling'; Gutenberg's 1901 edition has 'swaddling'."),
    ("poison-tree", "A Poison Tree", 348006, 49, 1794, (4, 4, 4, 4), ""),
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def parse_readings(raw):
    if digest(raw) != READINGS_SHA256:
        raise ValueError("Reviewed readings changed")
    parts = re.split(r"^=== ([a-z0-9-]+) ===\n", raw.decode("utf8"), flags=re.MULTILINE)
    if parts.pop(0) or len(parts) != len(SELECTION) * 2:
        raise ValueError("Unexpected readings format")
    readings = [(parts[i], parts[i + 1].strip()) for i in range(0, len(parts), 2)]
    if tuple(slug for slug, _ in readings) != tuple(row[0] for row in SELECTION):
        raise ValueError("Unexpected selection or order")
    return readings


def records(directory):
    for name, expected in EVIDENCE.items():
        if digest((directory / name).read_bytes()) != expected:
            raise ValueError(f"Reviewed evidence changed: {name}")
    readings = parse_readings(READINGS.read_bytes())
    result = []
    for row, (_, text) in zip(SELECTION, readings, strict=True):
        slug, title, obj, plate, engraving, counts, note = row
        if tuple(len(stanza.splitlines()) for stanza in text.split("\n\n")) != counts:
            raise ValueError(f"Unexpected verse boundaries: {slug}")
        if any(line != line.strip() for line in text.splitlines()):
            raise ValueError(f"Unexpected whitespace: {slug}")
        context = (
            f"A complete poem on plate {plate} of the Metropolitan Museum's copy Y of "
            "Songs of Innocence and of Experience, printed about 1825. The verse and its "
            "boundaries were checked against the linked plate image, with Project Gutenberg "
            "eBook 1934 used as a comparison aid; that 1901 edition is not copy Y. This is "
            "a reading transcription, not a diplomatic edition: spacing, punctuation, "
            "some apostrophes, contractions and typographic details are normalized, and "
            "wrapped verse lines are rejoined. England identifies an association with Blake, not an "
            "established place of composition; the exact composition year is not asserted."
        )
        if note:
            context += " " + note
        poem = {
            "id": f"blake-copy-y-{slug}",
            "title": title,
            "author": "William Blake",
            "authorId": "william-blake",
            "authorYears": "1757–1827",
            "country": "England",
            "language": "English",
            "lang": "en",
            "direction": "ltr",
            "year": None,
            "yearLabel": f"Plate dated [{engraving}] · copy printed c. 1825",
            "era": "Romanticism",
            "form": "Poem",
            "collection": "Songs of Innocence and of Experience · copy Y",
            "themes": [],
            "mood": "paper",
            "context": context,
            "contextSource": "https://www.gutenberg.org/ebooks/1934",
            "contextSourceTitle": "Project Gutenberg · Songs of Innocence and of Experience, eBook 1934",
            "sourceTitle": f"The Metropolitan Museum of Art · copy Y, plate {plate}",
            "source": f"https://www.metmuseum.org/art/collection/search/{obj}",
            "rights": (
                "The historical poems and print are public domain in the United States; "
                "check local law. The Met marks the image public domain and credits Rogers "
                "Fund, 1917; the image is linked, not republished. Gutenberg credits "
                "David Price for its comparison eBook."
            ),
            "text": text,
            "translations": [],
        }
        if slug == "lilly":
            poem["displayTitle"] = "The Lily"
        result.append(poem)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the reviewed evidence")
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

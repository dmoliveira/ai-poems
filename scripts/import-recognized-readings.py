#!/usr/bin/env python3
"""Reproduce four individually documented historical readings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-readings.json"
READINGS_SHA256 = "61a95ae62b4a1ede8d3d8594adf3781723cec9364ff0d35ee62356dfd4b3deb9"

# These hashes identify the consulted witnesses; they do not prove transcription accuracy.
EVIDENCE = {
    "yosano-aozora-koigoromo.html": "489e575ec7dfbc0572da7ff5e614227dcf9ed0d045a6d85eba8ff685534bd284",
    "keats-indicator-1820-p248.jpg": "c83e41821571b2ecb04f4af7b1cbb9661d1a1ea7ffa1ba96724ee226b306fdd1",
    "dunbar-mask-1896-p167.jpg": "5b237edd962b0a5d09c8bdadc74888a82ce11080c5ed99a45a5dcefbfb698ddf",
    "dunbar-sympathy-1899.jpg": "e7100d8227a687ab06f263c34051e83c01786df2963b9f9781cc15c398da54fb",
}

DUNBAR_RECEPTION = (
    "https://webapp2.wright.edu/web1/newsroom/2023/06/28/"
    "wright-state-special-collections-and-archives-conserves-rare-books-by-paul-laurence-dunbar/"
)
WORKS = [
    {
        "key": "yosano-kimi-shinitamau", "title": "君死にたまふことなかれ",
        "displayTitle": "Kimi shinitamau koto nakare", "displayTitleLang": "ja-Latn",
        "author": "Akiko Yosano", "authorOriginal": "与謝野晶子", "authorId": "akiko-yosano",
        "authorYears": "1878–1942", "country": "Japan", "language": "Japanese", "lang": "ja",
        "year": 1905, "yearLabel": "1905 book printing · first published in 1904",
        "era": "20th century", "form": "Verse", "collection": "恋衣 · 1905", "lines": 41,
        "sourceTitle": "Aozora Bunko · 恋衣, 1905 edition via 1980 facsimile",
        "source": "https://www.aozora.gr.jp/cards/000318/files/2086_15764.html",
        "reception": "https://www.asahi.com/ajw/articles/14626592",
        "detail": (
            "Yosano's poem first appeared in Myōjō in 1904; this complete five-stanza reading follows "
            "Aozora's modern-kanji, historical-kana transcription of the 1905 book via a 1980 facsimile, "
            "not a directly inspected historical scan. The prefatory line about her brother at Port Arthur "
            "is retained; the displayed line count includes it. Other printings differ. The romanized title "
            "is a discovery label. A linked newspaper account discusses the poem's later antiwar reception."
        ),
        "rights": (
            "The 1905 original is public domain in the United States; copyright and moral rights vary by "
            "jurisdiction, so check local law. Aozora Bunko permits reuse of its expired-copyright texts: "
            "https://www.aozora.gr.jp/guide/kijyunn.html. 恋衣, Hongo Shoin, 1905; source edition: "
            "Nihon Kindai Bungakukan photographic reprint, 1 April 1980. Input: 武田秀男; proofreading: "
            "kazuishi; file first registered and last updated 2 June 2004. "
            "Source record: https://www.aozora.gr.jp/cards/000318/card2086.html. Ruby readings and "
            "formatting are omitted, and stanza spacing is normalized."
        ),
    },
    {
        "key": "keats-belle-dame", "title": "La Belle Dame Sans Mercy", "titleLang": "fr",
        "displayTitle": "La Belle Dame sans Merci", "displayTitleLang": "fr", "author": "John Keats",
        "authorId": "john-keats", "authorYears": "1795–1821", "country": "England",
        "language": "English", "lang": "en", "year": 1820,
        "era": "19th century", "form": "Ballad", "collection": "The Indicator · 1820", "lines": 48,
        "sourceTitle": "The Indicator · 10 May 1820, p. 248",
        "source": "https://johnkeats.uvic.ca/images/facsimiles/laBelleDameIndicator.jpg",
        "reception": "https://johnkeats.uvic.ca/1819-04-21.html",
        "detail": (
            "The complete twelve-stanza first published reading is transcribed from The Indicator, "
            "where it appeared without Keats's name and ends before the page's 'Caviare' signature. "
            "It addresses a 'wretched wight' twice and reads 'sedge is wither'd' and 'thy cheek'; "
            "a later circulating version differs. 'La Belle Dame sans Merci' is a familiar alternative "
            "title used for discovery; the historical title is also shown. Editorial responsibility for "
            "differences is uncertain; the versions are not counted separately."
        ),
        "rights": (
            "The 1820 printing is public domain in the United States; copyright and moral rights vary by "
            "jurisdiction, so check local law. The scan is linked, not republished. The verse is "
            "transcribed from the historical page, with indentation and typography normalized."
        ),
    },
    {
        "key": "dunbar-we-wear-the-mask", "title": "We Wear the Mask", "author": "Paul Laurence Dunbar",
        "authorId": "paul-laurence-dunbar", "authorYears": "1872–1906", "country": "United States",
        "language": "English", "lang": "en", "year": 1896,
        "era": "19th century", "form": "Verse", "collection": "Lyrics of Lowly Life · 1896", "lines": 15,
        "sourceTitle": "Lyrics of Lowly Life · 1896, p. 167",
        "source": "https://commons.wikimedia.org/wiki/File:Lyrics_of_Lowly_Life_Dunbar_(1896).djvu?page=193",
        "reception": DUNBAR_RECEPTION,
        "detail": (
            "The 1896 printing gives the complete three-stanza poem on one page. A university archive "
            "identifies this and 'Sympathy' among Dunbar's best-known poems. A hanging printed wrap in the "
            "second line is rejoined; the refrain and the poem's direct address are retained."
        ),
        "rights": (
            "The 1896 printing is public domain in the United States; copyright and moral rights vary by "
            "jurisdiction, so check local law. The scan is linked, not republished. Reading adapted from "
            "English Wikisource contributors under CC BY-SA 4.0 "
            "(https://creativecommons.org/licenses/by-sa/4.0/), checked against the scan; pinned revision: "
            "https://en.wikisource.org/w/index.php?title=Page%3ALyrics_of_Lowly_Life_Dunbar_%281896%29.djvu%2F193&oldid=15845393."
        ),
    },
    {
        "key": "dunbar-sympathy", "title": "Sympathy", "author": "Paul Laurence Dunbar",
        "authorId": "paul-laurence-dunbar", "authorYears": "1872–1906", "country": "United States",
        "language": "English", "lang": "en", "year": 1899,
        "era": "19th century", "form": "Verse", "collection": "Lyrics of the Hearthside · 1899", "lines": 21,
        "sourceTitle": "Lyrics of the Hearthside · 1899, pp. 40–41",
        "source": "https://collections.libraries.indiana.edu/wyliehouse/items/show/743",
        "reception": DUNBAR_RECEPTION,
        "detail": (
            "The complete three-stanza poem spans two pages of the 1899 book. Indiana University's linked "
            "museum record joins the scanned excerpts. Wright State notes that its final line supplied the "
            "title of Maya Angelou's autobiography; the later book is not included or counted as this poem."
        ),
        "rights": (
            "The 1899 printing is public domain in the United States; copyright and moral rights vary by "
            "jurisdiction, so check local law. The museum scan is linked, not republished. The verse is "
            "transcribed from the historical pages, rejoining printed wraps and normalizing indentation."
        ),
    },
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build():
    if digest(READINGS) != READINGS_SHA256:
        raise ValueError("Reading snapshot changed")
    blocks = [block.strip() for block in re.split(r"(?m)^## ", READINGS.read_text(encoding="utf-8")) if block.strip()]
    readings = {}
    for block in blocks:
        key, text = block.split("\n", 1)
        if key in readings:
            raise ValueError(f"Duplicate reading: {key}")
        readings[key] = text.strip()
    if list(readings) != [work["key"] for work in WORKS]:
        raise ValueError("Unexpected reading selection or order")

    records = []
    for work in WORKS:
        text = readings[work["key"]]
        if sum(bool(line.strip()) for line in text.splitlines()) != work["lines"]:
            raise ValueError(f"Unexpected reading length: {work['key']}")
        record = {
            "id": "recognized-next-" + work["key"], "title": work["title"],
            **{key: work[key] for key in ("titleLang", "displayTitle", "displayTitleLang") if key in work},
            "author": work["author"],
            **{key: work[key] for key in ("authorOriginal",) if key in work},
            "authorId": work["authorId"], "authorYears": work["authorYears"], "country": work["country"],
            "language": work["language"], "lang": work["lang"], "direction": "ltr", "year": work["year"],
            "yearLabel": work.get("yearLabel", f"{work['year']} printing · not necessarily composition date"),
            "era": work["era"], "form": work["form"], "collection": work["collection"], "themes": [],
            "mood": "paper", "context": work["detail"] + (
                " Spacing and indentation are normalized; the associated country is not a claim "
                "about the place of composition."
            ),
            "sourceTitle": work["sourceTitle"], "source": work["source"],
            "contextSourceTitle": "Individual reception and context", "contextSource": work["reception"],
            "rights": work["rights"], "text": text, "translations": [],
        }
        records.append(record)
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    operation = parser.add_mutually_exclusive_group(required=True)
    operation.add_argument("--check", action="store_true")
    operation.add_argument("--write", action="store_true")
    parser.add_argument("--evidence-dir", type=Path)
    args = parser.parse_args()
    records = build()
    if args.evidence_dir:
        for filename, expected in EVIDENCE.items():
            if digest(args.evidence_dir / filename) != expected:
                raise ValueError(f"Witness does not match: {filename}")
    if args.write:
        OUTPUT.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {len(records)} historical readings.")
    else:
        if json.loads(OUTPUT.read_text(encoding="utf-8")) != records:
            raise ValueError("Catalogue differs from the reviewed readings")
        print(f"Verified {len(records)} historical readings" +
              ("; witness hashes match." if args.evidence_dir else "."))


if __name__ == "__main__":
    main()

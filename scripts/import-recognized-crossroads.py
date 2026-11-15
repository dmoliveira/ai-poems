#!/usr/bin/env python3
"""Reproduce four complete, individually documented historical readings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-crossroads-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-crossroads.json"
READINGS_SHA256 = "29339e242428a680856698274e0ddb1b99ef20e4be83492394c7b602196a7aaf"

# Hashes identify consulted witnesses; they do not establish transcription accuracy.
EVIDENCE = {
    "henley-bookverses-catalogued-1893.pdf": "052ae0b9db1ceea19ec863813062037d4c12aec752576cd9a7fe85194eb0c55b",
    "mistral-desolacion-1922-research.djvu": "50e8e3e0ac1bd6f895c9110e33a21b67e94240a7100ddc674e975e72b6999fef",
    "rilke-bilder-wisconsin-1906.pdf": "afb96c8714036a7d8a3414b1c1c7f94a1c801b407d82f31911e2eac5edc0cec2",
    "dario-cantos-1905.pdf": "a751d7728c21fa291b255631b820b6860c98c18c45e3ffbefccdf922361ff04a",
}

WORKS = [
    {
        "key": "henley-invictus", "title": "Invictus", "author": "William Ernest Henley",
        "authorId": "william-ernest-henley", "authorYears": "1849–1903", "country": "England",
        "language": "English", "lang": "en", "year": 1893,
        "yearLabel": "1893 printing · not necessarily composition date", "era": "19th century",
        "form": "Verse", "collection": "A Book of Verses · 1893", "lines": 16,
        "sourceTitle": "A Book of Verses · New York, 1893, pp. 56–57",
        "source": "https://archive.org/download/bookofverses00henluoft/bookofverses00henluoft.pdf#page=74",
        "reception": "https://www.victorianweb.org/authors/henley/invictus.html",
        "detail": (
            "The four complete stanzas occupy pages 56–57 of the 1893 fourth edition. "
            "The printed heading is IV, followed by the dedication 'To R. T. H. B.'; "
            "the verse is followed by the date 1875. Invictus is the later familiar title, "
            "not a second work. Other editions differ in punctuation and in the printed date."
        ),
        "rights": (
            "The 1893 printing is public domain in the United States; copyright and moral rights "
            "vary by jurisdiction, so check local law. The scan is linked, not republished. "
            "The verse was transcribed from the historical pages with OCR assistance; "
            "spacing and indentation are normalized. No modern translation or recording is included."
        ),
    },
    {
        "key": "mistral-balada", "title": "Balada", "author": "Gabriela Mistral",
        "authorId": "gabriela-mistral", "authorYears": "1889–1957", "country": "Chile",
        "language": "Spanish", "lang": "es", "year": 1922,
        "yearLabel": "1922 printing · not necessarily composition date", "era": "20th century",
        "form": "Verse", "collection": "Desolación · 1922", "lines": 24,
        "sourceTitle": "Desolación · New York, 1922, pp. 112–113",
        "source": "https://commons.wikimedia.org/wiki/File:Desolaci%C3%B3n_(colecci%C3%B3n_de_Mistral,_1922).djvu?page=134",
        "reception": "https://revistaliteratura.uchile.cl/index.php/RCL/article/download/41803/43356/145730",
        "detail": (
            "The complete four-stanza poem spans pages 112–113 of the New York printing. "
            "The scan prints initial 'El' without an accent and no punctuation after 'yo le vi pasar'; "
            "these features are retained. The linked university essay discusses this individual poem; "
            "its biographical interpretations are not established facts."
        ),
        "rights": (
            "The 1922 U.S. printing is public domain in the United States; copyright and moral rights "
            "vary by jurisdiction, so check local law, including in Chile. The scan is linked, not "
            "republished. This reading adapts Spanish Wikisource contributors under CC BY-SA 4.0 "
            "(https://creativecommons.org/licenses/by-sa/4.0/) and was checked against the scan. "
            "Pinned page revisions: https://es.wikisource.org/w/index.php?title=Página:Desolación_(colección_de_Mistral,_1922).djvu/134&oldid=1604056 ; "
            "https://es.wikisource.org/w/index.php?title=Página:Desolación_(colección_de_Mistral,_1922).djvu/135&oldid=1604054."
        ),
    },
    {
        "key": "rilke-herbsttag", "title": "Herbsttag", "author": "Rainer Maria Rilke",
        "authorId": "rainer-maria-rilke", "authorYears": "1875–1926", "country": "Austria",
        "language": "German", "lang": "de", "year": 1906,
        "yearLabel": "1906 printing · not necessarily composition date", "era": "20th century",
        "form": "Lyric", "collection": "Das Buch der Bilder · 1906", "lines": 12,
        "sourceTitle": "Das Buch der Bilder · second edition, 1906, p. 48",
        "source": "https://archive.org/download/DasBuchDerBilder2/DasBuchDerBilder2.pdf#page=49",
        "reception": "https://www.deutschland-lese.de/streifzuege/gedichte/herbstgedichte/herbsttag/",
        "detail": (
            "This complete three-stanza reading follows the second, expanded edition. "
            "The page prints 'Deinen', 'laß' and 'gieb', with fewer commas than some later "
            "readings; these are retained. The linked essay reports a 2000 WDR reader poll. "
            "The printing date does not establish the poem's composition date."
        ),
        "rights": (
            "The 1906 printing is public domain in the United States; copyright and moral rights "
            "vary by jurisdiction, so check local law. The scan is linked, not republished. "
            "This reading adapts German Wikisource contributors under CC BY-SA 4.0 "
            "(https://creativecommons.org/licenses/by-sa/4.0/) and was checked against the scan. "
            "Pinned transcription and contributor history: https://de.wikisource.org/w/index.php?title=Herbsttag&oldid=2353125."
        ),
    },
    {
        "key": "dario-lo-fatal", "title": "Lo fatal", "author": "Rubén Darío",
        "authorId": "ruben-dario", "authorYears": "1867–1916", "country": "Nicaragua",
        "language": "Spanish", "lang": "es", "year": 1905,
        "yearLabel": "1905 printing · not necessarily composition date", "era": "Modernismo",
        "form": "Verse", "collection": "Cantos de vida y esperanza · 1905", "lines": 13,
        "sourceTitle": "Cantos de vida y esperanza · Madrid, 1905, PDF p. 187",
        "source": "https://commons.wikimedia.org/wiki/File:Cantos_de_vida_y_esperanza_(1905).pdf?page=187",
        "reception": "https://www.elem.mx/obra/datos/222232",
        "detail": (
            "The 1905 volume prints this thirteen-line poem as XLI, dedicates it to René Pérez "
            "and ends the book with 'FIN'. The verse is complete as printed, not an excerpt. "
            "This reading retains the printing's capitalization, 'á donde' and unpaired final "
            "exclamation mark; later transcriptions differ. The linked 2013 book description "
            "names the poem among the collection's classics."
        ),
        "rights": (
            "The 1905 printing is public domain in the United States; copyright and moral rights "
            "vary by jurisdiction, so check local law. The scan is linked, not republished. "
            "The verse was transcribed from the historical page; spacing and indentation are "
            "normalized. No modern translation, commentary or recording is included."
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
        records.append({
            "id": "recognized-crossroads-" + work["key"], "title": work["title"],
            "author": work["author"], "authorId": work["authorId"], "authorYears": work["authorYears"],
            "country": work["country"], "language": work["language"], "lang": work["lang"],
            "direction": "ltr", "year": work["year"], "yearLabel": work["yearLabel"], "era": work["era"],
            "form": work["form"], "collection": work["collection"], "themes": [], "mood": "paper",
            "context": work["detail"] + (
                " Spacing and indentation are normalized; the associated country is not a claim "
                "about the place of composition."
            ),
            "sourceTitle": work["sourceTitle"], "source": work["source"],
            "contextSourceTitle": "Individual reception and context", "contextSource": work["reception"],
            "rights": work["rights"], "text": text, "translations": [],
        })
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

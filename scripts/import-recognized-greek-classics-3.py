#!/usr/bin/env python3
"""Reproduce two scan-compared Cavafy readings from Nea Zoi."""

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-greek-classics-3-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-greek-classics-3.json"
READINGS_SHA256 = "c7adb19b5157bd92f446ee9fe8ff52fdd3bb21f897dfbf9845a12f472bc0ecac"

# Hashes identify consulted copies, not transcription accuracy.
EVIDENCE = {
    "cavafy-city-nea-zoi-1910.pdf": "34fc68826a5db6666175f17f103a0ed338cc00c6dfce19dddfc6cbc74ea2e95f",
    "cavafy-barbarians-nea-zoi-1908.pdf": "db020aedb3c965ee6c28b13ff9a3998f655d62d3e45912ebb4622bf4d2eabc0e",
    "cavafy-barbarians-skokos-1907.pdf": "93a8ee7af47d165d42838881bde4f3d10a7b58d5080c6995652ba791559af4f2",
}


def wiki(title, revision):
    return "https://el.wikisource.org/w/index.php?title=" + quote(title.replace(" ", "_")) + f"&oldid={revision}"


WORKS = [
    {
        "key": "city", "title": "Η πόλις", "displayTitle": "The City", "revision": 91350,
        "contributor": "Origenis", "blocks": [8, 8], "year": None,
        "yearLabel": "1909–1910 printing · exact year uncertain", "aliases": ["The Town"],
        "sourceTitle": "Nea Zoi · volume 6, issue 4, page 129 (1909–1910)",
        "source": "https://kosmopolis.library.upatras.gr/index.php/nea_zoi/article/view/64853",
        "contextSourceTitle": "Words Without Borders · translating The City",
        "contextSource": "https://wordswithoutborders.org/read/article/2005-04/the-city-the-spirit-and-the-letter-on-translating-cavafy/",
        "context": (
            "The complete printing has two eight-line stanzas on page 129. It reads ‘Καινούριους’, "
            "‘θἄβρεις’ and ‘τὴν ζωή’, unlike the linked Wikisource transcription. The University of Patras catalogue "
            "assigns the issue to 1910; the Cavafy bibliography gives 1909–1910, so the exact printing "
            "year is left unset. A faint mark after ‘αὐτὰ’ is not treated as a certain comma. "
            "Words Without Borders discusses this poem and its translations individually."
        ),
    },
    {
        "key": "barbarians", "title": "Περιμένοντας τους βαρβάρους",
        "displayTitle": "Waiting for the Barbarians", "revision": 123405,
        "contributor": "Dada", "blocks": [1, 1, 2, 3, 3, 5, 6, 2, 2, 2, 4, 3, 2], "year": 1908,
        "yearLabel": "December 1908 printing · not necessarily composition date",
        "aliases": ["Τι περιμένουμε στην αγορά συναθροισμένοι"],
        "sourceTitle": "Nea Zoi · pages 98–99 (December 1908)",
        "source": "https://kosmopolis.library.upatras.gr/index.php/nea_zoi/article/view/64747",
        "contextSourceTitle": "The New Yorker · Waiting for the Barbarians",
        "contextSource": "https://www.newyorker.com/books/page-turner/waiting-for-the-barbarians-and-the-government-shutdown",
        "context": (
            "The 36-line dialogue spans pages 98–99; the six-line question about the officials crosses "
            "the page turn. The print reads ‘συνασθροισμένοι’, ‘σκαλιγμένα’ and ‘κ’ ἡ πλατέες’, "
            "possibly printing errors, and ends the penultimate line with a full stop. Its orators' reply "
            "differs from the linked modern Wikisource transcription. A shorter 1907-labelled almanac "
            "printing is a comparison, not a second work or source of inserted lines. Patras labels the "
            "issue 51–52; the Cavafy bibliography cites issue 51, December 1908. The New Yorker discusses "
            "the poem individually."
        ),
    },
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build():
    if digest(READINGS) != READINGS_SHA256:
        raise ValueError("Reading snapshot changed")
    parts = [part.strip() for part in re.split(r"(?m)^## ", READINGS.read_text(encoding="utf-8")) if part.strip()]
    readings = {}
    for part in parts:
        key, text = part.split("\n", 1)
        if key in readings:
            raise ValueError(f"Duplicate reading: {key}")
        readings[key] = text.strip()
    if list(readings) != [work["key"] for work in WORKS]:
        raise ValueError("Unexpected reading selection or order")
    records = []
    for work in WORKS:
        text = readings[work["key"]]
        if [len(block.splitlines()) for block in text.split("\n\n")] != work["blocks"]:
            raise ValueError(f"Unexpected printed boundaries: {work['key']}")
        transcription = wiki(work["title"], work["revision"])
        records.append({
            "id": f"recognized-greek-classics-3-cavafy-{work['key']}",
            "title": work["title"], "displayTitle": work["displayTitle"],
            "author": "C. P. Cavafy", "authorOriginal": "Κωνσταντίνος Π. Καβάφης",
            "authorId": "c-p-cavafy", "authorYears": "1863–1933", "country": "Egypt",
            "language": "Greek", "lang": "el", "direction": "ltr", "year": work["year"],
            "yearLabel": work["yearLabel"], "era": "20th century", "form": "Lyric",
            "collection": "Nea Zoi · 1908–1910", "themes": [], "mood": "paper",
            "searchAliases": work["aliases"],
            "context": (
                f"{work['context']} The reading adapts the cited Greek Wikisource transcription against "
                "the periodical scan; indentation, spacing and some punctuation and typography are normalized. "
                "Egypt is an associated place, not a composition-location claim."
            ),
            "sourceTitle": work["sourceTitle"], "source": work["source"],
            "contextSourceTitle": work["contextSourceTitle"], "contextSource": work["contextSource"],
            "rights": (
                "Greek original printed before 1931; public domain in the United States. The reading adapts "
                f"Greek Wikisource revision {work['revision']} begun by {work['contributor']} and edited by "
                f"contributors, under CC BY-SA 4.0: {transcription}. It is compared with the University of "
                "Patras Kosmopolis digitization, also offered under CC BY-SA 4.0 "
                "(https://creativecommons.org/licenses/by-sa/4.0/); the transcription has been modified. "
                "Copyright and moral rights vary; check local law. The scan is linked, not republished; "
                "no translation or recording is included."
            ),
            "text": text, "translations": [],
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

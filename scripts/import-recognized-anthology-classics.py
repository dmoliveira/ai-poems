#!/usr/bin/env python3
"""Reproduce six individually documented, historical anthology favourites."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-anthology-classics-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-anthology-classics.json"
READINGS_SHA256 = "c25ea394691601965135cc03802c0053bd2dda4cac200e592fe0f1ef4b57eeac"

# These hashes identify inspected PDFs, not the accuracy of their transcriptions.
EVIDENCE = {
    "browning-1898-duchess-copy2.pdf": "26fbbec1a1592cbe93a3854d09aa41d75f7c9f6ae59c404e51295d3b4056cefc",
    "hardy-1902-thrush.pdf": "0f0363aafa49edb2ece72880de89d3681461689b6a9f6aa0bd5a1e6401098803",
    "tennyson-1842-vol2.pdf": "56ba7fd7e722158c821b62739de5b76bed1230b708260c4f17d9d507b696ab9c",
    "oxford-cornell-1912.pdf": "0d6c99180ac9c901e5cb5439c4e931167ff059d5b6fede9a5a16b53574b96565",
    "oxford-1912-copy2.pdf": "737e70202e735e4cd0314b3a37ef1105680798e5468661c6941654c07217aa02",
}
RECEPTION = "https://www.poetryfoundation.org/articles/68445/hit-singles"

WORKS = [
    {
        "key": "browning-my-last-duchess", "title": "My Last Duchess", "author": "Robert Browning",
        "authorId": "robert-browning", "authorYears": "1812–1889", "year": 1898, "era": "19th century",
        "collection": "Dramatic Lyrics and Dramatic Romances · 1898", "stanzas": [56],
        "sourceTitle": "Dramatic Lyrics and Dramatic Romances · 1898 edition, pp. 143–145",
        "source": "https://archive.org/details/dramaticlyricsd01browgoog/page/n169/mode/1up",
        "detail": (
            "The complete fifty-six-line dramatic monologue is headed 'My Last Duchess. Ferrara.' "
            "in this edition of Browning's revised text. Its copyright page is dated 1898, but the "
            "scanned impression itself is undated. The earlier title 'Italy' identifies the same "
            "work, not another poem. The last lines precede a different work, 'Count Gismond', on p. 145; "
            "one hanging line wrap is rejoined."
        ),
        "editor": "Editors Charlotte Porter and Helen A. Clarke died in 1942 and 1926 respectively. ",
        "yearLabel": "1898 edition · scanned impression undated",
        "rightsOpening": "Browning's text in the edition catalogued and copyright-dated 1898 is public domain in the United States; ",
        "searchAliases": ["Italy"],
    },
    {
        "key": "herbert-love", "title": "Love", "displayTitle": "Love (III)",
        "author": "George Herbert", "authorId": "george-herbert", "authorYears": "1593–1633",
        "country": "Wales / England",
        "year": 1912, "era": "17th century", "collection": "The Oxford Book of English Verse · 1912",
        "stanzas": [6, 6, 6], "sourceTitle": "The Oxford Book of English Verse · 1912, p. 295",
        "source": "https://archive.org/details/cu31924011997909/page/n310/mode/1up",
        "detail": (
            "The anthology heads this complete eighteen-line poem 'Love'; 'Love (III)' distinguishes it "
            "from Herbert's other poems of that title. The anthology modernizes spelling and punctuation. "
            "The 'FINIS' and other closing matter after the poem in an early Temple printing are not verse."
        ),
        "editor": "Anthology editor Arthur Quiller-Couch died in 1944. ",
    },
    {
        "key": "hardy-darkling-thrush", "title": "The Darkling Thrush", "author": "Thomas Hardy",
        "authorId": "thomas-hardy", "authorYears": "1840–1928", "year": 1902, "era": "20th century",
        "collection": "Poems of the Past and the Present · 1902", "stanzas": [8, 8, 8, 8],
        "sourceTitle": "Poems of the Past and the Present · second edition, 1902, pp. 169–171",
        "source": "https://archive.org/details/poemsofpastprese00hardrich/page/n182/mode/1up",
        "detail": (
            "The four eight-line stanzas cross three pages of the second edition. The date 'December 1900' "
            "appears after the last stanza in this edition and is not another verse line."
        ),
    },
    {
        "key": "marvell-coy-mistress", "title": "To His Coy Mistress", "author": "Andrew Marvell",
        "authorId": "andrew-marvell", "authorYears": "1621–1678", "year": 1912, "era": "17th century",
        "collection": "The Oxford Book of English Verse · 1912", "stanzas": [20, 12, 14],
        "sourceTitle": "The Oxford Book of English Verse · 1912, pp. 387–388",
        "source": "https://archive.org/details/cu31924011997909/page/n402/mode/1up",
        "detail": (
            "The complete forty-six lines follow the anthology's modernized reading, including "
            "'wingèd' and 'Thorough'. Its second line ends without punctuation. A mark after 'gates' "
            "in one scan is absent from a second copy of this printing. Paragraph breaks follow "
            "the printed indentations; the editor's gloss is not part of the poem."
        ),
        "editor": "Anthology editor Arthur Quiller-Couch died in 1944. ",
    },
    {
        "key": "tennyson-ulysses", "title": "Ulysses", "author": "Alfred Tennyson",
        "authorId": "alfred-tennyson", "authorYears": "1809–1892", "year": 1842, "era": "19th century",
        "collection": "Poems · volume II · 1842", "stanzas": [32, 11, 27],
        "sourceTitle": "Poems · volume II, 1842, pp. 88–91",
        "source": "https://archive.org/details/tennysonpoems1842-02/page/n99/mode/1up",
        "detail": (
            "The complete seventy-line poem follows the 1842 volume II printing, including "
            "the spellings 'wherethro’' and 'Vext'; paragraph breaks follow the printed "
            "indentations. Later editions can differ in spelling and punctuation."
        ),
    },
    {
        "key": "waller-lovely-rose", "title": "Go, lovely Rose", "author": "Edmund Waller",
        "authorId": "edmund-waller", "authorYears": "1606–1687", "year": 1912, "era": "17th century",
        "collection": "The Oxford Book of English Verse · 1912", "stanzas": [5, 5, 5, 5],
        "sourceTitle": "The Oxford Book of English Verse · 1912, pp. 310–311",
        "source": "https://archive.org/details/cu31924011997909/page/n325/mode/1up",
        "detail": (
            "The anthology's complete four-stanza reading ends on p. 311, before its next poem. "
            "A later printing added a concluding stanza by Henry Kirke White; that addition is not "
            "part of this Waller reading or counted as another work. The anthology modernizes spelling."
        ),
        "editor": "Anthology editor Arthur Quiller-Couch died in 1944. ",
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
        if [len(stanza.splitlines()) for stanza in text.split("\n\n")] != work["stanzas"]:
            raise ValueError(f"Unexpected line or paragraph lengths: {work['key']}")
        record = {
            "id": "recognized-anthology-classics-" + work["key"], "title": work["title"],
            "author": work["author"], "authorId": work["authorId"], "authorYears": work["authorYears"],
            "country": work.get("country", "England"), "language": "English", "lang": "en", "direction": "ltr",
            "year": work["year"],
            "yearLabel": work.get("yearLabel", f"{work['year']} printing · not necessarily composition date"),
            "era": work["era"], "form": "Verse", "collection": work["collection"], "themes": [], "mood": "paper",
            "context": work["detail"] + (
                " Typography, spacing and indentation are normalized; the associated country "
                "is not a claim about where the poem was composed."
            ),
            "sourceTitle": work["sourceTitle"], "source": work["source"],
            "contextSourceTitle": "A survey of anthology appearances", "contextSource": RECEPTION,
            "rights": (
                work.get("rightsOpening", f"The {work['year']} printing is public domain in the United States; ")
                + f"{work['author']} died in {work['authorYears'].split('–')[-1]}. "
                + work.get("editor", "")
                + "Copyright and moral rights vary by jurisdiction, so check local law. "
                "The scan is linked, not republished; the verse was transcribed from its historical pages. "
                "No translation or recording is included."
            ),
            "text": text, "translations": [],
        }
        if "displayTitle" in work:
            record.update(displayTitle=work["displayTitle"], displayTitleLang="en")
        if "searchAliases" in work:
            record["searchAliases"] = work["searchAliases"]
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

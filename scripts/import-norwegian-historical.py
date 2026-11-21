#!/usr/bin/env python3
"""Reproduce seven complete Norwegian poems from identified historical printings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/norwegian-historical-readings.txt"
OUTPUT = ROOT / "content/poems/norwegian-historical.json"
READINGS_SHA256 = "2737f1d124fb4efbfb69f0382569b07e29ed5aa9759cb40b7d45a74cfca2d80c"
# These hashes identify consulted copies, not textual accuracy or copyright status.
EVIDENCE = {
    "bjornson-digte-1870-0140.jpg": "c99fb017328ef62072ad3d21d20cd0dd55a01f35cbed26a5177c0fbadda37961",
    "thoresen-digte-af-en-dame-kb.pdf": "8e59b6f6f3e14dcd460840b8bc61c30f8460b86b5b5be9e1562552d1f0616099",
    "krag-1891-0013.jpg": "4f7f095ac6a355c23d7f1e95ad364f7b6fb8dd2560d83df0be697af2999abeae",
    "krag-1891-0014.jpg": "ecf380ec4752f6a45595d93c2a5198726c03ac655989403277351dc5e8745a99",
    "krag-1891-0015.jpg": "b864cd5f3815e621ea778c101deea6c02ad4f86a042f9f499d0944e6247bed74",
    "krag-1891-0016.jpg": "0df3faa03db1d294cbed79d68c6927864cb0626f3b2da3ab1204e978a6e91d1c",
    "bull-1909-0065.jpg": "8a4da74d7152fc48e48ee768e7f0d3133fdd5ea9ada6f09c37ac73486dc343b2",
    "bull-1909-0066.jpg": "5af926c58d5e1defa9d833c51e605d67c233cf28cd9c7f7db3b2d3a57e53bf3f",
    "bull-1909-0138.jpg": "e80c21671a98cbcbb1b89a587031c431a3df91d2df42a88ebd7183c8451dfb37",
    "bull-1909-0139.jpg": "69eca3560160190b4cafa3c2505bec7dfa6eedc775604c7e2fb29a50e57e28a5",
    "bull-metope-1927-0007.jpg": "79e995e18e79f839e8df84305be4112c0b7cab903256d38bd17b6f7331da3a36",
    "bull-metope-1927-0008.jpg": "45fbaa56479f70646500b4a658c5fd47bbcec7e9b0de09e4155d83e934842e6e",
    "bull-metope-1927-0009.jpg": "8c00b441ecaa42c6e5a68250051fd9d139b2866154fa01a8c97f770acfc8a458",
    "bull-metope-1927-0010.jpg": "c1efe0227520df2fbca44bf09100acca5410375853fc02d69f67c8d2ad39df96",
    "hamsun-vilde-kor-1904-0043.jpg": "ced55ad8ae86b33a0ca00dde8a577f8ba3f15392e473a7a3cc9a1e103a3d9ae2",
    "hamsun-vilde-kor-1904-0044.jpg": "6c563429838368ca413974d0d956f9de7c06c8ffe829e8e65f056ba4c7aaf735",
}
NRK = "https://arkiv.nrk.no/blogg.nrk.no/bok/2016/07/07/de-100-beste-norske-diktene/index.html"
LANGUAGE_NOTE = (
    "Historical Norwegian written in a Danish-based orthography, not modernized Bokmål. "
    "Norway is an associated place, not a claim about composition location. "
    "Typeface, indentation, and some punctuation typography are normalized; witness wording "
    "and verse lineation are retained. Transcription error remains possible."
)
RIGHTS = (
    "Historical original printed before 1931; public-domain source status is recorded by the "
    "National Library of Norway. The scan is linked, not republished. Copyright, edition-related "
    "and moral rights vary by jurisdiction; check local law. No translation, score, or recording "
    "is included."
)
THORESEN_RIGHTS = (
    "The Royal Danish Library marks this 1861 work free of copyright and permits copying, changing, "
    "distributing, and presenting it, including for commercial purposes, with author attribution. "
    "The scan is linked, not republished. Copyright, edition-related, and moral rights may vary by "
    "jurisdiction. No translation, score, or recording is included."
)
WORKS = [
    {
        "key": "april",
        "blocks": [6, 6],
        "author": "Bjørnstjerne Bjørnson",
        "authorId": "bjornstjerne-bjornson",
        "authorYears": "1832–1910",
        "title": "Jeg vælger mig april",
        "id": "norwegian-historical-bjornson-jeg-vaelger-april",
        "year": 1870,
        "collection": "Digte og Sange · 1870",
        "sourceTitle": "Digte og Sange · 1870 · p. 130",
        "source": "https://www.nb.no/items/URN:NBN:no-nb_digibok_2013040824067?page=141",
        "searchAliases": ["Jeg velger meg april", "Jeg vælger mig April"],
        "context": (
            "This is the separately titled, complete two-stanza reading on p. 130 of the 1870 "
            "collection, not a claim of first publication. Museum Odense cites an earlier 1869 "
            "appearance and identifies the popular commissioning story as unverified. The familiar "
            "Lindeman melody dates to 1877; no musical setting is reproduced. NRK individually "
            "includes this poem in its critic-curated 2016 selection. " + LANGUAGE_NOTE
        ),
    },
    {
        "key": "jeg-har-sogt",
        "blocks": [4] * 12,
        "author": "Magdalene Thoresen",
        "authorId": "magdalene-thoresen",
        "authorYears": "1819–1903",
        "title": "Jeg har søgt",
        "id": "norwegian-historical-thoresen-jeg-har-sogt",
        "year": 1861,
        "collection": "Digte af en Dame · 1861 · second printing",
        "sourceTitle": "Digte af en Dame · 1861 · second printing · pp. 1–3",
        "source": "https://www.kb.dk/e-mat/dod/115408010587.pdf#page=12",
        "searchAliases": ["Jeg har søkt", "Giv min Længsel et Navn"],
        "rights": THORESEN_RIGHTS,
        "context": (
            "The 1861 scan separately heads this complete twelve-quatrain poem; it prints “enetse” "
            "and “hin salige Kvinde,” unlike Bokselskap’s “eneste” and “hin farlige Kvinde.” The "
            "scan reading is retained; “enetse” may be a printing error. Solberg (2006) describes "
            "the collection as a thematic cycle but each poem as autonomous. The title page credits "
            "Bjørnstjerne Bjørnson with publishing the collection; his specific textual contribution "
            "is not established. NRK separately selects the poem. " + LANGUAGE_NOTE
        ),
    },
    {
        "key": "fandango",
        "blocks": [12, 10, 9, 4, 7, 4, 4, 2],
        "author": "Vilhelm Krag",
        "authorId": "vilhelm-krag",
        "authorYears": "1871–1933",
        "title": "Fandango",
        "id": "norwegian-historical-krag-fandango",
        "year": 1891,
        "collection": "Digte · 1891",
        "sourceTitle": "Digte · 1891 · pp. 9–12",
        "source": "https://www.nb.no/items/URN:NBN:no-nb_digibok_2009051112004?page=14",
        "searchAliases": ["Ikke janitscharmusik"],
        "context": (
            "This complete, separately titled poem spans pp. 9–12 of Krag’s 1891 debut collection. "
            "Later printings are not combined or counted separately. NRK names the poem individually "
            "in its 2016 selection. " + LANGUAGE_NOTE
        ),
    },
    {
        "key": "fra-mezzaninvinduet",
        "blocks": [8, 8, 8, 8],
        "author": "Olaf Bull",
        "authorId": "olaf-bull",
        "authorYears": "1883–1933",
        "title": "Fra Mezzaninvinduet",
        "id": "norwegian-historical-bull-fra-mezzaninvinduet",
        "year": 1909,
        "collection": "Digte · 1909",
        "sourceTitle": "Digte · 1909 · pp. 65–66",
        "source": "https://www.nb.no/items/URN:NBN:no-nb_digibok_2007072610004?page=66",
        "searchAliases": ["Samtidige i rummets bleke dage"],
        "context": (
            "The 1909 scan prints this separately titled poem in four octaves on pp. 65–66. It "
            "reads “dunet” on p. 65; Kalliope’s transcription has “dundet.” The scan is followed "
            "here. This is separately titled from Bull’s 1927 poem Metope; thematic or critical "
            "kinship does not make them one work. NRK selects each individually. " + LANGUAGE_NOTE
        ),
    },
    {
        "key": "stenen",
        "blocks": [4, 4, 4, 4, 5, 1, 4, 1, 5],
        "author": "Olaf Bull",
        "authorId": "olaf-bull",
        "authorYears": "1883–1933",
        "title": "Stenen",
        "id": "norwegian-historical-bull-stenen",
        "year": 1909,
        "collection": "Digte · 1909",
        "sourceTitle": "Digte · 1909 · pp. 138–139",
        "source": "https://www.nb.no/items/URN:NBN:no-nb_digibok_2007072610004?page=139",
        "searchAliases": ["Jeg var i den yderste evighed"],
        "context": (
            "The 1909 witness separately titles this complete poem on pp. 138–139. Its comma "
            "after “rand,” is retained, rather than Bokselskap’s corrected full stop; the printed "
            "three-star divider and dash-only lines are also retained as source features. NRK names "
            "the individual poem in its 2016 selection. " + LANGUAGE_NOTE
        ),
    },
    {
        "key": "metope",
        "blocks": [11, 8, 9, 9, 9, 9, 9, 9],
        "author": "Olaf Bull",
        "authorId": "olaf-bull",
        "authorYears": "1883–1933",
        "title": "Metope",
        "id": "norwegian-historical-bull-metope",
        "year": 1927,
        "collection": "Metope · 1927",
        "sourceTitle": "Metope · 1927 · pp. 7–10",
        "source": "https://www.nb.no/items/URN:NBN:no-nb_digibok_2012051805123?page=8",
        "searchAliases": ["Dig vil jeg ømt i rytmer nagle fast"],
        "context": (
            "This complete, separately titled poem occupies eight stanzas in the 1927 collection. "
            "A stanza crosses the page 7–8 turn; no extra break is inserted there. The scan has "
            "“Aa ven” without a comma after “Aa”; Bokselskap adds one. Italic emphasis is not "
            "encoded. NRK individually selects this poem and Fra Mezzaninvinduet. " + LANGUAGE_NOTE
        ),
    },
    {
        "key": "skaergaardsø",
        "blocks": [8, 8, 8, 8],
        "author": "Knut Hamsun",
        "authorId": "knut-hamsun",
        "authorYears": "1859–1952",
        "title": "Skærgaardsø",
        "id": "norwegian-historical-hamsun-skaergaardso",
        "year": 1904,
        "collection": "Det vilde Kor · 1904",
        "sourceTitle": "Det vilde Kor · 1904 · pp. 31–32",
        "source": "https://www.nb.no/items/URN:NBN:no-nb_digibok_2009051813001?page=44",
        "searchAliases": ["Skærgaardsøen", "Nu glider Baaden"],
        "context": (
            "The scan separately heads this complete four-octave poem on pp. 31–32, after the "
            "Feberdigte section and before Drot. It reads “en Ø i Havet”; the Wikisource "
            "transcription omits “Ø.” Hamsun’s later support for Nazism is biographical context, "
            "not evidence describing this 1904 poem. NRK individually includes it in the 2016 "
            "selection. " + LANGUAGE_NOTE
        ),
    },
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build():
    if digest(READINGS) != READINGS_SHA256:
        raise ValueError("Reading snapshot changed")
    sections = [section for section in re.split(r"(?m)^## ", READINGS.read_text(encoding="utf-8")) if section.strip()]
    readings = {}
    for section in sections:
        key, text = section.split("\n", 1)
        if key in readings:
            raise ValueError(f"Duplicate reading: {key}")
        readings[key] = text.strip("\n")
    if list(readings) != [work["key"] for work in WORKS]:
        raise ValueError("Unexpected reading selection or order")

    records = []
    for work in WORKS:
        text = readings[work["key"]]
        if [len(block.splitlines()) for block in text.split("\n\n")] != work["blocks"]:
            raise ValueError(f"Unexpected reading boundaries: {work['key']}")
        year = work["year"]
        record = {
            "author": work["author"],
            "authorId": work["authorId"],
            "authorYears": work["authorYears"],
            "title": work["title"],
            "country": "Norway",
            "language": "Norwegian",
            "lang": "nb",
            "direction": "ltr",
            "year": year,
            "yearLabel": f"{year} printing · not necessarily composition date",
            "era": "19th century" if year < 1900 else "20th century",
            "form": "Lyric",
            "themes": [],
            "mood": "paper",
            "collection": work["collection"],
            "context": work["context"],
            "sourceTitle": work["sourceTitle"],
            "source": work["source"],
            "contextSourceTitle": "NRK · De 100 beste norske diktene (2016)",
            "contextSource": NRK,
            "searchAliases": work["searchAliases"],
            "id": work["id"],
            "rights": work.get("rights", RIGHTS),
            "translations": [],
            "text": text,
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
        print(f"Wrote {len(records)} historical Norwegian readings.")
    else:
        if json.loads(OUTPUT.read_text(encoding="utf-8")) != records:
            raise ValueError("Catalogue differs from the reviewed readings")
        print(f"Verified {len(records)} historical Norwegian readings" +
              ("; witness hashes match." if args.evidence_dir else "."))


if __name__ == "__main__":
    main()

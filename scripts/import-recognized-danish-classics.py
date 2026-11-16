#!/usr/bin/env python3
"""Reproduce five Danish poems from individually identified historical printings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-danish-classics-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-danish-classics.json"
READINGS_SHA256 = "f5de067ffaeb431923a18a8371a7968b7e1fdcf52fa71859d5dbac2a2d9c3d17"

# Hashes identify the consulted copies; they do not prove transcription accuracy.
EVIDENCE = {
    "oehlenschlaeger-samlede-digte-1823-01.pdf": "daf701ca87755bcbfee80c67a99ae7455ab57e3e912862d8d2cd2298fa0e064e",
    "andersen-samlede-skrifter-15-1854-kb.pdf": "d3bb1bce2bbc34ddf50e60cb5a0009150f37daca71fd58566fb594e0c3ddf85e",
    "andersen-jylland-illustreret-tidende-1860.png": "0ef65811a3377f9d2e6b8d76ab212db45cbabb030c427ed148862c19feed6f79",
    "boennelycke-ild-og-ungdom-1917-leaf-057.jpg": "950f21aea345cf647454b35ce5476ca952cc0f374ce7e5480650d9e30f5b426a",
    "boennelycke-ild-og-ungdom-1917-leaf-058.jpg": "c3dddf3917c8297f972adbe56ffde8bd9619672698e78779d8f76d4e3fa6d156",
    "boennelycke-ild-og-ungdom-1917-leaf-059.jpg": "b5793640069081c1990f60c070ee059aa3491d5c4c31761bfc4bdca6a26add01",
    "borup-dansk-sangbog-1914-kb.pdf": "fc10b3d01f47b4948c71fd82ac9c2f9834e36296faf23b3b93f9a0d12b7599e0",
}
COMMON = {
    "country": "Denmark", "language": "Danish", "lang": "da", "direction": "ltr",
    "form": "Verse", "themes": [], "mood": "paper", "translations": [],
}
RIGHTS = (
    "This historical printing is public domain in the United States. {deaths} "
    "Copyright, edition-related and moral rights vary by jurisdiction; check local law. "
    "Scans are linked, not republished; no translation, score or recording is included."
)
WORKS = [
    {
        "key": "faedrelands-sang", "id": "recognized-danish-classics-oehlenschlaeger-faedrelands-sang",
        "blocks": [6] * 12, "title": "Fædrelands-Sang", "author": "Adam Oehlenschläger",
        "authorId": "adam-oehlenschlaeger", "authorYears": "1779–1850",
        "authorAliases": ["Adam Oehlenschlaeger", "Adam Oehlenschlager"],
        "year": 1823, "yearLabel": "1823 printing", "era": "19th century",
        "collection": "Samlede Digte · 1823 · II",
        "sourceTitle": "Samlede Digte · 1823 · II · pp. 363–366",
        "source": "https://archive.org/details/samlededigte01oehlgoog/page/n406/mode/1up",
        "contextSourceTitle": "Danmarkshistorien · Der er et Yndigt Land",
        "contextSource": "https://danmarkshistorien.lex.dk/%E2%80%9CDer_er_et_Yndigt_Land%E2%80%9D_af_Adam_Oehlenschl%C3%A4ger,_1819",
        "searchAliases": ["Der er et yndigt land", "Faedrelands-Sang"],
        "context": (
            "The 1823 printing has twelve six-line stanzas, ending on p. 366; its Horace epigraph is "
            "not part of this verse transcription. Danmarkshistorien identifies the work as the Danish "
            "national song. Later four- and five-stanza selections are not separate works. "
            "The 1823 text retains 'Freias', 'axbeklædte' and 'Kiøbenhavn'."
        ),
        "rights": RIGHTS.format(deaths="Oehlenschläger died in 1850."),
    },
    {
        "key": "danmark-mit-faedreland", "id": "recognized-danish-classics-andersen-danmark",
        "blocks": [8] * 4, "title": "Danmark, mit Fædreland", "author": "Hans Christian Andersen",
        "authorId": "hans-christian-andersen", "authorYears": "1805–1875",
        "authorAliases": ["H. C. Andersen", "H.C. Andersen"],
        "year": 1854, "yearLabel": "1854 printing · first published 1850", "era": "19th century",
        "collection": "Samlede Skrifter · 1854 · XVI",
        "sourceTitle": "Samlede Skrifter · 1854 · XVI · pp. 170–171 / PDF pp. 407–408",
        "source": "https://www.kb.dk/e-mat/dod/115208016110-bw.pdf#page=407",
        "contextSourceTitle": "Højskolesangbogen · I Danmark er jeg født",
        "contextSource": "https://hojskolesangbogen.dk/om-sangbogen/historier-om-sangene/h-i/i-danmark-er-jeg-foedt/",
        "searchAliases": ["I Danmark er jeg født", "I Danmark er jeg fodt", "Danmark mit Faedreland"],
        "context": (
            "The 1854 collected edition prints four eight-line stanzas on pp. 170–171, with the third "
            "crossing the page turn. It is not the 1850 first printing. The songbook discusses its "
            "wide reception; its first-line title is an alias, not a second work. The printing retains "
            "'Kjæmpegrave', 'Kløver-Engen' and 'Meiselslag'."
        ),
        "rights": RIGHTS.format(deaths="Andersen died in 1875."),
    },
    {
        "key": "jylland", "id": "recognized-danish-classics-andersen-jylland",
        "blocks": [6] * 5, "title": "Jylland", "author": "Hans Christian Andersen",
        "authorId": "hans-christian-andersen", "authorYears": "1805–1875",
        "authorAliases": ["H. C. Andersen", "H.C. Andersen"],
        "year": 1860, "yearLabel": "1860 printing", "era": "19th century",
        "collection": "Illustreret Tidende · 1860",
        "sourceTitle": "Illustreret Tidende · 18 March 1860 · p. 209",
        "source": "https://commons.wikimedia.org/wiki/File:Illustreret_Tidende_1860_-_Jylland_mellem_tvende_have.png",
        "contextSourceTitle": "Højskolesangbogen · Jylland mellem tvende have",
        "contextSource": "https://hojskolesangbogen.dk/om-sangbogen/historier-om-sangene/j-l/jylland-mellem-tvende-have",
        "searchAliases": ["Jylland mellem tvende have", "Jutland between two seas"],
        "context": (
            "The first printing places five six-line stanzas below a musical score. Both the first "
            "and final stanza read 'Runestav'; some later transcriptions use 'Runesten' in the final "
            "stanza. The print also reads 'Teppe' rather than modern 'tæppe'. Printed musical repeat "
            "marks are omitted, not expanded. The songbook notes its "
            "regional reception. This is not Andersen's different 1831 poem also called Jylland."
        ),
        "rights": RIGHTS.format(deaths="Andersen died in 1875."),
    },
    {
        "key": "gaden", "id": "recognized-danish-classics-boennelycke-gaden",
        "blocks": [7] * 7, "title": "Gaden", "author": "Emil Bønnelycke",
        "authorId": "emil-boennelycke", "authorYears": "1893–1953",
        "authorAliases": ["Emil Boennelycke", "Emil Bonnelycke"],
        "year": 1917, "yearLabel": "1917 printing", "era": "20th century",
        "collection": "Ild og Ungdom · 1917",
        "sourceTitle": "Ild og Ungdom · 1917 · pp. 48–50 · Kalliope facsimile",
        "source": "https://kalliope.org/da/text/boennelycke2022082525",
        "contextSourceTitle": "Forfatterweb · Ild og Ungdom",
        "contextSource": "https://forfatterweb.dk/boeger/ild-og-ungdom",
        "searchAliases": ["Sporvogn, der brummer", "The Street"],
        "context": (
            "The 1917 printing has seven seven-line stanzas on pp. 48–50. The initial S is a drop cap; "
            "the next line begins 'Travle', without the extra O in one electronic transcription. "
            "The print reads 'Klokker' and 'Vindver'; a modern quotation differs. Forfatterweb identifies "
            "Gaden as the best known of the collection's city poems; its later rap adaptation is not "
            "included or counted separately."
        ),
        "rights": RIGHTS.format(deaths="Bønnelycke died in 1953."),
    },
    {
        "key": "se-nu-stiger-solen", "id": "recognized-danish-classics-knudsen-se-nu-stiger-solen",
        "blocks": [4] * 7, "title": "Se, nu stiger Solen af Havets Skød", "author": "Jakob Knudsen",
        "authorId": "jakob-knudsen", "authorYears": "1858–1917",
        "year": 1914, "yearLabel": "1914 printing · first published 1891", "era": "19th century",
        "collection": "Dansk Sangbog · 1914",
        "sourceTitle": "Dansk Sangbog · 1914 · pp. 9–10 / PDF pp. 34–35",
        "source": "https://www.kb.dk/e-mat/dod/115308028746-bw.pdf#page=34",
        "contextSourceTitle": "Højskolesangbogen · Se, nu stiger solen",
        "contextSource": "https://hojskolesangbogen.dk/om-sangbogen/historier-om-sangene/s/se-nu-stiger-solen",
        "searchAliases": ["Se, nu stiger solen", "Morgensang"],
        "context": (
            "Borup's 1914 songbook prints seven quatrains, credited to Knudsen and Højskolebladet "
            "1891; this is not the first printing. The songbook discusses it as a communal-singing "
            "classic. The text explicitly addresses God; no denomination is inferred. Musical "
            "settings are not separate works."
        ),
        "rights": RIGHTS.format(deaths="Knudsen died in 1917 and editor Johan Borup in 1946."),
    },
]
NORMALIZATION = (
    " Historical spelling is retained; typeface, indentation and punctuation typography are normalized. "
    "Denmark is an associated place, not a claim about composition location."
)


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
        if [len(block.splitlines()) for block in text.split("\n\n")] != work["blocks"]:
            raise ValueError(f"Unexpected reading boundaries: {work['key']}")
        record = {**COMMON, **{key: value for key, value in work.items() if key not in {"key", "blocks"}}}
        record["context"] += NORMALIZATION
        record["text"] = text
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

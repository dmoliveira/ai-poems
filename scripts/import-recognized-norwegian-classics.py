#!/usr/bin/env python3
"""Reproduce six Norwegian classics from specified historical printings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-norwegian-classics-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-norwegian-classics.json"
READINGS_SHA256 = "5982c0c615764d80e0bce8593855e89bed4921567f211905df17a136e74ede70"

# Hashes identify the copies consulted; they do not themselves prove a transcription.
EVIDENCE = {
    "bien-1837-vol19-1-image126.jpg": "e9498eea5ef7cd3af050568aa64555bbdc46155a264f02aa41d68427e137506e",
    "bien-1837-vol19-1-image127.jpg": "f35c4fb86fda86a75883599d07c91ffc4e6ab683c4dc47c46d9f08af7c2b2530",
    "morgenbladet-1845-05-24-p2.jpg": "1facd75835b6fdadff53dedcbaeb356d3fc4db4d27b7e771989cc0d9420f5612",
    "morgenbladet-1845-05-24-p3.jpg": "c872d49eae5cc26281250ea0f8ef35918057c23ccc747a9f280d3e944e81a813",
    "welhaven-nb-1845-title-p009.jpg": "e9e12d612379f45448baa027c11b1d559a800c88c895bc837781671f76d35f12",
    "welhaven-nb-1845-title-p010.jpg": "bd1c6a6d7259fe1e5c553b0b25ee7b6dda474bd22f202eeac9c68ca01311e54e",
    "welhaven-nb-1845-title-p109.jpg": "caddf727b11da1784f82d53e64f88e192803f7043bb726451177c8da31d598f1",
    "welhaven-nb-1845-title-p110.jpg": "c1278b393b0f7f2122f07b6ace3d3160b077bf06d1c54ab45d77fda36bd38d4d",
    "welhaven-nb-1845-title-p111.jpg": "a96d3bf982cd04e517749b6c1741a7896913dbe9d3f71eabc5d8c780d7fc9781",
    "welhaven-nb-1845-title-p112.jpg": "91c011fb85ade800930a39cc5b7446278268e420ddba743adecd465fc5185b7e",
    "aasen-symra-1863-image007.jpg": "7c3ce773aaf2f4fc1cbfd4daae32306f3e6f6517662ed427e3725f6de158cb52",
    "aasen-symra-1863-image008.jpg": "5af06a6ce86fd5a1c454d8bf8cfe93c9155e614f7e5cee9157dfc0dab433f177",
    "aasen-symra-1863-image009.jpg": "cd7da0f05f0d78bfd5d8d2c328239c8d9a625083ee669879e21f20c4760de9fe",
}

WERGELAND = {"author": "Henrik Wergeland", "authorId": "henrik-wergeland", "authorYears": "1808–1845"}
WELHAVEN = {
    "author": "Johan Sebastian Welhaven", "authorId": "johan-sebastian-welhaven",
    "authorYears": "1807–1873", "authorAliases": ["J. S. Welhaven", "Johan Sebastian Cammermeyer Welhaven"],
}
AASEN = {"author": "Ivar Aasen", "authorId": "ivar-aasen", "authorYears": "1813–1896", "authorAliases": ["Ivar Åsen"]}
COMMON = {"country": "Norway", "direction": "ltr", "era": "19th century", "form": "Lyric", "themes": [], "mood": "paper", "translations": []}
HISTORICAL_DANISH = (
    "The original uses the Danish-based written language of nineteenth-century Norway, "
    "rather than modern standardized Bokmål. Norway is an associated place, not a composition claim. "
    "Historical spelling is retained; typeface, indentation, spacing and some punctuation are normalized."
)
WORKS = [
    {
        "key": "pigen", **WERGELAND, "language": "Danish", "lang": "da",
        "title": "Pigen paa Anatomikammeret", "displayTitle": "The Girl in the Dissecting Room",
        "year": 1837, "yearLabel": "1837 printing", "collection": "Bien · 1837",
        "context": (
            "Bien prints this separately titled and signed poem in five six-line stanzas on pp. 126–127. "
            "Its 'frossen', 'Tvertsover' and 'Stedmorsblommen' differ from later printings; "
            "the readings are not combined. " + HISTORICAL_DANISH
        ),
        "sourceTitle": "Bien · 1837 · vol. 19 no. 1 · pp. 126–127",
        "source": "https://www.nb.no/items/440cbcf6c9051b78bc1821aed6ed350c?page=125",
        "contextSourceTitle": "Bokselskap · selected poems of Henrik Wergeland",
        "contextSource": "https://www.bokselskap.no/boker/wergelanddikt/tittelside",
        "searchAliases": ["Pigen på Anatomikammeret", "Piken på anatomikammeret", "Pigen paa anatomikammeret"],
        "blocks": [6, 6, 6, 6, 6],
    },
    {
        "key": "foraaret", **WERGELAND, "language": "Danish", "lang": "da",
        "title": "Til Foraaret", "displayTitle": "To Spring", "year": 1845,
        "yearLabel": "1845 newspaper printing", "collection": "Morgenbladet · 1845",
        "context": (
            "Morgenbladet prints the complete poem under its own title on pp. 2–3, "
            "ending with Wergeland's dated signature before a separate poem begins. "
            "Lineation follows the newspaper, including its long lines. " + HISTORICAL_DANISH
        ),
        "sourceTitle": "Morgenbladet · 24 May 1845 · pp. 2–3",
        "source": "https://www.nb.no/items/a895f33ef2a13084fc56238579431303?page=1",
        "contextSourceTitle": "Store norske leksikon · Henrik Wergeland",
        "contextSource": "https://snl.no/Henrik_Wergeland",
        "searchAliases": ["Til våren", "Til foråret", "O Forår! Forår! red mig!"],
        "blocks": [2, 3, 3, 3, 2, 2, 2, 4, 2, 2, 2, 4],
    },
    {
        "key": "gyldenlak", **WERGELAND, "language": "Danish", "lang": "da",
        "title": "Til min Gyldenlak", "displayTitle": "To My Wallflower", "year": 1845,
        "yearLabel": "1845 newspaper printing", "collection": "Morgenbladet · 1845",
        "context": (
            "Morgenbladet prints this separately titled and signed poem in five four-line stanzas. "
            "It reads 'bring mig Hilsen' and 'blomstrer af'; an 1846 selection has different readings. "
            "The printings are not combined. " + HISTORICAL_DANISH
        ),
        "sourceTitle": "Morgenbladet · 24 May 1845 · p. 3",
        "source": "https://www.nb.no/items/a895f33ef2a13084fc56238579431303?page=2",
        "contextSourceTitle": "Store norske leksikon · Henrik Wergeland",
        "contextSource": "https://snl.no/Henrik_Wergeland",
        "searchAliases": ["Til min gyllenlakk", "Gyldenlak før du din glans har tapt"],
        "blocks": [4, 4, 4, 4, 4],
    },
    {
        "key": "vaarnat", **WELHAVEN, "language": "Danish", "lang": "da",
        "title": "En Vaarnat", "displayTitle": "A Spring Night", "year": 1844,
        "yearLabel": "Published 1844 · title page 1845", "collection": "Nyere Digte · title page 1845",
        "context": (
            "The complete four-stanza poem occupies pp. 9–10 of Nyere Digte. "
            "The title page says 1845, but Bokselskap dates publication to November 1844. "
            + HISTORICAL_DANISH
        ),
        "sourceTitle": "Nyere Digte · title page 1845 · pp. 9–10",
        "source": "https://www.nb.no/items/512252f05cc28fee83040afeabe936ea?page=22",
        "contextSourceTitle": "Bokselskap · En Vaarnat",
        "contextSource": "https://www.bokselskap.no/boker/welhavendikt/envaarnat",
        "searchAliases": ["En vårnatt", "En vårnat", "Vårnatten stille og sval"],
        "blocks": [7, 7, 7, 7],
    },
    {
        "key": "digtets-aand", **WELHAVEN, "language": "Danish", "lang": "da",
        "title": "Digtets Aand", "displayTitle": "The Spirit of the Poem", "year": 1844,
        "yearLabel": "Published 1844 · title page 1845", "collection": "Nyere Digte · title page 1845",
        "context": (
            "Nyere Digte prints this complete fifteen-stanza poem on pp. 109–112. "
            "The title page says 1845; Bokselskap dates publication to November 1844. "
            "NDLA discusses the individual poem's account of poetry and its readers. " + HISTORICAL_DANISH
        ),
        "sourceTitle": "Nyere Digte · title page 1845 · pp. 109–112",
        "source": "https://www.nb.no/items/512252f05cc28fee83040afeabe936ea?page=122",
        "contextSourceTitle": "NDLA · Henrik Wergeland and Johan Sebastian Welhaven",
        "contextSource": "https://ndla.no/en/r/norwegian-pb/henrik-wergeland-og-johan-sebastian-welhaven/be3ab39815",
        "searchAliases": ["Diktets ånd", "Digtets ånd", "Hvad ei med Ord kan nævnes"],
        "blocks": [4] * 15,
    },
    {
        "key": "fjelli", **AASEN, "language": "Norwegian", "lang": "nn",
        "title": "Dei gamle Fjelli", "displayTitle": "The Old Mountains", "year": 1863,
        "yearLabel": "1863 printing", "collection": "Symra · 1863",
        "context": (
            "Symra prints five numbered eight-line stanzas on pp. 7–9, followed by the separate "
            "poem Heimvegen. This 1863 reading has 'at ganga til og fraa' and 'sin Fødestad'; "
            "a modern web transcription gives different words. No later edition is spliced in. "
            "Aasen's Landsmaal was an early form of the written language later called Nynorsk; "
            "the nn tag identifies that language family, not modernized spelling. Historical "
            "spelling and stanza numbers are retained; typeface, indentation and some punctuation "
            "are normalized. Norway is an associated place, not a composition claim."
        ),
        "sourceTitle": "Symra · 1863 · pp. 7–9",
        "source": "https://www.nb.no/items/URN:NBN:no-nb_digibok_2009120812001?page=8",
        "contextSourceTitle": "Nynorsk kultursentrum · Symra",
        "contextSource": "https://www.nynorsk.no/symra-1863",
        "searchAliases": ["Dei gamle fjella", "Dei gamle fjell i syningom"],
        "blocks": [8, 8, 8, 8, 8],
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
        if [len(block.splitlines()) for block in text.split("\n\n")] != work["blocks"]:
            raise ValueError(f"Unexpected reading boundaries: {work['key']}")
        record = {**COMMON, **{key: value for key, value in work.items() if key not in {"key", "blocks"}}}
        record.update({
            "id": "recognized-norwegian-" + work["key"],
            "rights": (
                "Historical original published before 1931; public domain in the United States. "
                "Transcribed from the linked National Library of Norway scan, marked public domain; "
                "the scan is linked, not republished. Copyright and moral rights vary; check local law. "
                "No translation or recording is included."
            ),
            "text": text,
        })
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

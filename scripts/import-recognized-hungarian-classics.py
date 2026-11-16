#!/usr/bin/env python3
"""Reproduce three individually documented 1921 Hungarian readings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-hungarian-classics-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-hungarian-classics.json"
READINGS_SHA256 = "5ceb3b8c288e96d3781ec6acecf58fd80c46b2a5f3508de01018e64c44cd6ae3"

# These identify consulted copies, not the accuracy of their transcriptions.
EVIDENCE = {
    "petofi-dalaim-1921-discovery.pdf": "a03cd2b91e7306a7d26d90c3fcc61bfd210db30db21a5eb944d0817b8d4bcd69",
    "vorosmarty-merengo-1921-discovery.pdf": "bd4b922beb5199825ce34618e59f6a3ec57ea97a926d07056909c544409ebf68",
}
PETOFI_SCAN = "https://archive.org/download/dalaimantholgi00petf/dalaimantholgi00petf.pdf"
VOROSMARTY_SCAN = "https://archive.org/download/merenghz00vr/merenghz00vr.pdf"
EXHIBITION = "https://oszk.hu/en/exhibitions/land-poems-hymn-appeal-national-song-our-emblematic-poems"
RIGHTS = (
    "The 1921 printing is public domain in the United States. Copyright, edition-related and moral rights "
    "vary by jurisdiction; check local law. The scan is linked, not republished. "
    "No translation or recording is included."
)
COMMON = {
    "country": "Hungary", "language": "Hungarian", "lang": "hu", "era": "19th century",
    "year": 1921, "yearLabel": "1921 printing · not necessarily composition date", "form": "Lyric", "rights": RIGHTS,
}
PETOFI = {
    "author": "Sándor Petőfi", "authorId": "sandor-petofi", "authorYears": "1823–1849",
    "authorAliases": ["Petőfi Sándor", "Sandor Petofi", "Petofi Sandor"], "collection": "Dalaim · 1921",
}
VOROSMARTY = {
    "author": "Mihály Vörösmarty", "authorId": "mihaly-vorosmarty", "authorYears": "1800–1855",
    "authorAliases": ["Vörösmarty Mihály", "Mihaly Vorosmarty", "Vorosmarty Mihaly"],
    "collection": "A merengőhöz · 1921",
}
WORKS = [
    {
        **PETOFI, "key": "petofi-szeptember-vegen", "title": "Szeptember végén",
        "context": (
            "The complete three eight-line stanzas occupy pp. 108–109 of the 1921 anthology; "
            "Rózsabokor follows. The middle stanza crosses a page turn. The historical printing retains "
            "ifju, vegyűl, űlj, sirom, birhat, könyűimet and hivedet. The National Library of Hungary "
            "catalogues a conference devoted to the individual poem. Spacing and indentation are normalized; "
            "Hungary is an associated place, not a claim about composition."
        ),
        "sourceTitle": "Dalaim · Gyoma, 1921, pp. 108–109 / PDF pp. 112–113",
        "source": PETOFI_SCAN + "#page=112", "contextSourceTitle": "National Library of Hungary · conference catalogue",
        "contextSource": "https://mek.oszk.hu/17900/17913/cedula.html",
        "searchAliases": ["Szeptember vegen", "At the end of September"], "blocks": [8, 8, 8],
    },
    {
        **PETOFI, "key": "petofi-nemzeti-dal", "title": "Nemzeti dal",
        "context": (
            "The six eight-line stanzas occupy pp. 25–27 of the 1921 anthology; Föltámadott a tenger "
            "follows. The second oath in the fifth-stanza refrain prints Eszküszünk, apparently a typesetting error; "
            "this is retained rather than silently corrected from the 1848 broadside. The same printing "
            "reads hiréhez. The National Library of Hungary identifies this as an iconic Hungarian poem. "
            "A musical setting or another printing is not a separate work. Spacing, indentation and dash "
            "typography are normalized; Hungary is an associated place, not a composition claim."
        ),
        "sourceTitle": "Dalaim · Gyoma, 1921, pp. 25–27 / PDF pp. 29–31", "source": PETOFI_SCAN + "#page=29",
        "contextSourceTitle": "National Library of Hungary · three emblematic poems", "contextSource": EXHIBITION,
        "searchAliases": ["National Song", "Talpra magyar"], "blocks": [8] * 6,
    },
    {
        **VOROSMARTY, "key": "vorosmarty-szozat", "title": "Szózat",
        "context": (
            "The complete fourteen quatrains occupy pp. 67–69 of the 1921 anthology; Berzsenyi Emléke "
            "follows. The seventh stanza crosses a page turn and the last begins p. 69. This printing retains rendületlenűl, "
            "kivűl, mellyen, hosszu, sűlyed, körűl and gyászköny. The National Library of Hungary identifies the poem "
            "as an iconic Hungarian work. A musical setting or a partial anthem is not another poem. "
            "Spacing and indentation are normalized; Hungary is an associated place, not a composition claim."
        ),
        "sourceTitle": "A merengőhöz · Gyoma, 1921, pp. 67–69 / PDF pp. 71–73",
        "source": VOROSMARTY_SCAN + "#page=71", "contextSourceTitle": "National Library of Hungary · three emblematic poems",
        "contextSource": EXHIBITION, "searchAliases": ["Szozat", "Appeal"], "blocks": [4] * 14,
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
            "id": "recognized-hungarian-classics-" + work["key"], "direction": "ltr", "themes": [],
            "mood": "paper", "text": text, "translations": [],
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

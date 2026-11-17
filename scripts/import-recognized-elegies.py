#!/usr/bin/env python3
"""Reproduce three complete poems from identified historical printings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-elegies-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-elegies.json"
READINGS_SHA256 = "d92c3b972abe8c80bea6ca28ac6be3721dae4152b78da6afbf35c0761fb4e25f"

# Hashes identify consulted copies; they do not prove transcription accuracy.
EVIDENCE = {
    "carton-1849-oudvlaemsche.pdf": "0bebbea19728364ea1af9be44409d2e7c9c58b532cce6f47382b394340fb1a8e",
    "vondel-werken-1857.pdf": "cc714d84e4be2752dfefb473e07854b409efa3afaeb8fee5fae537a023f93df1",
    "quevedo-bpl-parnasso-catalogued-1650.pdf": "3c3ede23efdd55b746eee0cdac54782c705fe58403984222c780b35988feb07b",
}
COMMON = {"direction": "ltr", "themes": [], "mood": "paper", "translations": []}
RIGHTS = (
    "This historical poem reading is public domain in the United States. {basis} "
    "Copyright, edition-related and moral rights vary by jurisdiction; check local law. "
    "The scan is linked, not republished; no translation, score or recording is included."
)
WORKS = [
    {
        "key": "egidius", "blocks": [5, 3, 3, 5, 3],
        "id": "recognized-elegies-egidius",
        "title": "Egidiuslied", "author": "Anonymous (Gruuthuse manuscript)",
        "authorId": "anonymous-gruuthuse", "authorYears": "Author not established", "anonymous": True,
        "country": "Belgium", "language": "Dutch", "lang": "nl", "year": 1849,
        "yearLabel": "1849 printing · manuscript c. 1400", "era": "Medieval", "form": "Verse",
        "collection": "Oudvlaemsche liederen · 1849",
        "sourceTitle": "Carton · Oudvlaemsche liederen · 1849 · pp. 171–172",
        "source": "https://archive.org/details/OudvlaemscheLiederenEnAndere/page/n194/mode/1up",
        "contextSourceTitle": "KANTL · Gruuthuse manuscript and Egidiuslied",
        "contextSource": "https://literairecanon.be/canon-2025/gruuthuseliedboek",
        "searchAliases": ["Egidius waer bestu bleven", "Egidius waar ben je gebleven", "Gruuthuse II 98"],
        "context": (
            "Carton's 1849 edition prints this Middle Dutch lyric as number XCVIII in 19 lines. "
            "Its middle refrain reads 'de doot'; the first and last have 'die doot'. The manuscript "
            "abbreviates the final refrain; Carton expands three lines, while some editions expand "
            "five, for 21 lines. These are readings of one work, not separate poems. Authorship "
            "is disputed. KANTL identifies it individually as the manuscript's best-known song; "
            "this is not a global ranking. Belgium is an associated modern place."
        ),
        "rights": RIGHTS.format(basis="The 1849 printing predates 1909; editor Charles Carton died in 1863."),
    },
    {
        "key": "vondel-kinder-lijck", "blocks": [16],
        "id": "recognized-elegies-vondel-kinder-lijck",
        "title": "Kinder-lijck", "author": "Joost van den Vondel", "authorId": "joost-van-den-vondel",
        "authorYears": "1587–1679", "country": "Netherlands", "language": "Dutch", "lang": "nl",
        "year": 1857, "yearLabel": "1857 printing · poem c. 1632–33", "era": "17th century", "form": "Verse",
        "collection": "De werken van Vondel · 1857",
        "sourceTitle": "Van Lennep · De werken van Vondel · 1857 · p. 157",
        "source": "https://archive.org/details/bub_gb_9ls-AAAAcAAJ/page/n178/mode/1up",
        "contextSourceTitle": "Dutch teachers’ survey selection · 1997 review",
        "contextSource": "https://www.dbnl.org/tekst/_tsj001199701_01/_tsj001199701_01_0028.php",
        "searchAliases": ["Kinder-lyck", "Kinderlijk", "Constantijntje", "Eeuwigh gaat voor oogenblik"],
        "context": (
            "The 1857 Van Lennep edition prints this separately headed elegy in 16 lines. "
            "Its opening reads 'Konstantijntje'; the 1644-based critical edition reads "
            "'Constantijntje' and differs in other spellings. The poem is commonly dated 1632, "
            "though 1633 is also suggested. The printed alternating indentation is retained; "
            "long s and punctuation typography are normalized. A Dutch teachers' "
            "survey selection names this individual poem, not a global ranking. The Netherlands "
            "is an associated place."
        ),
        "rights": RIGHTS.format(basis="Vondel died in 1679 and 1857 editor Jacob van Lennep in 1868."),
    },
    {
        "key": "quevedo-amor-constante", "blocks": [14],
        "id": "recognized-elegies-quevedo-amor-constante",
        "title": "Amor constante más allá de la muerte", "author": "Francisco de Quevedo",
        "authorId": "francisco-de-quevedo", "authorYears": "1580–1645", "country": "Spain",
        "language": "Spanish", "lang": "es", "year": 1650, "yearLabel": "1650 printing",
        "era": "17th century", "form": "Sonnet", "collection": "El Parnasso español · 1650",
        "sourceTitle": "El Parnasso español · 1650 · p. 190 · Boston Public Library",
        "source": "https://archive.org/details/elparnassoespano00quev_0/page/n201/mode/1up",
        "contextSourceTitle": "UNAM recording description · individual reception",
        "contextSource": "https://www.elem.mx/autor/datos/118245",
        "searchAliases": ["Cerrar podrá mis ojos la postrera", "Polvo serán mas polvo enamorado"],
        "context": (
            "The 1650 printing separately heads this complete 14-line sonnet. Its fifth line "
            "has an extra 'se' in 'Mas no se de essotra parte'; the 1648 edition lacks it. "
            "The 1650 reading also has plural 'dejaràn' and 'ceniça'; some modern editions "
            "emend the verb to singular. Long s, indentation and punctuation typography are "
            "normalized, without combining editions. UNAM's description cites Dámaso Alonso "
            "on the sonnet's reception, not a global ranking. Spain is an associated place."
        ),
        "rights": RIGHTS.format(basis="Quevedo died in 1645 and editor González de Salas in 1651."),
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

#!/usr/bin/env python3
"""Reproduce seven complete, individually documented historical readings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-lyric-classics-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-lyric-classics.json"
READINGS_SHA256 = "73b4c03fe5fa4559e6dd43b73a4a1010f1fb7d251dcfcffff55b0f82cce7ff3f"

# Hashes identify consulted witnesses; they do not prove transcription accuracy.
EVIDENCE = {
    "machado-campos-1912.pdf": "5d86f6d361526179ce8659fcc224563257a8d6b361c1b86174127ba76ea39739",
    "machado-completas-1917.pdf": "6e476cf58c158d8067f9d01f63f5a7cc690d0d631c24f98dea066e612a201828",
    "machado-completas-1928-bne.pdf": "efeece4e544c80405c5f1c1441ddf588ac586d0d65bd5697839dcef572bb0b4c",
    "ronsard-odes-vaganay-1923.djvu": "0d6356e119a31260cbbb09045f41cf481f7ef8249f5409cd740afe36b6afdb36",
    "teasdale-flame-shadow-1920.pdf": "22b2d3a7c0f7a0fe5ee5aea008570e2c650e8047fa21a509fa68ed3c1e7c8a87",
    "frost-new-hampshire-1923.pdf": "91891c69baf799b801a547164d1afe9273e9733d8d4e9ea89e15b9a93905ff9c",
    "yeats-wind-among-reeds-1899.pdf": "f68b9e8548fe4269fdc9d707b64ae6ab42280620b260188b4c1dbbd0ca615460",
}

MACHADO = {
    "author": "Antonio Machado", "authorId": "antonio-machado", "authorYears": "1875–1939",
    "country": "Spain", "language": "Spanish", "lang": "es", "era": "20th century",
}

WORKS = [
    {
        **MACHADO, "key": "machado-retrato", "title": "Retrato", "year": 1912,
        "collection": "Campos de Castilla · 1912", "stanzas": [4] * 9,
        "sourceTitle": "Campos de Castilla · Madrid, 1912, pp. 7–9",
        "source": "https://archive.org/details/camposdecastilla00mach/page/n12/mode/1up",
        "reception": "https://poemas.uned.es/poema/retrato-antonio-machado/",
        "detail": (
            "The separately headed poem has nine complete quatrains. This printing reads "
            "'Hay en mi venas' without the expected s; the apparent error and its historical "
            "accents are retained. UNED's PoeMAS documents the individual poem and several "
            "musical settings. Other editions and settings are not counted as separate works."
        ),
    },
    {
        **MACHADO, "key": "machado-anoche-cuando-dormia", "title": "Anoche cuando dormía", "year": 1928,
        "collection": "Poesías completas · 1928", "stanzas": [8, 8, 8, 4],
        "sourceTitle": "Poesías completas · Madrid, 1928, pp. 74–75",
        "source": "https://commons.wikimedia.org/wiki/File:Antonio_Machado_-_Poes%C3%ADas_completas_-_bdh0000252161.pdf?page=80",
        "reception": "https://www.zendalibros.com/anoche-cuando-dormia-antologia-poetica-de-antonio-machado/",
        "detail": (
            "The four complete stanzas are numbered LX in this printing; the title here is the "
            "opening line. The third stanza crosses a page break. This 1928 printing reads "
            "'Di' and 'en donde nunca bebí'. A modern anthology takes its title from the poem "
            "but reads 'de donde nunca bebí'. Editions also number and punctuate it differently."
        ),
    },
    {
        **MACHADO, "key": "machado-la-saeta", "title": "La saeta", "year": 1917,
        "collection": "Poesías completas · 1917", "stanzas": [4, 1, 16],
        "sourceTitle": "Poesías completas · Madrid, 1917, pp. 206–207",
        "source": "https://archive.org/details/poesascompletas00machgoog/page/n213/mode/1up",
        "reception": "https://poemas.uned.es/poema/la-saeta-antonio-machado/",
        "detail": (
            "The first four lines are a traditional epigraph, followed by its printed attribution "
            "'SAETA POPULAR.'; they are not attributed to Machado. His complete sixteen-line poem "
            "follows. The displayed line count includes those four lines and the attribution. "
            "UNED's PoeMAS documents the poem's later musical reception. Neither the epigraph, "
            "other printings nor musical settings are counted as additional works."
        ),
    },
    {
        "key": "ronsard-mignonne", "title": "À Cassandre", "displayTitle": "Mignonne, allons voir si la rose",
        "displayTitleLang": "fr", "author": "Pierre de Ronsard", "authorId": "pierre-de-ronsard",
        "authorYears": "1524–1585", "country": "France", "language": "French", "lang": "fr",
        "year": 1923, "era": "Renaissance", "collection": "Œuvres complètes · tome 3 · 1923",
        "stanzas": [6, 6, 6],
        "sourceTitle": "Œuvres complètes · Vaganay edition, 1923, tome 3, pp. 75–76",
        "source": "https://commons.wikimedia.org/wiki/File:Ronsard_-_Œuvres_complètes,_Garnier,_1923,_tome_3.djvu?page=91",
        "reception": "https://www.radiofrance.fr/franceinfo/podcasts/ces-chansons-qui-font-l-ete/ces-chansons-qui-font-l-ete-mignonne-allons-voir-si-la-rose-en-1576-et-pour-des-siecles-8846162",
        "detail": (
            "The three complete stanzas are headed 'A CASSANDRE. ODE XVII.'; the displayed "
            "title is the familiar opening. The 1923 Vaganay edition retains spellings such as "
            "'avoit desclose', 'beautez' and 'vostre'; other editions modernize them. "
            "Radio France calls this one of French literature's most famous poems and discusses its musical "
            "reception. Stanza breaks are supplied from the printed indentations."
        ),
        "editor": "Editor Hugues Vaganay died in 1936. ",
    },
    {
        "key": "teasdale-soft-rains", "title": "There Will Come Soft Rains", "author": "Sara Teasdale",
        "authorId": "sara-teasdale", "authorYears": "1884–1933", "country": "United States",
        "language": "English", "lang": "en", "year": 1920, "era": "20th century",
        "collection": "Flame and Shadow · 1920", "stanzas": [2] * 6,
        "sourceTitle": "Flame and Shadow · New York, 1920, pp. 89–90",
        "source": "https://archive.org/details/flameandshadow00teasgoog/page/n107/mode/1up",
        "reception": "https://americanliterature.com/author/sara-teasdale/poem/there-will-come-soft-rains",
        "detail": (
            "The complete six-couplet poem bears the subtitle '(War Time)' in this printing. "
            "Its first two lines are rejoined across printed wraps. The earlier 1918 version "
            "reads 'calling' instead of this edition's 'circling'; it is the same work. "
            "American Literature includes the poem in its 100 Great Poems and notes its "
            "later use by Ray Bradbury."
        ),
    },
    {
        "key": "frost-fire-and-ice", "title": "Fire and Ice", "author": "Robert Frost",
        "authorId": "robert-frost", "authorYears": "1874–1963", "country": "United States",
        "language": "English", "lang": "en", "year": 1923, "era": "20th century",
        "collection": "New Hampshire · 1923", "stanzas": [9],
        "sourceTitle": "New Hampshire · New York, 1923, p. 80",
        "source": "https://archive.org/details/NewHampshireRobertFrost1923/page/n94/mode/1up",
        "reception": "https://interestingliterature.com/2019/12/analysis-robert-frost-fire-and-ice/",
        "detail": (
            "The complete nine-line poem is separately headed on page 80. This 1923 printing "
            "reads 'To say'; its 1920 magazine appearance reads 'To know'. They are not "
            "separate works. Literary scholar Oliver Tearle describes the poem as widely anthologized."
        ),
    },
    {
        "key": "yeats-cloths-of-heaven", "title": "Aedh Wishes for the Cloths of Heaven",
        "displayTitle": "He Wishes for the Cloths of Heaven", "displayTitleLang": "en",
        "author": "William Butler Yeats", "authorId": "william-butler-yeats", "authorYears": "1865–1939",
        "country": "Ireland", "language": "English", "lang": "en", "year": 1899,
        "era": "19th century", "collection": "The Wind Among the Reeds · 1899", "stanzas": [8],
        "sourceTitle": "The Wind Among the Reeds · New York and London, 1899, p. 60",
        "source": "https://archive.org/details/windamongreeds00yeat/page/n71/mode/1up",
        "reception": "https://interestingliterature.com/2015/11/06/a-short-analysis-of-yeatss-he-wishes-for-the-cloths-of-heaven/",
        "detail": (
            "The eight complete lines are headed 'Aedh Wishes for the Cloths of Heaven' in "
            "this printing. The familiar later title 'He Wishes for the Cloths of Heaven' is "
            "the same work, not another poem. Literary scholar Oliver Tearle discusses its reception."
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
        if [len(stanza.splitlines()) for stanza in text.split("\n\n")] != work["stanzas"]:
            raise ValueError(f"Unexpected stanza lengths: {work['key']}")
        record = {
            "id": "recognized-lyric-classics-" + work["key"], "title": work["title"],
            "author": work["author"], "authorId": work["authorId"], "authorYears": work["authorYears"],
            "country": work["country"], "language": work["language"], "lang": work["lang"],
            "direction": "ltr", "year": work["year"],
            "yearLabel": f"{work['year']} printing · not necessarily composition date",
            "era": work["era"], "form": "Verse", "collection": work["collection"], "themes": [],
            "mood": "paper", "context": work["detail"] + (
                " Spacing, indentation and apostrophe/dash typography are normalized; the associated "
                "country is not a claim about the place of composition."
            ),
            "sourceTitle": work["sourceTitle"], "source": work["source"],
            "contextSourceTitle": "Individual reception and context", "contextSource": work["reception"],
            "rights": (
                f"The {work['year']} printing is public domain in the United States; "
                f"{work['author']} died in {work['authorYears'].split('–')[-1]}. "
                + work.get("editor", "")
                + "Copyright and moral rights vary by jurisdiction, so check local law. "
                "The scan is linked, not republished; the verse was transcribed from its historical pages. "
                "No translation or recording is included."
            ),
            "text": text, "translations": [],
        }
        for key in ("displayTitle", "displayTitleLang"):
            if key in work:
                record[key] = work[key]
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

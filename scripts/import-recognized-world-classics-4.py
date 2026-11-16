#!/usr/bin/env python3
"""Reproduce individually documented English, German, and Russian readings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-world-classics-4-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-world-classics-4.json"
READINGS_SHA256 = "87ecd3f1992761395093f7566440863451e9325c7ca6dd1bb7c3e11f262357b8"

# These identify inspected copies; hashes do not establish transcription accuracy.
EVIDENCE = {
    "shelley-prometheus-1820-ia-candidate.pdf": "a9fc10e5fb039af0ba544631fdcb3c3c2124765d5ddc2f4d5ff2f159659c0a9f",
    "hopkins-poems-1918-ia-candidate.pdf": "154b75c6bc8070ad9464dfe221269173713ffe3bca1206422c76e8705960de61",
    "trakl-grodek-brenner-1915-candidate.jpg": "7fecb7ba963c5b1786995ca635803fc1ce859af791ef09c85519d55206f98c53",
    "tyutchev-sovremennik-1854-scan-candidate.pdf": "7509cff83d08a5f6080b032894e228b2dc8ca9f67991626372aeffc78ead7988",
}
HISTORICAL_RIGHTS = (
    "The historical printing is public domain in the United States. Copyright, edition-related and "
    "moral rights vary by jurisdiction; check local law. The scan is linked, not republished. "
    "No translation or recording is included."
)
HOPKINS_RIGHTS = (
    "The 1918 Bridges printing is public domain in the United States; Robert Bridges died in 1930. "
    "Copyright, edition-related and moral rights vary by jurisdiction; check local law. "
    "The scan is linked, not republished. No translation or recording is included."
)
TRAKL_RIGHTS = (
    "The 1915 printing is public domain in the United States. Editor Ludwig von Ficker died in 1967; "
    "edition-related copyright and moral rights may differ elsewhere, so check local law. "
    "The scan is linked, not republished. No translation or recording is included."
)
TYUTCHEV_SCAN = "https://commons.wikimedia.org/wiki/File:Sovremennik_1854_03-04.pdf"
WORKS = [
    {
        "key": "shelley-ode-west-wind", "title": "Ode to the West Wind", "author": "Percy Bysshe Shelley",
        "authorId": "percy-bysshe-shelley", "authorYears": "1792–1822", "country": "England",
        "language": "English", "lang": "en", "era": "19th century", "year": 1820,
        "yearLabel": "1820 printing · not necessarily composition date", "form": "Ode",
        "collection": "Prometheus Unbound · 1820",
        "context": (
            "The 1820 printing presents five numbered fourteen-line sections as one separately headed ode; "
            "the following page begins a different ode. Verso's displayed line count includes the five "
            "section numbers. This witness retains O, wild; every where; airy; grey; uncontroulable; "
            "and Oh! lift. Small capitals, punctuation spacing and apostrophe typography are normalized. "
            "Shelley's printed footnote reads: 'This poem was conceived and chiefly written in a wood that "
            "skirts the Arno, near Florence, and on a day when that tempestuous wind, whose temperature "
            "is at once mild and animating, was collecting the vapours which pour down the autumnal rains. "
            "They began, as I foresaw, at sunset with a violent tempest of hail and rain, attended by that "
            "magnificent thunder and lightning peculiar to the Cisalpine regions. The phenomenon alluded "
            "to at the conclusion of the third stanza is well known to naturalists. The vegetation at the "
            "bottom of the sea, of rivers, and of lakes, sympathises with that of the land in the change "
            "of seasons, and is consequently influenced by the winds which announce it.' This is the poet's "
            "historical note, not a scientific claim by the library. A Poetry Foundation survey documents "
            "individual anthology appearances, not a global ranking. England is an associated place."
        ),
        "sourceTitle": "Prometheus Unbound · London, 1820, pp. 188–192",
        "source": "https://archive.org/download/prometheusunboun00shelrich/prometheusunboun00shelrich.pdf#page=192",
        "contextSourceTitle": "Poetry Foundation · anthology survey",
        "contextSource": "https://www.poetryfoundation.org/articles/68445/hit-singles",
        "rights": HISTORICAL_RIGHTS,
        "searchAliases": [
            "O wild West Wind", "Ode on the West Wind", "everywhere", "aery surge",
            "O uncontrollable", "If Winter comes, can Spring be far behind",
        ],
        "stanzas": [1, 3, 3, 3, 3, 2] * 5,
    },
    {
        "key": "hopkins-windhover", "title": "The Windhover", "author": "Gerard Manley Hopkins",
        "authorId": "gerard-manley-hopkins", "authorYears": "1844–1889", "country": "England",
        "language": "English", "lang": "en", "era": "19th century", "year": 1918,
        "yearLabel": "1918 printing · not necessarily composition date", "form": "Sonnet",
        "collection": "Poems of Gerard Manley Hopkins · Bridges edition",
        "context": (
            "The complete sonnet is separately headed in Robert Bridges's edited first collection, "
            "catalogued by the National Library of Ireland as 1918; the scanned title page itself has no "
            "printed year. Its dedication is To Christ our Lord, and Pied Beauty begins on the next page. "
            "The 1918 reading prints ecstacy, shéer plód and gold-vermillion. Typographic wraps within "
            "verse lines are rejoined, but the deliberate king-/dom line break is retained. Small capitals, "
            "indentation and punctuation spacing are normalized. The Poetry Foundation discusses this "
            "individual poem; its modern text is not the source of this reading. England is an associated "
            "place, not a claim about composition."
        ),
        "sourceTitle": "Poems of Gerard Manley Hopkins · Bridges edition, 1918, p. 29",
        "source": "https://archive.org/download/poemsofgerardman030114mbp/poemsofgerardman030114mbp.pdf#page=43",
        "contextSourceTitle": "Poetry Foundation · The Windhover guide",
        "contextSource": "https://www.poetryfoundation.org/articles/69191/gerard-manley-hopkins-the-windhover",
        "rights": HOPKINS_RIGHTS,
        "searchAliases": [
            "I caught this morning morning's minion", "kingdom of daylight's dauphin", "ecstasy",
            "sheer plod makes plough down sillion", "gold-vermillion",
        ],
        "stanzas": [8, 3, 3],
    },
    {
        "key": "hopkins-pied-beauty", "title": "Pied Beauty", "author": "Gerard Manley Hopkins",
        "authorId": "gerard-manley-hopkins", "authorYears": "1844–1889", "country": "England",
        "language": "English", "lang": "en", "era": "19th century", "year": 1918,
        "yearLabel": "1918 printing · not necessarily composition date", "form": "Sonnet",
        "collection": "Poems of Gerard Manley Hopkins · Bridges edition",
        "context": (
            "Bridges's 1918 edition prints this complete eleven-line curtal sonnet separately, before "
            "Hurrahing in Harvest. It retains the printed stress marks in áll trádes and the hyphen in "
            "fathers-forth; a long verse line is rejoined across its printer wrap. Small capitals, "
            "indentation and punctuation spacing are normalized. EBSCO discusses the individual poem "
            "and its form; its modern commentary is not the source of this reading. England is an "
            "associated place, not a claim about composition."
        ),
        "sourceTitle": "Poems of Gerard Manley Hopkins · Bridges edition, 1918, p. 30",
        "source": "https://archive.org/download/poemsofgerardman030114mbp/poemsofgerardman030114mbp.pdf#page=44",
        "contextSourceTitle": "EBSCO · Pied Beauty",
        "contextSource": "https://www.ebsco.com/research-starters/history/pied-beauty-gerard-manley-hopkins",
        "rights": HOPKINS_RIGHTS,
        "searchAliases": ["Glory be to God for dappled things", "all trades", "He fathers forth"],
        "stanzas": [6, 5],
    },
    {
        "key": "trakl-grodek", "title": "Grodek", "author": "Georg Trakl", "authorId": "georg-trakl",
        "authorYears": "1887–1914", "country": "Austria", "language": "German", "lang": "de",
        "era": "20th century", "year": 1915, "yearLabel": "1915 printing · not necessarily composition date",
        "form": "Verse", "collection": "Brenner-Jahrbuch · 1915",
        "context": (
            "The complete separately headed seventeen-line poem is printed on p. 14 of the posthumous "
            "Brenner-Jahrbuch edited by Ludwig von Ficker. Its printed September 1914 date is not verse. "
            "The witness reads tötlichen and Düster; later editions often read tödlichen and Düstrer. "
            "Two long lines are rejoined across printer wraps; typeface and spacing are normalized. "
            "EBSCO discusses this individual war poem and its reception. Austria is an associated place, "
            "not a claim about composition."
        ),
        "sourceTitle": "Brenner-Jahrbuch · 1915, p. 14",
        "source": "https://commons.wikimedia.org/wiki/File:Trakl_grodek.jpg",
        "contextSourceTitle": "EBSCO · Grodek", "contextSource": "https://www.ebsco.com/research-starters/history/grodek-georg-trakl/",
        "rights": TRAKL_RIGHTS,
        "searchAliases": ["Gródek", "Von tödlichen Waffen", "Düstrer hinrollt", "Die ungebornen Enkel"],
        "stanzas": [17],
    },
    {
        "key": "tyutchev-silentium", "title": "Silentium.", "titleLang": "la", "author": "Fyodor Tyutchev",
        "authorId": "fyodor-tyutchev", "authorOriginal": "Фёдор Иванович Тютчев", "authorYears": "1803–1873",
        "authorAliases": ["Федор Тютчев", "Фёдор Тютчев", "Fedor Tyutchev", "Fyodor Tiutchev"],
        "country": "Russia", "language": "Russian", "lang": "ru", "era": "19th century", "year": 1854,
        "yearLabel": "1854 printing · not necessarily composition date", "form": "Lyric",
        "collection": "Стихотворения Ф. Тютчева · 1854",
        "context": (
            "The 1854 collection names Ф. Тютчев and prints this complete eighteen-line poem as a "
            "separately headed work between numbered neighbors. Its first stanza reads И всходят и зайдут "
            "оне / Как звезды ясные в ночи, and its last has Дневные ослепят лучи. An 1836 printing has "
            "Встают и заходят оне / Безмолвно, как звезды в ночи and Дневные разгонят лучи; these are "
            "readings of one work. Pre-reform letters, adjective endings, terminal hard signs and spacing "
            "are modernized; the printed оне is retained. The Guardian selected the poem individually, "
            "not as a licence for its modern translation. Russia is an associated place, not a claim about "
            "composition."
        ),
        "sourceTitle": "Стихотворения Ф. Тютчева · 1854, p. 12",
        "source": TYUTCHEV_SCAN + "?page=190",
        "contextSourceTitle": "The Guardian · Silentium selection",
        "contextSource": "https://www.theguardian.com/books/2015/feb/21/saturday-poem-silentium-by-fyodor-tyutchev-robert-chandler",
        "rights": HISTORICAL_RIGHTS,
        "searchAliases": [
            "Silentium!", "Молчи скрывайся и таи", "Встают и заходят оне",
            "Безмолвно как звезды в ночи", "Дневные разгонят лучи", "Be silent hide away",
        ],
        "stanzas": [6, 6, 6],
    },
    {
        "key": "tyutchev-vesennyaya-groza", "title": "Весенняя гроза", "author": "Fyodor Tyutchev",
        "authorId": "fyodor-tyutchev", "authorOriginal": "Фёдор Иванович Тютчев", "authorYears": "1803–1873",
        "authorAliases": ["Федор Тютчев", "Фёдор Тютчев", "Fedor Tyutchev", "Fyodor Tiutchev"],
        "country": "Russia", "language": "Russian", "lang": "ru", "era": "19th century", "year": 1854,
        "yearLabel": "1854 printing · not necessarily composition date", "form": "Lyric",
        "collection": "Стихотворения Ф. Тютчева · 1854",
        "context": (
            "The complete separately headed 1854 poem has four quatrains, including the final Hebe "
            "stanza; Сон на море follows it. A study from Oryol State University discusses this individual "
            "poem and its earlier, different opening. Pre-reform letters, adjective endings, terminal hard "
            "signs and spacing are modernized; the 1854 spelling ветренная is retained. Russia is an "
            "associated place, not a claim about composition."
        ),
        "sourceTitle": "Стихотворения Ф. Тютчева · 1854, p. 24",
        "source": TYUTCHEV_SCAN + "?page=202",
        "contextSourceTitle": "Oryol State University · study of Весенняя гроза",
        "contextSource": "https://cyberleninka.ru/article/n/mifologicheskiy-podtekst-stihotvoreniya-f-i-tyutcheva-vesennyaya-groza",
        "rights": HISTORICAL_RIGHTS,
        "searchAliases": ["Spring Thunderstorm", "Spring Storm", "Люблю грозу в начале мая", "ветреная Геба"],
        "stanzas": [4, 4, 4, 4],
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
            raise ValueError(f"Unexpected stanza boundaries: {work['key']}")
        record = {key: value for key, value in work.items() if key not in {"key", "stanzas"}}
        record.update({
            "id": "recognized-world-classics-4-" + work["key"], "direction": "ltr", "themes": [],
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

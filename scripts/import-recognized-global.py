#!/usr/bin/env python3
"""Reproduce six individually documented readings from historical editions."""

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-global-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-global.json"
READINGS_SHA256 = "9c9b4250559dd77fb8dfd0bd95ba18ef7f45a351a5954282c8432bcf47e351c3"
CC = "https://creativecommons.org/licenses/by-sa/4.0/"

# Hashes identify the witnesses examined; they do not prove transcription accuracy.
EVIDENCE = {
    "rota-critical-1915-p020.jpg": "740a6863cb26dd0ec49fe160003dd62d859ea53f2a5a2d041070e448f426e48c",
    "rota-critical-1915-p244.jpg": "5a9f61aefe0d705796355ad1aebcc9ce38ef8a8ea6c7adb1bbe22124251ccd8e",
    "rota-critical-1915-p246.jpg": "a2b759b48d38e4b8e6fc1b05406fc2e31faa4b0af75d2e324304f17115a03b9b",
    "mickiewicz-romantycznosc-1899-p97.jpg": "11caa3503bec8cf0c82e3032b11710dfc3f522acfd12fd9beae5730caa8d5652",
    "mickiewicz-romantycznosc-1899-p98.jpg": "c85e94c82171f1aeb93905012c456bc64cffa23640274b6f5360095bec8cf679",
    "mickiewicz-romantycznosc-1899-p99.jpg": "40d1ee87a7dc078533bacd8fd3aa54ce62d80c4a130b03d886974e196d946292",
    "kipling-1910-p207.jpg": "c610fef09ee3b1fad743640a9be9521f2c25328697ba9e86e27f2f00dc47f62d",
    "kipling-1910-p208.jpg": "fc7423a9f78c0f47ceececc9f562dad547865712ba1b72673d60e11f93e6d09f",
    "arnold-1897-p251.jpg": "908381b8ec9eaf1602966ec1e909b8665785bd826949d33453e95d3ba3e56ec1",
    "arnold-1897-p252.jpg": "ee1eaecdf6243fa265043f9a052d8f45f55443fd1a555dd94ecf4a40d99e522b",
    "vallejo-heraldos-1918.pdf": "4a1294289fca4346030596eded0fc092ebdeac1dc632e356c0363af9b721596c",
    "garcilaso-obras-1911.pdf": "0558e728fc98860b4eee385e35511a19ff2984edac8c8e349928f1a506579f1c",
}


def wiki(language, title, revision):
    return f"https://{language}.wikisource.org/w/index.php?title={quote(title, safe='')}&oldid={revision}"


def polish_page(name, revision):
    return wiki("pl", f"Strona:{name}", revision)


def english_page(book, page, revision):
    return wiki("en", f"Page:{book}/{page}", revision)


MICKIEWICZ = "PL Poezye Adama Mickiewicza. T. 1. (1899)"
KIPLING = "Rewards and Fairies (Kipling, 1910).djvu"
ARNOLD = "The poetical works of Matthew Arnold, 1897.djvu"
WORKS = [
    {
        "key": "konopnicka-rota", "title": "Rota", "author": "Maria Konopnicka",
        "authorId": "maria-konopnicka", "authorYears": "1842–1910", "country": "Poland",
        "language": "Polish", "lang": "pl", "year": 1915, "era": "20th century", "form": "Verse",
        "collection": "Poezye · critical edition, volume 7", "lines": 18,
        "source": "https://commons.wikimedia.org/wiki/File:PL_Maria_Konopnicka-Poezye_T._7_020.jpg",
        "sourceTitle": "Poezye · critical edition, 1915, p. 10",
        "pages": [polish_page("PL Maria Konopnicka-Poezye T. 7 020.jpg", 1913574)],
        "wikiLanguage": "Polish",
        "reception": "https://muzeumzarnowiec.pl/rota-polska-piesn-patriotyczna/",
        "detail": (
            "The 1915 critical edition prints three complete stanzas in its main text; its critical apparatus "
            "records an additional stanza as an autograph variant. Other versions have four stanzas; they are "
            "not spliced into this reading or counted separately. The Konopnicka Museum describes the poem's "
            "later public life as a patriotic song. The first-publication history is contested."
        ),
    },
    {
        "key": "mickiewicz-romantycznosc", "title": "Romantyczność", "author": "Adam Mickiewicz",
        "authorId": "adam-mickiewicz", "authorYears": "1798–1855", "country": "Poland",
        "language": "Polish", "lang": "pl", "year": 1899, "era": "19th century", "form": "Ballad",
        "collection": "Poezye Adama Mickiewicza · volume 1", "lines": 75,
        "source": "https://commons.wikimedia.org/wiki/File:PL_Poezye_Adama_Mickiewicza._T._1._(1899)_097.jpg",
        "sourceTitle": "Poezye Adama Mickiewicza · 1899, pp. 85–87",
        "pages": [polish_page(f"{MICKIEWICZ} {page}.jpg", revision)
                  for page, revision in [("097", 2609572), ("098", 2609573), ("099", 2609576)]],
        "wikiLanguage": "Polish",
        "reception": "https://zpe.gov.pl/b/miej-serce-i-patrzaj-w-serce-romantycznosc-adama-mickiewicza-jako-manifest-romantyzmu/P147pm1fx",
        "detail": (
            "The 1899 edition prints the complete ballad with a Shakespeare epigraph in English and a Polish "
            "rendering; both are retained as printed. The English epigraph is marked in its own language, "
            "not offered as a translation of the ballad. The displayed line count includes six epigraph "
            "and attribution lines. The next poem on p. 87 is excluded."
        ),
        "textLanguageOverrides": [{"line": line, "lang": "en"} for line in range(1, 5)],
    },
    {
        "key": "kipling-if", "title": "If—", "author": "Rudyard Kipling", "authorId": "rudyard-kipling",
        "authorYears": "1865–1936", "country": "England", "language": "English", "lang": "en",
        "year": 1910, "era": "20th century", "form": "Verse", "collection": "Rewards and Fairies · 1910",
        "lines": 32,
        "source": "https://commons.wikimedia.org/wiki/File:Rewards_and_Fairies_(Kipling,_1910).djvu?page=207",
        "sourceTitle": "Rewards and Fairies · 1910, pp. 181–182",
        "pages": [english_page(KIPLING, page, rev) for page, rev in [(207, 8903636), (208, 12874971)]],
        "wikiLanguage": "English", "reception": "https://www.poetryfoundation.org/articles/70303/iffy",
        "detail": (
            "This complete four-stanza reading joins the third stanza across the page break. Punctuation "
            "follows the 1910 printing rather than later editions. The linked essay discusses both the poem's "
            "long popularity and criticism of Kipling's imperialist views."
        ),
    },
    {
        "key": "arnold-dover-beach", "title": "Dover Beach", "author": "Matthew Arnold",
        "authorId": "matthew-arnold", "authorYears": "1822–1888", "country": "England",
        "language": "English", "lang": "en", "year": 1897, "era": "19th century", "form": "Lyric",
        "collection": "The Poetical Works of Matthew Arnold · 1897", "lines": 37,
        "source": "https://commons.wikimedia.org/wiki/File:The_poetical_works_of_Matthew_Arnold,_1897.djvu?page=251",
        "sourceTitle": "The Poetical Works · 1897, pp. 213–214",
        "pages": [english_page(ARNOLD, page, rev) for page, rev in [(251, 6520097), (252, 14057411)]],
        "wikiLanguage": "English", "reception": "https://www.poetryfoundation.org/poems/43588/dover-beach",
        "detail": (
            "The 1897 printing begins on p. 213 and ends on p. 214. It reads 'moon-blanched sand'; "
            "the separately linked Poetry Foundation reading has 'moon-blanched land'. This selection "
            "does not silently combine the two versions."
        ),
    },
    {
        "key": "vallejo-heraldos", "title": "Los heraldos negros", "author": "César Vallejo",
        "authorId": "cesar-vallejo", "authorYears": "1892–1938", "country": "Peru",
        "language": "Spanish", "lang": "es", "year": 1918, "era": "20th century", "form": "Verse",
        "yearLabel": "1918 title-page date · distributed in 1919",
        "collection": "Los heraldos negros · 1918 title-page date", "lines": 17,
        "source": "https://commons.wikimedia.org/wiki/File:Los_heraldos_negros.pdf?page=14",
        "sourceTitle": "Los heraldos negros · title poem, printed pp. 3–4",
        "reception": "https://www.revistauniversitaria.uady.mx/pdf/274/ru274-8.pdf",
        "detail": (
            "The separately headed introductory poem is one work, not the entire book. The title page "
            "is dated 1918; the linked university essay says the book was distributed in 1919. The scan "
            "prints 'mas', 'talvez', 'caidas' and 'Esos', and a comma after 'Muerte'; these readings "
            "and its unpaired exclamation marks are retained rather than silently modernized."
        ),
    },
    {
        "key": "garcilaso-soneto-xxiii", "title": "Soneto XXIII · En tanto que de rosa y azucena",
        "author": "Garcilaso de la Vega", "authorId": "garcilaso-de-la-vega",
        "authorYears": "Dates not established here", "country": "Spain", "language": "Spanish", "lang": "es",
        "year": 1911, "era": "16th century", "form": "Sonnet", "collection": "Obras · 1911",
        "lines": 14, "source": "https://archive.org/details/obra00vega/page/n258/mode/1up",
        "sourceTitle": "Obras · 1911, p. 231", "reception": "https://reunido.uniovi.es/index.php/RFF/article/view/19621",
        "detail": (
            "The 1911 edition prints this complete sonnet as XXIII; its title here adds the opening for "
            "discovery. The text follows the scan rather than a modern reconstruction. Its editor, Tomás "
            "Navarro Tomás, states that this edition follows Fernando de Herrera's text with spelling "
            "changes. Its fourth line reads 'enciende el corazón y lo refrena'; another circulated reading "
            "has 'con clara luz la tempestad serena'. Stanza breaks are editorial; the note under the poem "
            "is not part of the verse."
        ),
    },
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_readings():
    if digest(READINGS) != READINGS_SHA256:
        raise ValueError("Historical reading snapshot changed")
    blocks = [block.strip() for block in re.split(r"(?m)^## ", READINGS.read_text(encoding="utf-8")) if block.strip()]
    readings = {}
    for block in blocks:
        key, text = block.split("\n", 1)
        if key in readings:
            raise ValueError(f"Duplicate reading: {key}")
        readings[key] = text.strip()
    if list(readings) != [work["key"] for work in WORKS]:
        raise ValueError("Unexpected reading selection or order")
    return readings


def build():
    readings = load_readings()
    records = []
    for work in WORKS:
        text = readings[work["key"]]
        if sum(bool(line.strip()) for line in text.splitlines()) != work["lines"]:
            raise ValueError(f"Unexpected reading length: {work['key']}")
        rights = (
            f"The {work['year']} historical printing is public domain in the United States; copyright and "
            "moral rights vary by jurisdiction, so check local law. The scan is linked, not republished."
        )
        if work.get("pages"):
            rights += (
                f" Reading adapted from {work['wikiLanguage']} Wikisource contributors under CC BY-SA 4.0 "
                f"({CC}); pinned page histories: " + "; ".join(work["pages"]) + "."
            )
        if work["key"] == "garcilaso-soneto-xxiii":
            rights += (
                " Editor Tomás Navarro Tomás died in 1979; edition-related rights may differ outside the "
                "United States. For comparison, Project Gutenberg eBook 68131 credits Ramón Pajares Box and "
                "the Online Distributed Proofreading Team; its transcription modernizes spelling."
            )
        context = work["detail"] + (
            " Spacing, indentation and typography are normalized; the associated country is not a claim "
            "about the place of composition."
        )
        record = {
            "id": "recognized-" + work["key"], "title": work["title"], "author": work["author"],
            "authorId": work["authorId"], "authorYears": work["authorYears"], "country": work["country"],
            "language": work["language"], "lang": work["lang"], "direction": "ltr", "year": work["year"],
            "yearLabel": work.get("yearLabel", f"{work['year']} printing · not necessarily composition date"),
            "era": work["era"],
            "form": work["form"], "collection": work["collection"], "themes": [], "mood": "paper",
            "context": context, "sourceTitle": work["sourceTitle"], "source": work["source"],
            "contextSourceTitle": "Individual reception and context", "contextSource": work["reception"],
            "rights": rights, "text": text, "translations": [],
        }
        if "textLanguageOverrides" in work:
            record["textLanguageOverrides"] = work["textLanguageOverrides"]
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
                raise ValueError(f"Historical witness does not match: {filename}")
    if args.write:
        OUTPUT.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {len(records)} historical readings.")
    else:
        if json.loads(OUTPUT.read_text(encoding="utf-8")) != records:
            raise ValueError("Catalogue differs from the reviewed readings")
        print(f"Verified {len(records)} historical readings" +
              ("; historical witness hashes match." if args.evidence_dir else "."))


if __name__ == "__main__":
    main()

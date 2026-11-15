#!/usr/bin/env python3
"""Reproduce selected, individually documented historical readings."""

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/world-classics-readings.txt"
OUTPUT = ROOT / "content/poems/world-classics.json"
READINGS_SHA256 = "610758d1e5ad98e56d2021a5b568ab76ba35c53866c02e613da7d04c54869891"

# Exact witnesses inspected; hashes do not themselves prove transcription accuracy.
EVIDENCE = {
    "pushkin-1903-v2.pdf": "459cc3bc8b35d5fa66c46d140862a57e33cbe53e6ec9e07e210ff8b4cd5a5df8",
    "rizal-education-1921-derbyshire-discovery.pdf": "5ef386f58c9cd24572347662e52b820c20c2ebe9ed2b7da3a0ffd8477b82fa92",
    "rizal-noli-1903-p05-discovery.jpg": "ff0da117c2a40e1d8d1dbd7397b3affc085cb2d91a3f683d0a973e67dead329b",
    "rizal-noli-1903-p11-discovery.jpg": "7f2e62fac7e337585f6702cccdf21fffda809acdc784ed8026d7f1ead97c07ec",
    "rizal-noli-1903-p12-discovery.jpg": "9bbf80f6dde2970f2e83c46a2dc806dab483d7743ddbe59693adc148b6208ed7",
    "rizal-noli-1903-p13-discovery.jpg": "569d9aad2f84ba76bc2e0339e5489d62a09d28bb5c12e34df91e8c1122b87006",
    "wordsworth-1815-p388-discovery.jpg": "178e210723344af73a6d65a9df3bbf4fea6095497af7cf7ff958fdfb932f4dc6",
    "wordsworth-1815-p389-discovery.jpg": "6e6282fbbc1521937157c8d56217e6584eada65fb494e98b4404189e6902f1c2",
    "shelley-ozymandias-1819-p106-discovery.jpg": "0504e524001014fedbb5c59a4e3d72c5f4061046220656323d959dddbe52a55b",
    "yeats-innisfree-1920-p44-discovery.jpg": "1f2a69702a496311e04872365b7e02674bd9677c4ed75d51e4ad8ea7155a95d6",
    "lazarus-colossus-1889-p216-discovery.jpg": "12a4aae3bf134ea7c4b0185374ed1aab22941232b17cb2b6bfb23e71bd3d685b",
    "lazarus-colossus-1889-p217-discovery.jpg": "08ec704c7c0de54d9a06ad6e2b823896c07cd18550db4c446a0d4d67db3013d5",
    "frost-new-hampshire-1923-title-p9-discovery.jpg": "cf5be75e873aa7b6e6ea4c9643923d105904cbcb61c042f8bd543dc38c0640e1",
    "frost-nothing-gold-1923-p98-discovery.jpg": "f4731ed5194fe7a9120fdadc69b5ee89ab3933c090434226fef75db421193e49",
    "frost-stopping-1923-p101-discovery.jpg": "7fe5513d8454501ab3a19d6f6713070ec6783e161f018990b4a226cffb7925a2",
    "hughes-weary-blues-1926-title-p7-discovery.jpg": "60fdfd54f72088ea0aecb3f091f745c9ca8ee25127e94c23e9b8a86217e3b46c",
    "hughes-rivers-1926-p58-discovery.jpg": "31d21b96639fbe63ee13882aae83a8c15db4492ee3b272756b25bef258b128ef",
    "hughes-mother-to-son-1926-p114-discovery.jpg": "2635db1c71b6400c04e976d9955c9d6f68328ab8ae66706aacda9bb99482359c",
    "hughes-i-too-1926-p116-discovery.jpg": "d0a11be2867b82e68a491dc9c3a3362339c602d2cef0b23583692ac18d69e234",
}

AUTHORS = {
    "rizal": ("José Rizal", "jose-rizal", "1861–1896", "Philippines", "Spanish", "es"),
    "pushkin": ("Alexander Pushkin", "alexander-pushkin", "1799–1837", "Russia", "Russian", "ru"),
    "wordsworth": ("William Wordsworth", "william-wordsworth", "1770–1850", "England", "English", "en"),
    "shelley": ("Percy Bysshe Shelley", "percy-bysshe-shelley", "1792–1822", "England", "English", "en"),
    "yeats": ("William Butler Yeats", "william-butler-yeats", "1865–1939", "Ireland", "English", "en"),
    "lazarus": ("Emma Lazarus", "emma-lazarus", "1849–1887", "United States", "English", "en"),
    "frost": ("Robert Frost", "robert-frost", "1874–1963", "United States", "English", "en"),
    "hughes": ("Langston Hughes", "langston-hughes", "1901–1967", "United States", "English", "en"),
}

PUSHKIN = "https://archive.org/download/sochinenijaaspushkinat2liricheskies82/sochinenijaaspushkinat2liricheskies82.pdf"
RIZAL = "https://commons.wikimedia.org/wiki/File:Noli_me_t%C3%A1ngere_(1903).pdf"
DERBYSHIRE = "https://archive.org/details/ahz9301.0001.001.umich.edu/page/n79/mode/1up"
CC = "https://creativecommons.org/licenses/by-sa/4.0/"


def wiki(title, revision):
    return f"https://en.wikisource.org/w/index.php?title={quote(title, safe='')}&oldid={revision}"


def pages(book, selections):
    return [wiki(f"Page:{book}/{page}", revision) for page, revision in selections]


WORDS = "Poems by William Wordsworth (1815) Volume 1.djvu"
SHELLEY = "Rosalind and Helen (Shelley).djvu"
YEATS = "The year's at the spring.djvu"
LAZARUS = "The poems of Emma Lazarus volume 1.djvu"
FROST = "New Hampshire (Frost, 1923).djvu"
HUGHES = "The weary blues - 1926.djvu"

WORKS = [
    {
        "key": "rizal-farewell", "author": "rizal", "title": "Mi último adiós", "year": 1903,
        "era": "19th century", "form": "Poem", "collection": "Noli me tángere · 1903 edition",
        "lines": 70, "source": RIZAL + "?page=11", "sourceTitle": "Noli me tángere · 1903, printed pp. 9–11",
        "reception": "https://web.nlp.gov.ph/nlp-heritage-month-ep-3-mi-ultimo-adios/",
        "detail": (
            "The National Library of the Philippines notes that the manuscript was untitled; this work is "
            "widely known as Mi último adiós. The 1903 printing calls it Mi último pensamiento and contains "
            "fourteen five-line stanzas. The last stanza prints 'an el', apparently a typographical error, "
            "which is retained here. Other early printings and the manuscript differ substantially; this "
            "is the 1903 reading, not a reconstruction of the manuscript."
        ),
    },
    {
        "key": "pushkin-kern", "author": "pushkin", "title": "К А. П. Керн", "year": 1903,
        "era": "19th century", "form": "Lyric", "collection": "Сочинения А. С. Пушкина · volume 2",
        "lines": 24, "source": PUSHKIN + "#page=37", "sourceTitle": "Pushkin · collected works, 1903, pp. 27–28",
        "reception": "https://artmuseum.ru/listofdays/07/19/AS_Pushkin_vruchil_AP_Kern_stihotvorenie_Ya_pomnyu_chudnoe_mgnov",
        "detail": "The 1903 printing names A. P. Kern and dates the poem 1825; the familiar opening also identifies it.",
    },
    {
        "key": "pushkin-i-loved-you", "author": "pushkin", "title": "Я вас любил", "year": 1903,
        "era": "19th century", "form": "Lyric", "collection": "Сочинения А. С. Пушкина · volume 2",
        "lines": 8, "source": PUSHKIN + "#page=193", "sourceTitle": "Pushkin · collected works, 1903, scan p. 193",
        "reception": "https://russianlife.com/the-russia-file/two-miracles-of-russian-love-poetry",
        "detail": "This eight-line lyric is untitled in the selected printing; its opening supplies the catalogue title.",
    },
    {
        "key": "pushkin-winter-morning", "author": "pushkin", "title": "Зимнее утро", "year": 1903,
        "era": "19th century", "form": "Lyric", "collection": "Сочинения А. С. Пушкина · volume 2",
        "lines": 30, "source": PUSHKIN + "#page=211", "sourceTitle": "Pushkin · collected works, 1903, pp. 201–202",
        "reception": "https://magazines.gorky.media/wp-content/uploads/2020/04/13-Vlashhenko.pdf",
        "detail": "The complete five-stanza poem ends on the following page, before a printed date.",
    },
    {
        "key": "wordsworth-daffodils", "author": "wordsworth", "title": "I wandered lonely as a Cloud",
        "year": 1815, "era": "19th century", "form": "Lyric", "collection": "Poems · 1815, volume 1",
        "lines": 24, "pages": pages(WORDS, [(388, 9455867), (389, 9725939)]),
        "reception": "https://wordsworth.org.uk/wordsworth/the-poetry",
        "detail": (
            "Known as Daffodils, this is the expanded four-stanza 1815 reading, not the earlier three-stanza "
            "1807 version. The printing uses 'shew'; the footnote is not part of the verse."
        ),
    },
    {
        "key": "shelley-ozymandias", "author": "shelley", "title": "Ozymandias", "year": 1819,
        "era": "19th century", "form": "Sonnet", "collection": "Rosalind and Helen · 1819",
        "lines": 14, "pages": pages(SHELLEY, [(106, 15995652)]),
        "reception": "https://www.poetryfoundation.org/articles/69503/percy-bysshe-shelley-ozymandias",
        "detail": "The 1819 printing reads 'desart'; its wrapped lines have been rejoined.",
    },
    {
        "key": "yeats-innisfree", "author": "yeats", "title": "The Lake Isle of Innisfree", "year": 1920,
        "era": "19th century", "form": "Lyric", "collection": "The Year's at the Spring · 1920",
        "lines": 12, "pages": pages(YEATS, [(44, 8453084)]),
        "reception": "https://www.poetryfoundation.org/poems/43281/the-lake-isle-of-innisfree",
        "detail": "This is the complete twelve-line reading in the 1920 New York anthology, not an 1889 printing.",
    },
    {
        "key": "lazarus-new-colossus", "author": "lazarus", "title": "The New Colossus", "year": 1889,
        "era": "19th century", "form": "Sonnet", "collection": "The Poems of Emma Lazarus · volume 1",
        "lines": 14, "pages": pages(LAZARUS, [(216, 6820961), (217, 9364740)]),
        "reception": "https://www.nps.gov/stli/learn/historyculture/colossus.htm",
        "detail": "The complete fourteen-line sonnet spans two pages; the following poem and footnote are excluded.",
    },
    {
        "key": "frost-nothing-gold", "author": "frost", "title": "Nothing Gold Can Stay", "year": 1923,
        "era": "20th century", "form": "Lyric", "collection": "New Hampshire · 1923",
        "lines": 8, "pages": pages(FROST, [(98, 9992531)]),
        "reception": "https://www.poetryfoundation.org/poetrymagazine/articles/70186/orality-literacy-and-the-memorized-poem",
        "detail": "The complete eight-line poem is separately titled in the 1923 book.",
    },
    {
        "key": "frost-stopping-by-woods", "author": "frost", "title": "Stopping by Woods on a Snowy Evening",
        "year": 1923, "era": "20th century", "form": "Lyric", "collection": "New Hampshire · 1923",
        "lines": 16, "pages": pages(FROST, [(101, 14417296)]),
        "reception": "https://pmc.ncbi.nlm.nih.gov/articles/PMC11844020/",
        "detail": "The complete four-stanza 1923 reading retains both repetitions of the last line.",
    },
    {
        "key": "hughes-rivers", "author": "hughes", "title": "The Negro Speaks of Rivers", "year": 1926,
        "era": "20th century", "form": "Poem", "collection": "The Weary Blues · 1926",
        "lines": 10, "pages": pages(HUGHES, [(58, 12044996)]),
        "reception": "https://www.searchablemuseum.com/the-negro-speaks-of-rivers",
        "detail": "The 1926 printing dedicates the poem to W. E. B. DuBois; long printed wraps are rejoined.",
    },
    {
        "key": "hughes-mother-to-son", "author": "hughes", "title": "Mother to Son", "year": 1926,
        "era": "20th century", "form": "Poem", "collection": "The Weary Blues · 1926",
        "lines": 20, "pages": pages(HUGHES, [(114, 12044935)]),
        "reception": "https://www.poetryfoundation.org/articles/88972/langston-hughes-selections",
        "detail": "This is the complete twenty-line reading from the 1926 book, retaining its spoken register.",
    },
    {
        "key": "hughes-i-too", "author": "hughes", "title": "I, Too", "year": 1926,
        "era": "20th century", "form": "Poem", "collection": "The Weary Blues · 1926",
        "lines": 18, "pages": pages(HUGHES, [(116, 12044941)]),
        "reception": "https://www.smithsonianmag.com/smithsonian-institution/what-langston-hughes-powerful-poem-i-too-americas-past-present-180960552/",
        "detail": (
            "The 1926 book calls this poem Epilogue and reads 'I'll sit at the table'; "
            "later circulated versions have different wording. The familiar title I, Too aids discovery."
        ),
    },
]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_readings():
    if sha256(READINGS) != READINGS_SHA256:
        raise ValueError("Historical reading snapshot changed")
    blocks = [block.strip() for block in re.split(r"(?m)^## ", READINGS.read_text(encoding="utf-8")) if block.strip()]
    readings = {}
    for block in blocks:
        key, text = block.split("\n", 1)
        if key in readings:
            raise ValueError(f"Duplicate reading: {key}")
        readings[key] = text.strip()
    expected = [WORKS[0]["key"], "rizal-derbyshire", *[work["key"] for work in WORKS[1:]]]
    if list(readings) != expected:
        raise ValueError("Unexpected reading selection or order")
    return readings


def build():
    readings = load_readings()
    records = []
    for work in WORKS:
        name, author_id, years, country, language, lang = AUTHORS[work["author"]]
        text = readings[work["key"]]
        if sum(bool(line.strip()) for line in text.splitlines()) != work["lines"]:
            raise ValueError(f"Unexpected verse length: {work['key']}")
        refs = work.get("pages", [])
        if refs:
            source, source_title = refs[0], f"English Wikisource contributors · {work['year']} page transcription"
            rights = (
                f"The {work['year']} printing is public domain in the United States; copyright and moral rights "
                "vary by jurisdiction, so check local law. The scan is linked, not republished. Reading adapted "
                f"from English Wikisource contributors under CC BY-SA 4.0 ({CC}); pinned pages: "
                + "; ".join(refs) + "."
            )
        else:
            source, source_title = work["source"], work["sourceTitle"]
            rights = (
                f"The {work['year']} historical printing is public domain in the United States; copyright and "
                "moral rights vary by jurisdiction, so check local law. The scan is linked, not republished."
            )
        context = work["detail"] + (
            f" This reading follows the {work['year']} printing; line wrapping, indentation and typography "
            "are normalized. The associated country is not a claim about where it was written."
        )
        if work["author"] == "pushkin":
            context += " Pre-reform Russian spelling is modernized for reading; the printed wording is retained."
        translations = []
        if work["key"] == "rizal-farewell":
            translation = readings["rizal-derbyshire"]
            if sum(bool(line.strip()) for line in translation.splitlines()) != 70:
                raise ValueError("Unexpected Derbyshire translation length")
            translations.append({
                "language": "English", "title": "My Last Farewell · 1921 printing",
                "translator": "Charles E. Derbyshire",
                "text": translation, "source": DERBYSHIRE,
                "rights": (
                    "Derbyshire's English version is separately credited in Camilo Osias, Rizal and Education "
                    "(1921), appendix A, printed pp. 76–80. This historical translation is public domain in the "
                    "United States; check local copyright and moral rights. It is a verse interpretation, not "
                    "necessarily a translation of the selected 1903 Spanish printing; line wraps are rejoined."
                ),
            })
        record = {
            "id": "world-" + work["key"], "title": work["title"], "author": name,
            "authorId": author_id, "authorYears": years, "country": country, "language": language,
            "lang": lang, "direction": "ltr", "year": work["year"],
            "yearLabel": f"{work['year']} printing · not necessarily composition date",
            "era": work["era"], "form": work["form"], "collection": work["collection"],
            "themes": [], "mood": "paper", "context": context, "sourceTitle": source_title,
            "source": source, "contextSourceTitle": "Individual reception and context",
            "contextSource": work["reception"], "rights": rights, "text": text, "translations": translations,
        }
        if work["author"] == "pushkin":
            record["authorOriginal"] = "Александр Пушкин"
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
            if sha256(args.evidence_dir / filename) != expected:
                raise ValueError(f"Historical witness does not match: {filename}")
    if args.write:
        OUTPUT.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {len(records)} readings and one translation.")
    else:
        if json.loads(OUTPUT.read_text(encoding="utf-8")) != records:
            raise ValueError("Catalogue differs from the reviewed readings")
        print(f"Verified {len(records)} readings and one translation" +
              ("; historical witness hashes match." if args.evidence_dir else "."))


if __name__ == "__main__":
    main()

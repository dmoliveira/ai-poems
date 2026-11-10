#!/usr/bin/env python3
"""Reproduce Arabic readings after verifying their reviewed historical scans."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/arabic-voices-reviewed.json"
READINGS = ROOT / "scripts/sources/arabic-voices-reviewed.txt"
OUTPUT = ROOT / "content/poems/arabic-voices-reviewed.json"
MARRASH_SCAN = (
    "https://upload.wikimedia.org/wikipedia/commons/d/dd/"
    "%D8%A8%D9%86%D8%AA_%D9%81%D9%83%D8%B1.pdf"
)
IBRAHIM_SCAN = (
    "https://archive.org/download/mashahirshuaraal01ubayuoft/"
    "mashahirshuaraal01ubayuoft.pdf"
)
IBRAHIM_COMPARISON = (
    "https://archive.org/download/AAlexandrina-125963/125963%20-%20"
    "%D8%AF%D9%8A%D9%88%D8%A7%D9%86%20%D8%AD%D8%A7%D9%81%D8%B8%20"
    "%D8%A7%D8%A8%D8%B1%D8%A7%D9%87%D9%8A%D9%85.pdf#page=466"
)
EXPECTED_SLUGS = (
    "francis-coffin", "evening-gathering", "bashir-elegy", "steadfast-friend",
    "unlearned-physician", "fragrant-pouch", "photograph", "newborn-greeting",
    "barber", "bereaved-mother", "truth-and-homeland",
)


def digest_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def reading_texts():
    source = READINGS.read_text(encoding="utf8")
    if source != unicodedata.normalize("NFC", source) or not source.endswith("\n"):
        raise ValueError("Readings must use NFC and end with a newline")
    sections = re.split(r"(?m)^=== ([a-z-]+) ===\n", source)
    if sections[0] or tuple(sections[1::2]) != EXPECTED_SLUGS:
        raise ValueError("Unexpected reading sections")
    result = {}
    for slug, section in zip(sections[1::2], sections[2::2], strict=True):
        rows = section.strip().split("\n")
        if any(
            row.count(" | ") != 1
            or any(part != part.strip() or not part for part in row.split(" | "))
            for row in rows
        ) or re.search(r"[\u0610-\u061a\u064b-\u065f\u0670\u0640]", section):
            raise ValueError(f"Unexpected reading transcription: {slug}")
        result[slug] = "\n".join(row.replace(" | ", "\n") for row in rows)
    return result


def marrash_record(item, text):
    pages = item["printedPages"]
    wiki_pages = item["wikiPages"]
    if (
        not pages
        or pages != list(range(pages[0], pages[-1] + 1))
        or len(wiki_pages) != len(pages)
        or any(not page.get("pageId") or not page.get("revision") for page in wiki_pages)
    ):
        raise ValueError(f"Unexpected Marrash source selection: {item['slug']}")
    references = "; ".join(
        "https://ar.wikisource.org/w/index.php?"
        f"curid={page['pageId']}&oldid={page['revision']}"
        for page in wiki_pages
    )
    page_label = f"p. {pages[0]}" if len(pages) == 1 else f"pp. {pages[0]}–{pages[-1]}"
    return {
        "id": f"maryana-marrash-1893-{item['slug']}",
        "title": text.split("\n")[0],
        "author": "Maryana Marrash",
        "authorOriginal": "مريانا مراش",
        "authorId": "maryana-marrash",
        "authorYears": "Born 1846 or 1848; died 1919",
        "country": "Syria",
        "language": "Arabic",
        "lang": "ar",
        "direction": "rtl",
        "year": None,
        "yearLabel": "Published by 1893 · composition date not established here",
        "era": "Date not established",
        "form": "Poetry",
        "collection": "Bint Fikr (1893)",
        "themes": [],
        "mood": "sand",
        "context": (
            "A separately introduced work in Maryana Marrash's 1893 Beirut collection. "
            "The linked copy ends mid-work after p. 30; these are the boundaries printed "
            "for this piece, not a claim about all textual traditions. The reading follows "
            "the scan with vowel marks, spacing and some spelling conventions normalized; "
            "lines represent printed half-lines. Syria is associated with the poet, not an "
            "asserted place of composition. Her birth year is disputed: the Library of "
            "Congress authority gives 1846; the linked Arabica encyclopedia gives 1848. "
            "The exact composition date is not established here. " + item["note"]
        ),
        "contextSource": "https://arabica.dohainstitute.org/pages/Maryana-Marrash.aspx",
        "contextSourceTitle": "Arabica · Maryana Marrash biography",
        "sourceTitle": f"Wikimedia Commons · Bint Fikr (1893), {page_label}",
        "source": f"{MARRASH_SCAN}#page={pages[0]}",
        "rights": (
            "The original and 1893 edition are public domain in the United States. "
            "Reading transcription informed by Wikisource contributors and adapted to "
            "the 1893 printing; CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). "
            f"Page revisions and contributor histories: {references}. "
            "The scan is linked, not republished; check local law before reuse."
        ),
        "text": text,
        "translations": [],
    }


def ibrahim_record(item, text):
    if (
        item["slug"] != "truth-and-homeland"
        or item["printedPages"] != [204, 205, 206]
        or item["pdfPages"] != [167, 166, 165]
        or item["comparisonPrintedPages"] != [94, 95, 96, 97]
        or item["comparisonPdfPages"] != [466, 467, 468, 469]
    ):
        raise ValueError("Unexpected Ibrahim source selection")
    return {
        "id": "hafiz-ibrahim-1922-truth-and-homeland",
        "title": "للحق والوطن",
        "author": "Ḥāfiẓ Ibrāhīm",
        "authorOriginal": "حافظ إبراهيم",
        "authorId": "hafiz-ibrahim",
        "authorYears": "Born 1871 or 1872; died 1932",
        "country": "Egypt",
        "language": "Arabic",
        "lang": "ar",
        "direction": "rtl",
        "year": None,
        "yearLabel": "Published by September 1922 · composition date not established here",
        "era": "Date not established",
        "form": "Poetry",
        "collection": "Mashāhīr shuʿarāʾ al-ʿaṣr (1922)",
        "themes": [],
        "mood": "sand",
        "context": (
            "Ahmad ʿUbayd's 1922 anthology titles this poem للحق والوطن and names "
            "al-Akhbār as its source. The compiler cautions that he rarely reprints "
            "previously published poems whole. The linked undated collected edition "
            "separately presents the same 32 couplets under تصريح ٢٨ فبراير, and dates "
            "publication to 1 April 1922. Matching boundaries establish completeness in "
            "these printings, not independent descent or completeness in every tradition. "
            "The 1922 book reads يزكو and ولتنتخب where the comparison reads يذكو and "
            "وتنتخب. Both print يسجح where some online copies have يسجج. Vowel marks "
            "and ornamental dividers are omitted, spacing and some spelling conventions "
            "normalized, and each printed half-line occupies a reading line. Egypt is "
            "associated with the poet, not an asserted composition place. His birth year "
            "is given as 1871 by Britannica and as approximately 1872 by the National "
            "Library of Israel."
        ),
        "contextSource": IBRAHIM_COMPARISON,
        "contextSourceTitle": "Internet Archive · collected Dīwān of Ḥāfiẓ Ibrāhīm, pp. 94–97 (date uncertain)",
        "sourceTitle": "Internet Archive · Mashāhīr shuʿarāʾ al-ʿaṣr (1922), pp. 204–206",
        "source": f"{IBRAHIM_SCAN}#page=167",
        "rights": (
            "The original poem and 1922 printing are public domain in the United States. "
            "The reading is transcribed from that printing; the later collected edition "
            "is linked for comparison, not reproduced. Check local law before reuse."
        ),
        "text": text,
        "translations": [],
    }


def make_records(scans):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    for name, path in scans.items():
        if digest_file(path) != manifest["scanSha256"][name]:
            raise ValueError(f"The reviewed scan has changed: {name}")
    items = manifest["poems"]
    if tuple(item["slug"] for item in items) != EXPECTED_SLUGS:
        raise ValueError("Unexpected reviewed selection")
    readings = reading_texts()
    records = []
    for item in items:
        text = readings[item["slug"]]
        if (
            len(text.split("\n")) != item["couplets"] * 2
            or hashlib.sha256(text.encode("utf8")).hexdigest() != item["textSha256"]
        ):
            raise ValueError(f"Unexpected reviewed transcription: {item['slug']}")
        if item["poet"] == "marrash":
            records.append(marrash_record(item, text))
        elif item["poet"] == "ibrahim":
            records.append(ibrahim_record(item, text))
        else:
            raise ValueError(f"Unexpected poet: {item['poet']}")
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("marrash_scan", type=Path, help="reviewed Bint Fikr PDF")
    parser.add_argument("ibrahim_scan", type=Path, help="reviewed 1922 anthology PDF")
    parser.add_argument("ibrahim_comparison", type=Path, help="reviewed collected edition PDF")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    scans = {
        "bint-fikr-commons.pdf": args.marrash_scan,
        "mashahir-1922.pdf": args.ibrahim_scan,
        "ibrahim-collected-undated.pdf": args.ibrahim_comparison,
    }
    rendered = json.dumps(make_records(scans), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Records differ from the reviewed transcriptions")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

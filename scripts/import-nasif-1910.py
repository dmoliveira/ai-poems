#!/usr/bin/env python3
"""Reproduce a Nasif reading after verifying the reviewed historical scans."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/nasif-nisaiyat-1910.json"
READING = ROOT / "scripts/sources/nasif-nisaiyat-1910.txt"
OUTPUT = ROOT / "content/poems/nasif-nisaiyat-1910.json"
PRIMARY = "https://archive.org/download/alnisaiyatmajmua00nasi/alnisaiyatmajmua00nasi.pdf"
COMPARISON = "https://archive.org/details/AAlexandrina-140749/page/n153/mode/1up"


def digest_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def make_records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    for name, expected in manifest["scanSha256"].items():
        if digest_file(directory / name) != expected:
            raise ValueError(f"The reviewed scan has changed: {name}")
    item = manifest["poem"]
    if (
        item["slug"] != "womens-poem"
        or item["printedPages"] != [144, 145, 146]
        or item["pdfPages"] != [156, 157, 158]
        or item["comparisonPdfPages"] != [154, 155, 156]
        or item["reviewPdfPage"] != 493
    ):
        raise ValueError("Unexpected source selection")
    source = READING.read_text(encoding="utf8")
    text = source.removesuffix("\n")
    if (
        source != unicodedata.normalize("NFC", source)
        or not source.endswith("\n")
        or len(text.split("\n")) != item["couplets"]
        or any(not row or row != row.strip() for row in text.split("\n"))
        or re.search(r"[\u0610-\u061a\u064b-\u065f\u0670\u0640]", text)
        or hashlib.sha256(text.encode("utf8")).hexdigest() != item["textSha256"]
    ):
        raise ValueError("Unexpected reviewed transcription")
    return [{
        "id": "nasif-1910-womens-poem",
        "title": "يا هذه لا تعذلي",
        "author": "Malak Hifni Nasif",
        "authorOriginal": "ملك حفني ناصف",
        "authorId": "malak-hifni-nasif",
        "authorYears": "1886–1918",
        "country": "Egypt",
        "language": "Arabic",
        "lang": "ar",
        "direction": "rtl",
        "year": None,
        "yearLabel": "In a book catalogued 1910 · composition date not established here",
        "era": "Date not established",
        "form": "Poetry",
        "collection": "Al-Nisāʾiyyāt (catalogued 1910)",
        "themes": [],
        "mood": "sand",
        "context": (
            "The book introduces this response to a poem by Ahmad Shawqi under the heading "
            "قصيدة نسائية; the other writers' verses quoted in the introduction are not "
            "Nasif's response. The title here is its opening. The scanned copy appears to lack its "
            "title page; library catalogues date it 1910. The linked later copy also separately "
            "bounds 60 couplets, but its date and relationship to this printing are not "
            "established here. Matching boundaries establish completeness in these printings, "
            "not independent descent or completeness in every tradition. The earlier scan "
            "uses a compact form read provisionally as فحومل, comparing the similar form "
            "in فحنا; it could be mistaken for خومل. It appears to have بتبذل where "
            "the later copy and online texts have بتبدل. The earlier فحيهل differs from "
            "the online فحيهلي. "
            "The printed خلاخل is retained: an errata row proposes خلاخلا, but its page "
            "reference is ambiguous. These readings are provisional, not silent corrections. "
            "Vowel marks are omitted, spelling and spacing normalized, and each printed "
            "couplet occupies one reading line with split words joined. Egypt is associated "
            "with the poet, not an asserted composition place."
        ),
        "contextSource": COMPARISON,
        "contextSourceTitle": "Internet Archive · comparison copy of Al-Nisāʾiyyāt, pp. 148–150 (date uncertain)",
        "sourceTitle": "Internet Archive · Al-Nisāʾiyyāt (catalogued 1910), pp. 144–146",
        "source": f"{PRIMARY}#page={item['pdfPages'][0]}",
        "rights": (
            "The historical original and pre-1931 printing are public domain in the United "
            "States. The reading was informed by Wikisource contributors and adapted to the "
            "earlier scan; CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). "
            f"Revision and contributor history: https://ar.wikisource.org/w/index.php?curid={item['wikiPageId']}&oldid={item['wikiRevision']}. "
            "Scans are linked, not republished; check local law before reuse."
        ),
        "text": text,
        "translations": [],
    }]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the three reviewed PDFs")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(make_records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Record differs from the reviewed transcription")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

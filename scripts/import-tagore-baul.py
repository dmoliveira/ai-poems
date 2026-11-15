#!/usr/bin/env python3
"""Reproduce three directly transcribed readings from Tagore's Baul."""

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/tagore-baul-readings.json"
OUTPUT = ROOT / "content/poems/tagore-baul.json"
READINGS_SHA256 = "2958eed6ceb5418b88473d7d4ef338f177e1710633d660cd2ece486961d2add5"
PDF_NAME = "tagore-baul-1905-discovery.pdf"
PDF_SHA256 = "db95a1aac4e81fd095ad2e9587bd88b8096f8480982535566dab5fab3f22937d"
PDF = "https://archive.org/download/baul_20200913/10804-baul%20%E0%A6%AC%E0%A6%BE%E0%A6%89%E0%A6%B2.pdf"

WORKS = [
    {
        "id": "tagore-baul-sonar-bangla",
        "title": "সোনার বাংলা",
        "displayTitle": "Amar Sonar Bangla",
        "pages": "9–11",
        "pdfPage": 8,
        "country": "India / Bangladesh",
        "reception": "https://en.wikipedia.org/wiki/Amar_Sonar_Bangla",
        "detail": (
            "The song is widely known as Amar Sonar Bangla; an excerpt from its opening is Bangladesh's national "
            "anthem, not a separate poem here. This complete historical printing continues beyond that excerpt. "
            "The last stanza's 'কিনব না তোর' (printed 'কিন্ব') differs from the later circulated "
            "'কিনব না আর, মা, তোর'. "
            "Its composition date is not established here."
        ),
    },
    {
        "id": "tagore-baul-desher-mati",
        "title": "দেশের মাটি",
        "displayTitle": "O Amar Desher Mati",
        "pages": "12–13",
        "pdfPage": 11,
        "country": "India / Bangladesh",
        "reception": "https://en.wikipedia.org/wiki/O_Amar_Desher_Mati",
        "detail": (
            "Known by its opening as O Amar Desher Mati, this song later appeared in the 1972 Bangladeshi film "
            "Ora Egaro Jon. This printing reads 'মিছে কাজে'; later editions have 'বৃথা কাজে'. "
            "The parenthetical line is printed in the source."
        ),
    },
    {
        "id": "tagore-baul-eka",
        "title": "একা",
        "displayTitle": "Ekla Chalo Re",
        "pages": "18–19",
        "pdfPage": 17,
        "country": "India",
        "reception": "https://en.wikipedia.org/wiki/Ekla_Chalo_Re",
        "detail": (
            "This song is widely known as Ekla Chalo Re. Unlike later circulated readings, this printing uses "
            "'চলরে' and explicitly repeats the opening refrain at the end. The separately printed heading is একা."
        ),
    },
]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build():
    if sha256(READINGS) != READINGS_SHA256:
        raise ValueError("Historical reading snapshot changed")
    readings = json.loads(READINGS.read_text(encoding="utf-8"))
    if [item["id"] for item in readings] != [item["id"] for item in WORKS]:
        raise ValueError("Unexpected selection or order")
    if [len(item["text"].splitlines()) for item in readings] != [43, 24, 33]:
        raise ValueError("Unexpected verse or stanza count")

    records = []
    for work, reading in zip(WORKS, readings, strict=True):
        records.append({
            "id": work["id"],
            "title": work["title"],
            "displayTitle": work["displayTitle"],
            "displayTitleLang": "bn-Latn",
            "author": "Rabindranath Tagore",
            "authorOriginal": "রবীন্দ্রনাথ ঠাকুর",
            "authorId": "rabindranath-tagore",
            "authorYears": "1861–1941",
            "country": work["country"],
            "language": "Bengali",
            "lang": "bn",
            "direction": "ltr",
            "year": 1905,
            "yearLabel": "Baul · catalogued 1905",
            "era": "20th century",
            "form": "Song",
            "collection": "Baul · 1905-catalogued printing",
            "themes": [],
            "mood": "paper",
            "context": (
                f"{work['detail']} This is a complete song under its own heading in the Majumdar Library "
                "printing of Baul. The archive dates the book 1905; the scanned title page has no printed year, "
                "but an Imperial Library stamp is dated 1907. The transcription follows this scan, not a later "
                "edited edition; typography, spacing, punctuation and some spellings are normalized. The linked places are "
                "cultural associations, not a claim about where the song was composed."
            ),
            "sourceTitle": f"Tagore · Baul, printed pp. {work['pages']} (catalogued 1905)",
            "source": f"{PDF}#page={work['pdfPage']}",
            "contextSourceTitle": f"Individual reception · {work['displayTitle']}",
            "contextSource": work["reception"],
            "rights": (
                "Bengali original transcribed from the historical printing catalogued 1905; "
                "public domain in the United States. The scan is linked, not republished. "
                "Copyright and moral rights vary elsewhere; check local law."
            ),
            "text": reading["text"],
            "translations": [],
        })
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    operation = parser.add_mutually_exclusive_group(required=True)
    operation.add_argument("--check", action="store_true")
    operation.add_argument("--write", action="store_true")
    parser.add_argument("--evidence-dir", type=Path)
    args = parser.parse_args()
    records = build()
    if args.evidence_dir and sha256(args.evidence_dir / PDF_NAME) != PDF_SHA256:
        raise ValueError("Historical PDF does not match the reviewed witness")
    if args.write:
        OUTPUT.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {len(records)} readings.")
    else:
        if json.loads(OUTPUT.read_text(encoding="utf-8")) != records:
            raise ValueError("Catalogue differs from the reviewed readings")
        print(f"Verified {len(records)} readings" + ("; historical PDF hash matches." if args.evidence_dir else "."))


if __name__ == "__main__":
    main()

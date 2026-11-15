#!/usr/bin/env python3
"""Reproduce two historical Hafez readings and the 1802 paraphrase."""

import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/hafez-persian-readings.json"
OUTPUT = ROOT / "content/poems/hafez-persian.json"
READINGS_SHA256 = "a0aefba4fd5d92c34e0dc3b5ce8e15e3fca92f3ee059b5fccbe297ecdd79640c"
EVIDENCE = {
    "hafez-richardson-1802-research.pdf": "b8a150d1d282f866e6111a3c6e6702441ffd31b8545cbe7ba81842454ce2f6a0",
    "hafez-divan-dli-1902-metadata-only.pdf": "c6700664f763a16534fc71e3c3d540743280ab0e62382e8dc07d70f20750d2f9",
}
SOURCE_1802 = "https://archive.org/download/aspecimenpersia00revigoog/aspecimenpersia00revigoog.pdf"
SOURCE_1902 = "https://archive.org/download/dli.ernet.286749/286749-Diwan%20Hafiz.pdf"


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def comparison(page, revision):
    title = f"برگه:حافظ قزوینی غنی.pdf/{page}"
    return f"https://fa.wikisource.org/w/index.php?title={quote(title.replace(' ', '_'), safe='')}&oldid={revision}"


def build():
    if sha256(READINGS) != READINGS_SHA256:
        raise ValueError("Historical reading snapshot changed")
    readings = json.loads(READINGS.read_text(encoding="utf-8"))
    if [item["id"] for item in readings] != ["hafez-1802-ala-ya-ayyoha-saqi", "hafez-1902-shirazi-turk"]:
        raise ValueError("Unexpected selection or order")
    if [len(item["text"].splitlines()) for item in readings] != [20, 26]:
        raise ValueError("Unexpected verse or stanza count")
    if len(readings[0]["translation"].splitlines()) != 48:
        raise ValueError("Unexpected paraphrase length")

    common = {
        "author": "Hafez",
        "authorOriginal": "حافظ",
        "authorId": "hafez-shirazi",
        "authorYears": "c. 1315–1390 · dates uncertain",
        "country": "Iran",
        "language": "Persian",
        "lang": "fa",
        "direction": "rtl",
        "era": "14th century",
        "form": "Ghazal",
        "themes": [],
        "mood": "paper",
    }
    first = {
        "id": readings[0]["id"],
        "title": readings[0]["text"].splitlines()[0],
        "titleLang": "ar",
        **common,
        "year": 1802,
        "yearLabel": "1802 edition · composition date unknown",
        "collection": "A Specimen of Persian Poetry · 1802",
        "context": (
            "This seven-couplet ghazal follows the complete first ode in John Richardson's A Specimen of Persian Poetry, "
            "revised by S. Rousseau in 1802. Its first and last lines are Arabic; the rest is Persian. "
            "The 1802 printing reads ‘چه جای عیش’; the linked 1941 comparison has ‘چه امن عیش’ and reverses "
            "the third and fourth couplets. Interpretations of the poem differ, and its opening Arabic line's earlier "
            "attribution is disputed. The opening line supplies the title. Spelling variants, spacing and typography "
            "are normalized in the transcription. Iran is an associated place, not a documented composition location; "
            "1802 dates this edition, not the poem."
        ),
        "sourceTitle": "Richardson · A Specimen of Persian Poetry (1802), pp. 1–2",
        "source": f"{SOURCE_1802}#page=24",
        "contextSourceTitle": "Persian Wikisource · 1941 comparison, revision 143728",
        "contextSource": comparison("۱۳۲", 143728),
        "rights": (
            "Persian and Arabic original transcribed from the 1802 printing; public domain in the United States. "
            "The scan is linked, not republished. Copyright and moral rights vary elsewhere; check local law."
        ),
        "text": readings[0]["text"],
        "textLanguageOverrides": [{"line": 1, "lang": "ar"}, {"line": 14, "lang": "ar"}],
        "translations": [{
            "language": "English",
            "title": "The First Ode of Hafez paraphrased",
            "translator": "John Richardson · verse paraphrase, 1802 edition revised by S. Rousseau",
            "source": f"{SOURCE_1802}#page=25",
            "rights": (
                "English paraphrase as printed in Richardson's A Specimen of Persian Poetry (1802), revised by S. Rousseau; "
                "public domain in the United States. Copyright and moral rights vary elsewhere; check local law. "
                "This is a free literary paraphrase, not a literal translation: it adds Leila and a female beloved. "
                "Punctuation is normalized; the mark after ‘look'd’ is unclear in the scan."
            ),
            "text": readings[0]["translation"],
        }],
    }
    second = {
        "id": readings[1]["id"],
        "title": readings[1]["text"].splitlines()[0],
        "titleLang": "fa",
        **common,
        "year": 1902,
        "yearLabel": "1902 edition · composition date unknown",
        "collection": "Dīwān-i Ḥāfiẓ · 1902 printing",
        "context": (
            "This nine-couplet ghazal, often called the Shirazi Turk, follows the complete reading on printed page 6 "
            "of the 1902 Dīwān scan. Interpretations and the text's manuscript history are disputed. "
            "The linked 1941 comparison orders the last three interior couplets differently and reads "
            "‘اگر دشنام فرمایی و گر نفرین دعا گویم’ where this printing has ‘بدم گفتی و خرسندم عفاک الله نکو گفتی’. "
            "In an analysis of the 1941 version, Iraj Bashiri argues that its advice and insult-response couplets "
            "may be later additions; this is a hypothesis, not proof about this printing's different insult-response line. "
            "The 1902 scan is low-resolution: our reading ‘کاین’ may instead be ‘کین’, and the beginning of "
            "‘به آب و رنگ’ is also uncertain. "
            "The opening line supplies the title. Spelling variants, spacing and typography are normalized in the "
            "transcription. Iran is an associated place, not a documented composition location; 1902 dates this printing, "
            "not the poem."
        ),
        "sourceTitle": "Dīwān-i Ḥāfiẓ (1902) · printed p. 6, PDF page 31",
        "source": f"{SOURCE_1902}#page=31",
        "contextSourceTitle": "Persian Wikisource · 1941 comparison, beginning at revision 143730",
        "contextSource": comparison("۱۳۳", 143730),
        "rights": (
            "Persian original transcribed from the 1902 printing; public domain in the United States. "
            "The scan is linked, not republished. Copyright and moral rights vary elsewhere; check local law."
        ),
        "text": readings[1]["text"],
        "textLanguageSpans": [{"line": 15, "text": "عفاک الله", "lang": "ar"}],
        "translations": [],
    }
    return [first, second]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    operation = parser.add_mutually_exclusive_group(required=True)
    operation.add_argument("--check", action="store_true")
    operation.add_argument("--write", action="store_true")
    parser.add_argument("--evidence-dir", type=Path)
    args = parser.parse_args()
    records = build()
    if args.evidence_dir:
        for name, expected in EVIDENCE.items():
            if sha256(args.evidence_dir / name) != expected:
                raise ValueError(f"Historical PDF does not match the reviewed witness: {name}")
    if args.write:
        OUTPUT.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {len(records)} readings.")
    else:
        if json.loads(OUTPUT.read_text(encoding="utf-8")) != records:
            raise ValueError("Catalogue differs from the reviewed readings")
        print(f"Verified {len(records)} readings and one paraphrase" + ("; both historical PDF hashes match." if args.evidence_dir else "."))


if __name__ == "__main__":
    main()

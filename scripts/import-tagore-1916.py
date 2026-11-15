#!/usr/bin/env python3
"""Reproduce three selected Bengali readings from two 1916 printings."""

import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/tagore-1916-readings.json"
OUTPUT = ROOT / "content/poems/tagore-1916.json"
READINGS_SHA256 = "ca51a08410eb1c0d3e31a4a1c99eaf3feb855867ba7ee0beb620f4e263393383"
EVIDENCE = {
    "tagore-kabyagrantha7-1920-commons-discovery.pdf": "3a2b92c76786ad3a425ae5c3fdfdeff7008da342b62a1683cec96193b9c7f1ce",
    "tagore-kabyagrantha10-1916-dli-discovery.pdf": "c69b8dc047f4410306bf3ad266b996420b7382bd85c11c53fc8c05bb44c43fbb",
    "tagore-english-gitanjali-1913-p57-discovery.jpg": "dbda0e21bd9c79f4bcf9062e685d05d5cee5179eec69381a3259c734d91e7234",
    "tagore-english-gitanjali-1913-p58-discovery.jpg": "fead7b3faa678906664d6d76538d1493d4c501e0b3c953f6c6808b909f6a282b",
}
VOL7 = "https://commons.wikimedia.org/wiki/File:কাব্যগ্রন্থ_(সপ্তম_খণ্ড).pdf"
VOL10 = "https://archive.org/download/in.ernet.dli.2015.356788/2015.356788.Kabya-GranthaVol10.pdf"


def wiki_revision(language, title, revision):
    return f"https://{language}.wikisource.org/w/index.php?title={quote(title, safe='')}&oldid={revision}"


WORKS = [
    {
        "id": "tagore-1916-naibedya-72",
        "title": "চিত্ত যেথা ভয়শূন্য",
        "displayTitle": "Chitto Jetha Bhayshunyo",
        "country": "India",
        "form": "Poem",
        "collection": "Naibedya · Kabyagrantha, volume 7",
        "sourceTitle": "Tagore · Kabyagrantha, volume 7 (1916), printed p. 91",
        "source": f"{VOL7}?page=115",
        "revision": ("পাতা:কাব্যগ্রন্থ (সপ্তম খণ্ড).pdf/১১৫", 1085467),
        "reception": "https://en.wikipedia.org/wiki/Chitto_Jetha_Bhayshunyo",
        "detail": (
            "This is the complete numbered Naibedya 72, widely known by its opening. "
            "The separately sourced English Gitanjali 35 is Tagore's earlier free self-reworking of the poem, "
            "not another work or a translation made from this later 1916 printing. "
            "The Bengali ending asks for India to be awakened by a 'নির্দয় আঘাত'; "
            "the English ending differs."
        ),
    },
    {
        "id": "tagore-1916-banglar-mati",
        "title": "বাংলার মাটি বাংলার জল",
        "displayTitle": "Banglar Mati Banglar Jol",
        "country": "India / Bangladesh",
        "form": "Song",
        "collection": "Kabyagrantha, volume 10 · National songs",
        "sourceTitle": "Tagore · Kabyagrantha, volume 10 (1916), printed p. 187",
        "source": f"{VOL10}#page=198",
        "revision": ("পাতা:কাব্যগ্রন্থ (দশম খণ্ড).pdf/১৯৯", 1050422),
        "reception": "https://en.wikipedia.org/wiki/Banglar_Mati_Banglar_Jol",
        "detail": (
            "West Bengal's legislative assembly adopted this song as the state song in 2023. "
            "The complete song ends before the next separator; its repeated invocations are retained. "
            "India and Bangladesh are cultural associations, not claims about composition location."
        ),
    },
    {
        "id": "tagore-1916-ami-chini",
        "title": "আমি চিনি গো চিনি তোমারে",
        "displayTitle": "Ami Chini Go Chini Tomare",
        "country": "India / Bangladesh",
        "form": "Song",
        "collection": "Kabyagrantha, volume 10 · Miscellaneous songs",
        "sourceTitle": "Tagore · Kabyagrantha, volume 10 (1916), printed p. 105",
        "source": f"{VOL10}#page=116",
        "revision": ("পাতা:কাব্যগ্রন্থ (দশম খণ্ড).pdf/১১৭", 1050205),
        "reception": "https://www.jiosaavn.com/song/ami-chini-go-chini-tomare-from-charulata/MQMbHBh2VHg",
        "detail": (
            "The song was sung by Kishore Kumar in Satyajit Ray's 1964 film Charulata; "
            "the recording is not reproduced. The 1916 printing reads 'দেখেচি', 'শুনেচি' and 'সঁপেচি'. "
            "India and Bangladesh are cultural associations, not claims about composition location."
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
    if [sum(bool(line) for line in item["text"].splitlines()) for item in readings] != [14, 18, 11]:
        raise ValueError("Unexpected verse length")

    records = []
    for work, reading in zip(WORKS, readings, strict=True):
        revision = wiki_revision("bn", *work["revision"])
        translations = []
        if "english" in reading:
            english_revisions = [
                wiki_revision("en", "Page:Gitanjali.djvu/57", 7781783),
                wiki_revision("en", "Page:Gitanjali.djvu/58", 15393716),
            ]
            translations.append({
                "language": "English",
                "title": "Where the mind is without fear · 1913 prose reworking",
                "translator": "Rabindranath Tagore · English self-reworking, 1913",
                "text": reading["english"],
                "source": "https://commons.wikimedia.org/wiki/File:Gitanjali.djvu?page=57",
                "rights": (
                    "Tagore's English Gitanjali 35 was printed in 1913 and is public domain in the United States; "
                    "check local copyright and moral rights. This free self-reworking predates the selected 1916 "
                    "Bengali printing. It is not a literal line-by-line translation. The reading was checked "
                    "against printed pp. 27–28, with indentation and wrapping normalized. Wikisource contributor "
                    "transcriptions consulted under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/): "
                    + "; ".join(english_revisions) + ". The scans are linked, not republished."
                ),
            })

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
            "year": 1916,
            "yearLabel": "1916 printing · composition date not established here",
            "era": "20th century",
            "form": work["form"],
            "collection": work["collection"],
            "themes": [],
            "mood": "paper",
            "context": (
                f"{work['detail']} This complete reading follows a Kabyagrantha volume whose title page "
                "prints 1916. Its title here is supplied from the opening; the romanized title is a discovery label. "
                "Spacing, punctuation and some historical spellings are normalized; transcription errors "
                "remain possible. Linked places are associations, not established composition locations."
            ),
            "sourceTitle": work["sourceTitle"],
            "source": work["source"],
            "contextSourceTitle": f"Individual reception · {work['displayTitle']}",
            "contextSource": work["reception"],
            "rights": (
                "Bengali text from the 1916 printing is public domain in the United States; check local copyright "
                "and moral rights. The scan is linked, not republished. The unproofread Bengali Wikisource page "
                "transcription was consulted and corrected against the scan; contributors are credited under "
                "CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/): " + revision + "."
            ),
            "text": reading["text"],
            "translations": translations,
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
    if args.evidence_dir:
        for filename, expected in EVIDENCE.items():
            if sha256(args.evidence_dir / filename) != expected:
                raise ValueError(f"Historical witness does not match: {filename}")
    if args.write:
        OUTPUT.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {len(records)} readings.")
    else:
        if json.loads(OUTPUT.read_text(encoding="utf-8")) != records:
            raise ValueError("Catalogue differs from the reviewed readings")
        print(f"Verified {len(records)} readings" + ("; historical witness hashes match." if args.evidence_dir else "."))


if __name__ == "__main__":
    main()

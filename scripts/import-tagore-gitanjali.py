#!/usr/bin/env python3
"""Build selected Bengali Gitanjali songs from pinned page transcriptions."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = ROOT / "scripts/sources/tagore-gitanjali-bengali-revisions.json"
OUTPUT = ROOT / "content/poems/tagore-gitanjali-bengali.json"
SNAPSHOT_SHA256 = "c3e049ec0db640a22fb65d4a7b139e1f2c2a765731c595615fe181e1e21b4c82"

# Each tuple gives a numbered song, its first and last scan pages, the next
# work's first scan page, and the number of nonblank verse lines.
SPANS = (
    (1, 13, 14, 15, 20), (2, 15, 15, 16, 20), (3, 16, 16, 17, 20),
    (4, 17, 17, 18, 22), (5, 18, 18, 19, 18), (6, 19, 19, 20, 12),
    (7, 20, 20, 21, 13), (8, 21, 21, 22, 16), (9, 22, 22, 23, 20),
    (10, 23, 23, 24, 16), (11, 24, 25, 26, 28), (12, 26, 26, 27, 18),
    (13, 27, 28, 29, 25), (14, 29, 29, 30, 10), (15, 30, 30, 31, 22),
    (16, 31, 31, 32, 16), (17, 32, 32, 33, 20), (18, 33, 34, 35, 30),
    (19, 35, 35, 36, 16), (20, 36, 36, 37, 20), (120, 150, 151, 152, 24),
)

ENGLISH_11 = (
    "Leave this chanting and singing and telling of beads! Whom dost thou worship in this lonely dark corner of a "
    "temple with doors all shut? Open thine eyes and see thy God is not before thee!\n\n"
    "He is there where the tiller is tilling the hard ground and where the path-maker is breaking stones. He is with "
    "them in sun and in shower, and his garment is covered with dust. Put off thy holy mantle and even like him come "
    "down on the dusty soil!\n\n"
    "Deliverance? Where is this deliverance to be found? Our master himself has joyfully taken upon him the bonds of "
    "creation; he is bound with us all for ever.\n\n"
    "Come out of thy meditations and leave aside thy flowers and incense! What harm is there if thy clothes become "
    "tattered and stained? Meet him and stand by him in toil and in sweat of thy brow."
)


def revision_url(page):
    title = quote(page["title"].replace(" ", "_"), safe="")
    return f"https://bn.wikisource.org/w/index.php?title={title}&oldid={page['revision']}"


def scan_url(page):
    name = quote("গীতাঞ্জলি_-_রবীন্দ্রনাথ_ঠাকুর.djvu", safe="")
    return f"https://commons.wikimedia.org/wiki/File:{name}?page={page}"


def extract_page(page, work_number):
    source = page["content"]
    if '<pagequality level="4"' not in source:
        raise ValueError(f"Page not marked validated: {page['number']}")
    matches = re.findall(r"<poem>(.*?)</poem>", source, flags=re.DOTALL)
    if len(matches) != 1:
        raise ValueError(f"Expected one verse block on page {page['number']}")
    text = matches[0].replace("\ufeff", "")
    text = text.replace("{{gap}}", " ").replace("{{ফাঁক}}", " ")
    # Three reversed vowel-sign sequences on page 151 do not render as ও.
    if page["number"] == 151:
        if text.count("\u09be\u09c7") != 3:
            raise ValueError("Unexpected Bengali combining-sign correction count")
        text = text.replace("\u09be\u09c7", "\u09c7\u09be")
    if re.search(r"[{}<>]|\[\[", text):
        raise ValueError(f"Unrecognized markup on page {page['number']}")
    text = "\n".join(re.sub(r"^:+", "", line).strip() for line in text.splitlines()).strip()
    if work_number == 16:
        # Wikisource places this printed date inside the poem tag.
        text, count = re.subn(r"\n+আষাঢ় ১৩১৬\s*$", "", text)
        if count != 1:
            raise ValueError("Expected printed date after song 16")
    return unicodedata.normalize("NFC", re.sub(r"\n{3,}", "\n\n", text))


def records():
    data = SNAPSHOT.read_bytes()
    if hashlib.sha256(data).hexdigest() != SNAPSHOT_SHA256:
        raise ValueError("Pinned Bengali Wikisource snapshot changed")
    works = json.loads(data)["works"]
    if [work["number"] for work in works] != [row[0] for row in SPANS]:
        raise ValueError("Unexpected numbered-song selection")
    results = []
    for work, (number, first, last, next_page, count) in zip(works, SPANS, strict=True):
        if (work["firstPage"], work["lastPage"]) != (first, last) or next_page != last + 1:
            raise ValueError(f"Unexpected page boundary for song {number}")
        pages = work["pages"]
        if [page["number"] for page in pages] != list(range(first, last + 1)):
            raise ValueError(f"Missing or duplicated page for song {number}")
        text = "\n".join(extract_page(page, number) for page in pages)
        lines = [line for line in text.splitlines() if line]
        if len(lines) != count:
            raise ValueError(f"Unexpected line count for song {number}")
        title = lines[0].rstrip("।,!? ")
        references = "; ".join(revision_url(page) for page in pages)
        context = (
            f"This is song {number} in the Bengali third edition of Gitanjali. "
            "The edition is dated Bengali year 1320, spanning 1913–1914; the exact Gregorian printing year is not established here. "
            "The title is the opening line. This reading follows the Bengali Wikisource contributors’ validated page transcriptions; "
            "line breaks and refrains are retained, while indentation and spacing are normalized. "
            "Printed dates after the verse are not included. India is an associated place, not a claim about composition."
        )
        if number == 120:
            context += (" Tagore’s English Gitanjali no. 11 is his own prose reworking of this song; "
                        "the Bengali and English collection numbers do not correspond generally. "
                        "Three reversed Bengali vowel-sign sequences in the transcription are corrected for display.")
        results.append({
            "id": f"tagore-gitanjali-bengali-{number:03d}",
            "title": title,
            "author": "Rabindranath Tagore", "authorOriginal": "রবীন্দ্রনাথ ঠাকুর",
            "authorId": "rabindranath-tagore", "authorYears": "1861–1941",
            "country": "India", "language": "Bengali", "lang": "bn", "direction": "ltr",
            "year": None, "yearLabel": "Bengali year 1320 edition · 1913–1914", "era": "20th century",
            "form": "Song", "collection": "Gitanjali · Bengali third edition", "themes": [], "mood": "paper",
            "context": context,
            "sourceTitle": f"Bengali Wikisource contributors · scan page {first}, revision {pages[0]['revision']}",
            "source": revision_url(pages[0]),
            "contextSourceTitle": f"Gitanjali · Bengali third edition, scan pages {first}–{last}" if first != last else f"Gitanjali · Bengali third edition, scan page {first}",
            "contextSource": scan_url(first),
            "rights": ("Bengali original printed in Bengali year 1320 (1913–1914); public domain in the United States. "
                       "Page transcriptions adapted from Bengali Wikisource contributors under CC BY-SA 4.0 "
                       "(https://creativecommons.org/licenses/by-sa/4.0/). Pinned contributor histories: "
                       f"{references}. Copyright and moral rights vary by jurisdiction; check local law. Scans are linked, not republished."),
            "text": text,
            "translations": [{
                "language": "English", "title": "Leave this chanting and singing · 1913 prose reworking",
                "translator": "Rabindranath Tagore · English self-reworking, 1913",
                "text": ENGLISH_11,
                "source": "https://commons.wikimedia.org/wiki/File:Gitanjali.djvu?page=38",
                "rights": ("Tagore’s English prose version was printed in London in 1913 and is public domain in the United States; "
                           "check local copyright and moral rights. This is a free self-reworking, not a literal line-by-line translation "
                           "of the Bengali printing. The transcription was checked against the linked 1913 scan, pages 8–9; "
                           "a paragraph continues across the page break and line-end hyphenation and typography are normalized. "
                           "The scan is linked, not republished."),
            }] if number == 120 else [],
        })
    if len({poem["text"] for poem in results}) != len(results):
        raise ValueError("Duplicate reading in selection")
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(records(), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Committed readings differ from the pinned transcriptions")
        print(f"Verified {len(SPANS)} Bengali readings against the pinned page revisions.")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {len(SPANS)} Bengali readings.")


if __name__ == "__main__":
    main()

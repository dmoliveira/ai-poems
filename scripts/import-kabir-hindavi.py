#!/usr/bin/env python3
"""Reproduce selected dohas from pinned Hindi Wikisource excerpts."""

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = ROOT / "scripts/sources/kabir-hindavi-revisions.json"
OUTPUT = ROOT / "content/poems/kabir-hindavi.json"
SNAPSHOT_SHA256 = "f5c2a0d817ee23bdf8e0d0255e2b98602e7fc9cbf4c4def5aaa4485274dcb103"
PDF_SHA256 = "062f56203acbef140915e36e68a12b27637d6b91a1174b94889aa55b8c2b84e1"
PDF_URL = "https://archive.org/download/in.ernet.dli.2015.442452/2015.442452.Kobir-Gronthaboli.pdf"
DEVANAGARI = str.maketrans("0123456789", "०१२३४५६७८९")

# One historical, numbered couplet per entry; the site's popularity ranking
# establishes selection context, not certainty about authorship or the text.
WORKS = [
    {
        "id": "kabir-1928-jis-maranai",
        "page": 153,
        "revision": 591949,
        "detail": "The opening line is an editorial title; this individually numbered couplet is complete in the selected printing.",
    },
    {
        "id": "kabir-1928-maya-papani",
        "page": 116,
        "revision": 591908,
        "detail": "Other couplets on the same page begin with similar words; this is the one ending its first line ‘हराम’.",
    },
    {
        "id": "kabir-1928-kaba-phir-kasi",
        "page": 138,
        "revision": 591932,
        "detail": "The selected printing has ‘बैठि कबीरा’; Hindwi's separately listed comparison has ‘बैठ कबीर’.",
    },
    {
        "id": "kabir-1928-maya-mui",
        "page": 117,
        "revision": 591909,
        "corrections": {"प्रासा": "आसा"},
        "detail": "The scan reads ‘आसा’, where the credited transcription has ‘प्रासा’. The 1928 ending ‘यौं कहि गया कबीर’ differs from Hindwi's ‘यौं कहै दास कबीर’.",
    },
    {
        "id": "kabir-1928-yahu-ghar-prem",
        "page": 153,
        "revision": 591949,
        "corrections": {"नंहिं": "नांहिं"},
        "detail": "The scan reads ‘नांहिं’, where the credited transcription has ‘नंहिं’; Hindwi's comparison has ‘पैठे’ where the printing has ‘पैसै’. The scan's number is 19; the transcription gives 16. Numbers are not included in the verse.",
    },
    {
        "id": "kabir-1928-sab-jag-suta",
        "page": 156,
        "revision": 591952,
        "corrections": {"पाया": "आया"},
        "detail": "The scan reads ‘आया’, where the credited transcription has ‘पाया’.",
    },
    {
        "id": "kabir-1928-had-jalai",
        "page": 106,
        "revision": 591897,
        "detail": "The linked page transcription is marked not proofread by Wikisource; this two-line selection was checked against the scan.",
    },
]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def revision_url(page, revision):
    title = f"पृष्ठ:कबीर ग्रंथावली.djvu/{str(page).translate(DEVANAGARI)}"
    return f"https://hi.wikisource.org/w/index.php?title={quote(title.replace(' ', '_'), safe='')}&oldid={revision}"


def clean_line(line):
    line = line.replace("{{gap}}", "")
    line = re.split(r"॥|।।", line, maxsplit=1)[0].strip(" ।")
    return re.sub(r",\s*", ", ", line).strip()


def build():
    if sha256(SNAPSHOT) != SNAPSHOT_SHA256:
        raise ValueError("Pinned revision excerpt snapshot changed")
    excerpts = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    if len(excerpts) != len(WORKS):
        raise ValueError("Unexpected number of excerpt entries")
    result = []
    for work, excerpt in zip(WORKS, excerpts, strict=True):
        if (work["page"], work["revision"]) != (excerpt["page"], excerpt["revision"]):
            raise ValueError(f"Source revision mismatch: {work['id']}")
        lines = [clean_line(line) for line in excerpt["lines"]]
        if len(lines) != 2 or not all(lines):
            raise ValueError(f"Expected one complete couplet: {work['id']}")
        for original, corrected in work.get("corrections", {}).items():
            if sum(line.count(original) for line in lines) != 1:
                raise ValueError(f"Expected exactly one correction in {work['id']}: {original}")
            lines = [line.replace(original, corrected) for line in lines]
        source = revision_url(work["page"], work["revision"])
        context = (
            "Traditionally attributed to Kabir, this is a complete numbered doha from Shyamsundar Das's 1928 edition. "
            "Kabir's orally transmitted corpus has disputed attributions and many variants. Hindi is a broad discovery label "
            "for this historical mixed Hindavi register, not a claim of modern standard Hindi. "
            "The linked contributor transcription was checked against the scan; spacing and punctuation are normalized. "
            f"{work['detail']} India is an associated place, not a documented composition location; 1928 dates the edition, not the poem."
        )
        rights = (
            "The 1928 historical printing is public domain in the United States. Transcription adapted from Hindi Wikisource "
            "contributors under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/); "
            f"pinned contributor history: {source}. Copyright and moral rights vary by jurisdiction; check local law. "
            "The scan is linked, not republished."
        )
        result.append({
            "id": work["id"],
            "title": lines[0],
            "author": "Kabir",
            "authorOriginal": "कबीर",
            "authorId": "kabir",
            "anonymous": True,
            "uncertainAttribution": True,
            "authorYears": "Traditionally 15th century · dates uncertain",
            "country": "India",
            "language": "Hindi",
            "lang": "hi",
            "direction": "ltr",
            "year": 1928,
            "yearLabel": "1928 edition · composition date unknown",
            "era": "Date uncertain",
            "form": "Doha",
            "collection": "Kabir Granthavali · 1928 edition",
            "themes": [],
            "mood": "paper",
            "context": context,
            "sourceTitle": f"Hindi Wikisource contributors · revision {work['revision']}",
            "source": source,
            "contextSourceTitle": f"1928 historical scan · PDF page {work['page'] + 1}",
            "contextSource": f"{PDF_URL}#page={work['page'] + 1}",
            "rights": rights,
            "text": f"{lines[0]}।\n{lines[1]}॥",
            "translations": [],
        })
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    operation = parser.add_mutually_exclusive_group(required=True)
    operation.add_argument("--check", action="store_true")
    operation.add_argument("--write", action="store_true")
    parser.add_argument("--evidence-dir", type=Path)
    args = parser.parse_args()
    expected = build()
    if args.evidence_dir:
        pdf = args.evidence_dir / "kabir-das-1928-ia442452.pdf"
        if sha256(pdf) != PDF_SHA256:
            raise ValueError("Historical PDF does not match the reviewed witness")
    if args.write:
        OUTPUT.write_text(json.dumps(expected, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {len(expected)} readings.")
    else:
        actual = json.loads(OUTPUT.read_text(encoding="utf-8"))
        if actual != expected:
            raise ValueError("Catalogue differs from the pinned source excerpts")
        print(f"Verified {len(expected)} readings against pinned excerpts" + (" and the reviewed PDF." if args.evidence_dir else "."))


if __name__ == "__main__":
    main()

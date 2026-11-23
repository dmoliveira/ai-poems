"""Reproduce four scan-checked Rahim-attributed dohas from pinned excerpts."""

import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = ROOT / "scripts/sources/rahim-hindi-revisions.json"
OUTPUT = ROOT / "content/poems/rahim-hindi.json"
SNAPSHOT_SHA256 = "285ebab8e2956820fcac7825ee8b2787c04781759e0f9d8080309b37c53cedd4"
PDF_SHA256 = "1489ed36c92fee4273284482283e34315f66b35f308a320030b7df9898aa7514"
PDF_URL = "https://archive.org/download/in.ernet.dli.2015.378697/2015.378697.Raheem-kavitawali.pdf"
DEVANAGARI = str.maketrans("0123456789", "०१२३४५६७८९")

# One complete, separately numbered doha per record. Popularity sorting is
# selection evidence, not a claim about global ranking or definitive authorship.
WORKS = [
    {
        "id": "rahim-1926-bigri-baat",
        "page": 67,
        "revision": 653548,
        "number": 122,
        "detail": (
            "The 1926 witness reads ‘रहिमन बिगरे दूध के … होइ’; Hindwi's circulated version has "
            "‘रहिमन फाटे दूध को … होय’. The historical wording is retained."
        ),
    },
    {
        "id": "rahim-1926-dekhi-baren",
        "page": 73,
        "revision": 653557,
        "number": 174,
        "corrections": {"बड़ें": "बड़ेन"},
        "detail": (
            "The scan reads ‘बड़ेन’, where the pinned contributor transcription has ‘बड़ें’. "
            "The scan's ‘आवै’, ‘करै’ and ‘तरवारि’ are retained rather than Hindwi's modernized variants."
        ),
    },
    {
        "id": "rahim-1926-pani-rakhiye",
        "page": 73,
        "revision": 653557,
        "number": 179,
        "detail": (
            "The 1926 witness reads ‘राखिए, बिन पानी’; Hindwi's circulated version has ‘राखिये, बिनु पानी’. "
            "This edition's wording is retained."
        ),
    },
    {
        "id": "rahim-1926-dhaga-prem",
        "page": 74,
        "revision": 653560,
        "number": 188,
        "detail": (
            "The scan reads ‘मति तोरो चटकाइ’ and ‘मिले गाँठि परि जाइ’; Hindwi's circulated version "
            "has ‘मत तोड़ो छिटकाय’ and ‘मिले गाँठ परिजाय’. The historical wording is retained."
        ),
    },
]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def revision_url(page, revision):
    title = f"पृष्ठ:रहीम-कवितावली.djvu/{str(page).translate(DEVANAGARI)}"
    return f"https://hi.wikisource.org/w/index.php?title={quote(title.replace(' ', '_'), safe='')}&oldid={revision}"


def clean_lines(work, excerpt):
    if work["number"] != excerpt["number"] or len(excerpt["lines"]) != 2:
        raise ValueError(f"Expected the complete numbered doha: {work['id']}")
    lines = [line.strip() for line in excerpt["lines"]]
    terminal_number = f"॥{str(work['number']).translate(DEVANAGARI)}॥"
    if not lines[1].endswith(terminal_number):
        raise ValueError(f"Source numbering mismatch: {work['id']}")
    lines[1] = lines[1][:-len(terminal_number)] + "॥"
    for original, corrected in work.get("corrections", {}).items():
        if sum(line.count(original) for line in lines) != 1:
            raise ValueError(f"Expected exactly one scan correction in {work['id']}: {original}")
        lines = [line.replace(original, corrected) for line in lines]
    if not all(lines) or not lines[0].endswith("।") or not lines[1].endswith("॥"):
        raise ValueError(f"Invalid complete doha punctuation: {work['id']}")
    return lines


def build():
    if sha256(SNAPSHOT) != SNAPSHOT_SHA256:
        raise ValueError("Pinned revision excerpt snapshot changed")
    excerpts = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    pages = {(item["page"], item["revision"]): item for item in excerpts}
    if len(pages) != len(excerpts) or len(WORKS) != 4:
        raise ValueError("Unexpected pinned page or work count")
    result = []
    for work in WORKS:
        page = pages.get((work["page"], work["revision"]))
        if not page or page.get("quality") != 4:
            raise ValueError(f"Pinned source page mismatch: {work['id']}")
        excerpt = next((item for item in page["poems"] if item["number"] == work["number"]), None)
        if not excerpt:
            raise ValueError(f"Pinned doha missing: {work['id']}")
        lines = clean_lines(work, excerpt)
        source = revision_url(work["page"], work["revision"])
        detail = work["detail"]
        context = (
            "Traditionally attributed to Rahim, this is the complete, separately numbered doha "
            f"no. {work['number']} in Surendranath Tiwari's first-edition Rahim-Kavitawali "
            "(Naval Kishore Press, Lucknow, 1926). The edition's attribution is a historical "
            "tradition, not independent proof of authorship. This text follows the linked scan; "
            "spacing and punctuation are normalized. Hindi and hi are broad discovery labels for "
            "this historical Braj register, not a claim of standardized modern Hindi. The year "
            "is the edition date, not a composition date; India is an associated place, not a "
            f"documented composition location. {detail}"
        )
        rights = (
            "The 1926 historical text is public domain in the United States. Archive.org metadata "
            "reports scan rights as ‘Not Available’; the scan is linked, not republished. This "
            "transcription adapts the cited Hindi Wikisource contributor revision under CC BY-SA "
            "4.0 (https://creativecommons.org/licenses/by-sa/4.0/): "
            f"{source}. Copyright and moral rights vary by jurisdiction; check local law."
        )
        result.append({
            "id": work["id"],
            "title": lines[0].removesuffix("।"),
            "author": "Rahim",
            "authorOriginal": "रहीम",
            "authorId": "rahim",
            "uncertainAttribution": True,
            "authorYears": "1556–1627 (commonly given)",
            "country": "India",
            "language": "Hindi",
            "lang": "hi",
            "direction": "ltr",
            "year": 1926,
            "yearLabel": "1926 edition · composition date unknown",
            "era": "Date uncertain",
            "form": "Doha",
            "collection": "Rahim-Kavitawali · 1926 edition",
            "themes": [],
            "mood": "paper",
            "context": context,
            "sourceTitle": f"Hindi Wikisource contributors · revision {work['revision']}",
            "source": source,
            "contextSourceTitle": f"1926 historical scan · PDF page {work['page']}",
            "contextSource": f"{PDF_URL}#page={work['page']}",
            "rights": rights,
            "text": "\n".join(lines),
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
        pdf = args.evidence_dir / "rahim-kavitawali-1926-research.pdf"
        if sha256(pdf) != PDF_SHA256:
            raise ValueError("Historical PDF does not match the reviewed witness")
    if args.write:
        OUTPUT.write_text(json.dumps(expected, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {len(expected)} readings.")
    else:
        actual = json.loads(OUTPUT.read_text(encoding="utf-8"))
        if actual != expected:
            raise ValueError("Catalogue differs from the pinned source excerpts")
        suffix = " and the reviewed PDF" if args.evidence_dir else ""
        print(f"Verified {len(expected)} readings against pinned excerpts{suffix}.")


if __name__ == "__main__":
    main()

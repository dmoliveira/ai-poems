#!/usr/bin/env python3
"""Reproduce Narcisa Amália records after checking both reviewed scan copies."""

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/narcisa-nebulosas-reviewed.json"
OUTPUT = ROOT / "content/poems/narcisa-nebulosas-reviewed.json"
SCANS = {"nebulosas-ufsc.pdf", "nebulosas-archive.pdf"}
SELECTION = (
    ("voto", 33, 34, 43, 37),
    ("saudades", 35, 36, 45, 39),
    ("afflicta", 41, 42, 51, 45),
    ("aspiracao", 43, 44, 53, 47),
    ("confidencia", 45, 46, 55, 49),
    ("agonia", 51, 52, 61, 55),
    ("scisma", 61, 62, 71, 65),
    ("recordacao", 145, 146, 157, 151),
    ("amor-de-violeta", 151, 152, 163, 157),
    ("o-africano-e-o-poeta", 153, 156, 165, 159),
    ("sadness", 157, 158, 169, 163),
)
CATALOGUE = "https://literaturabrasileira.ufsc.br/documentos?id=133827"
SCAN = "https://literaturabrasileira.ufsc.br/midias/stream?id=153383&raw=1"
RIGHTS = (
    "The historical poems and pre-1931 printing are public domain in the United States; "
    "check local law. Transcribed from the linked scan; the images are linked, not reproduced."
)


def digest(value):
    return hashlib.sha256(value.encode("utf8") if isinstance(value, str) else value).hexdigest()


def make_records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    if set(manifest["sourceSha256"]) != SCANS:
        raise ValueError("Unexpected evidence files")
    for filename, expected in manifest["sourceSha256"].items():
        if digest((directory / filename).read_bytes()) != expected:
            raise ValueError(f"Reviewed source changed: {filename}")

    items = manifest["poems"]
    actual = tuple(
        (item["id"], item["pages"][0], item["pages"][-1], item["ufsc"][0], item["archive"][0])
        for item in items
    )
    if actual != SELECTION:
        raise ValueError("Unexpected selection or source pages")

    records = []
    for item in items:
        start, end = item["pages"][0], item["pages"][-1]
        count = end - start + 1
        if (
            item["pages"] != list(range(start, end + 1))
            or item["ufsc"] != list(range(item["ufsc"][0], item["ufsc"][0] + count))
            or item["archive"] != list(range(item["archive"][0], item["archive"][0] + count))
        ):
            raise ValueError(f"Unexpected page range: {item['id']}")
        text = item["text"]
        if (
            text != text.strip()
            or digest(text) != item["sha256"]
            or [len(stanza.splitlines()) for stanza in text.split("\n\n")] != item["stanzas"]
            or any(not line.strip() for stanza in text.split("\n\n") for line in stanza.splitlines())
        ):
            raise ValueError(f"Reviewed text or stanza boundaries changed: {item['id']}")
        page_label = f"{start}–{end}"
        context = (
            f"From Narcisa Amália’s Nebulosas, pp. {page_label}, catalogued by UFSC as 1872. "
            "The text and its beginning and ending follow the linked historical printing; "
            "that boundary does not establish every other edition. Historical spelling is "
            "retained; indentation, spacing and some punctuation are normalized. "
            "UFSC gives her birth year as 1852; another account gives 1856. Brazil is "
            "associated with the poet, not a claim about this poem’s place of composition. "
            "The composition date is not established here. "
            + item["note"]
        )
        record = {
            "id": f"narcisa-nebulosas-{item['id']}",
            "title": item["title"],
            "author": "Narcisa Amália",
            "authorId": "narcisa-amalia",
            "authorYears": "1852?–1924",
            "country": "Brazil",
            "language": "Portuguese",
            "lang": "pt",
            "direction": "ltr",
            "year": None,
            "yearLabel": "In Nebulosas (catalogued 1872) · composition date not established",
            "era": "Date not established",
            "form": "Poetry",
            "collection": "Nebulosas",
            "themes": item["themes"],
            "mood": "paper",
            "context": context,
            "contextSource": CATALOGUE,
            "contextSourceTitle": "UFSC · Nebulosas catalogue",
            "sourceTitle": f"UFSC · Nebulosas scan, pp. {page_label}",
            "source": f"{SCAN}#page={item['ufsc'][0]}",
            "rights": RIGHTS,
            "text": text,
            "translations": [],
        }
        if "displayTitle" in item:
            record["displayTitle"] = item["displayTitle"]
            record["displayTitleLang"] = "pt"
        records.append(record)
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory with the pinned reviewed PDFs")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(make_records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Records differ from the reviewed sources")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

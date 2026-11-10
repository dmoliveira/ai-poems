#!/usr/bin/env -S uv run --no-project --with openpyxl python
"""Reproduce scan-reviewed Chiyo-ni verses using a private museum comparison."""

import argparse
import hashlib
import json
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/chiyo-ni-1927-reviewed.json"
OUTPUT = ROOT / "content/poems/chiyo-ni-1927-reviewed.json"


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def make_records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    items = manifest["poems"]
    if (
        len(items) != 73
        or len({item["text"] for item in items}) != len(items)
        or len({item["museumRow"] for item in items}) != len(items)
    ):
        raise ValueError("Unexpected reviewed selection")
    if {str(item["scan"]) for item in items} != set(manifest["scanSha256"]):
        raise ValueError("The reviewed scan list does not match the selection")
    for scan, expected in manifest["scanSha256"].items():
        image = directory / f"chiyoni-1927-{int(scan):03}.jpg"
        if sha256(image.read_bytes()) != expected:
            raise ValueError(f"Scan image changed: {scan}")

    workbook_path = directory / "hakusan-chiyo-data.xlsx"
    if sha256(workbook_path.read_bytes()) != manifest["museumWorkbookSha256"]:
        raise ValueError("Museum comparison workbook changed")
    workbook = load_workbook(workbook_path, read_only=True, data_only=True)
    try:
        rows = [
            row
            for row in workbook["総覧"].iter_rows(min_row=3, values_only=True)
            if isinstance(row[0], int)
        ]
    finally:
        workbook.close()
    lookup = {row[0]: row for row in rows}
    if len(lookup) != len(rows):
        raise ValueError("Museum comparison row numbers are not unique")
    selected = []
    for item in items:
        row = lookup.get(item["museumRow"])
        if not row or not isinstance(row[3], str) or "千代尼句集" not in str(row[5]):
            raise ValueError(f"Missing reviewed museum attribution: {item['museumRow']}")
        selected.append(row)
    evidence = "\n".join(
        f"{row[0]}\0{row[3]}\0{row[5]}" for row in selected
    ).encode("utf8")
    if sha256(evidence) != manifest["museumRowsSha256"]:
        raise ValueError("Reviewed museum row selection changed")

    records = []
    for number, (item, row) in enumerate(zip(items, selected, strict=True), 1):
        if item["page"] not in (2 * item["scan"] - 44, 2 * item["scan"] - 43):
            raise ValueError(f"Unexpected printed page: {number}")
        context = (
            "One separately printed hokku in Kihaku's Chiyo-ni collection, "
            "reproduced in the 1927 anthology. The Chiyojo Haiku Museum also "
            "catalogues a corresponding verse and cites this collection. Some character "
            "forms are normalized and printed repetition marks adapted or expanded; the composition "
            "date and place are not established here."
        )
        if "真蹟" in str(row[5]):
            context += " The museum also lists an autograph among its sources; it was not separately inspected here."
        if item.get("note"):
            context += " " + item["note"]
        text = item["text"]
        records.append({
            "id": f"chiyo-ni-1927-{number:02}",
            "title": text,
            "author": "Kaga no Chiyo (Chiyo-ni)",
            "authorOriginal": "加賀千代女",
            "authorId": "kaga-no-chiyo",
            "authorYears": "1703–1775",
            "country": "Japan",
            "language": "Japanese",
            "lang": "ja",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Edo period · exact year not established here",
            "era": "Edo period",
            "form": "Haiku",
            "collection": "Chiyo-ni Collection · 千代尼句集 (1927 anthology)",
            "themes": [],
            "mood": "paper",
            "context": context,
            "contextSource": "https://www.hakusan-museum.jp/chiyojohaiku/about/",
            "contextSourceTitle": "Chiyojo Haiku Museum · Chiyo-ni catalogue",
            "sourceTitle": f"National Diet Library · Nihon Haisho Taikei, vol. 9 (1927), p. {item['page']}",
            "source": f"https://dl.ndl.go.jp/pid/1179392/1/{item['scan']}",
            "rights": (
                "Historical original and 1927 edition are public domain in the United States; "
                "the National Diet Library marks its scan public domain. Check local law before reuse."
            ),
            "text": text,
            "translations": [],
        })
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory with reviewed scans and private museum workbook")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(make_records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Committed records differ from the reviewed transcription")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

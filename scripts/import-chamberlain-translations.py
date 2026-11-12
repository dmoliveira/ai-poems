#!/usr/bin/env python3
"""Reproduce five scan-reviewed 1902 Chamberlain translations of existing hokku."""

import argparse
import hashlib
import json
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "content/chamberlain-translations.mjs"
EVIDENCE = {
    "chamberlain-1902-transaction-vol30.pdf": "987c627eb0a6961db2ed60be43cad47dfaa7174bcb23fda56c73d64d9d276840",
    "chamberlain-1902-transaction-vol30-ocr.xml": "c65f14d0461bf137b04c87fbc95785907ff8f4e459f3479dd1503a38758012e3",
    "chamberlain-1902-haiku-public-copy.pdf": "ff3475a720302832104dd17e7fbe492b60ae2ecc1039e29fa4dd3de9e8a5fce3",
}
SELECTION = (
    {
        "id": "summer-grass-basho", "page": 332, "start": "( 46 )",
        "end": "That is, \"Of the warriors’ dream of power and glory,",
        "after": "That is, \"Of the warriors’ dream of power and glory,",
        "marker": "Natsu-gnsa yd", "title": "Summer Grasses and the Warriors’ Dream",
        "ocr": ("Haply tHfe oimmrr- ftrv", "A n?Hc rtf the wairinrY dram."),
        "lines": ("Haply the summer-grasses are", "A relic of the warriors’ dream."),
        "sha256": "e2844bbb6714c9005975152d2fbbb1ca72d159339aee033294e363ba38864c49",
        "note": (
            "The title is editorial. Chamberlain’s romanization has ‘no’ where the displayed "
            "Japanese edition reads が (‘ga’); his ‘haply’ and ‘relic’ are interpretive."
        ),
    },
    {
        "id": "basho-nozarashi-28", "page": 346, "start": "(74)", "end": "(75)",
        "after": "Written cm one nf 1 ih lii^sv pUgiinufit^",
        "marker": "Toski kwerm", "title": "The Year Has Closed",
        "ocr": ("The year has closet] while still T wear", "My sandals ami my ^iilgrim's hat."),
        "lines": ("The year has closed while still I wear", "My sandals and my pilgrim’s hat."),
        "sha256": "8567ef65cea3c8a2424d5ad2ca2c2489ecc12d9928d85060e739ce86633bce62",
        "note": "The title is editorial; ‘pilgrim’s hat’ interprets the displayed 笠 (hat).",
    },
    {
        "id": "buson-1926-12", "page": 378, "start": "( 179 )", "end": "(tSc)",
        "after": "A IttiHtimafB ikrixh thi* h if iwo of wliffln the",
        "marker": "Mon^galari-yufot", "title": "A Shower in Spring",
        "ocr": ("A showV in spring p where an umbrella", "And rain-coat walk along conversing;."),
        "lines": ("A show’r in spring, where an umbrella", "And rain-coat walk along conversing."),
        "sha256": "e5180fc6782e67462f1c0be74d993450ce4bc4eb3b2c01ab878771ecffe3c411",
        "note": (
            "The title is editorial. Chamberlain’s romanization reads ‘monogatari’ while the "
            "displayed 1926 edition reads ものかたり (‘monokatari’); ‘rain-coat’ renders 簑, a straw rain cape."
        ),
    },
    {
        "id": "buson-1926-13", "page": 377, "start": "(< 76 )", "end": "(17 7)",
        "after": "(17 7)",
        "marker": "Xtuai£jM", "title": "Memories of the Past",
        "ocr": ("Oh ! distant pant, made up of slow", "But ever accumulating days!"),
        "lines": ("Oh! distant past, made up of slow", "But ever accumulating days!"),
        "sha256": "c6b099fef7ab7aee116deae6d45638eb8fc188bb807fc14b35a94e58db5fd216",
        "note": "‘Memories of the Past’ is Chamberlain’s printed English heading; the displayed Japanese has no heading.",
    },
    {
        "id": "chiyo-ni-1927-46", "page": 375, "start": "(170)", "end": "(171)",
        "after": "Another reading for fyit&m-wri in unttxirj, Hie tunic of a species of",
        "marker": "(Chiyo, 1703-1775)", "title": "A Hundred Tendrils",
        "ocr": ("A hundred teniliibs, yeaE and ill", "From tike same -vine I bat is chek heart."),
        "lines": ("A hundred tendrils, yea! and all", "From the same vine that is their heart."),
        "sha256": "f81825ee4c0a65df56000a1d1c15ecd43518ce5034d403479f0a86b9972f2259",
        "note": (
            "The title is editorial. Chamberlain called his rendering an approximation and noted an "
            "alternative gourd reading; his religious interpretation is his own, not an established authorial intent."
        ),
    },
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def page_lines(page):
    return [
        " ".join("".join(word.itertext()).strip() for word in line.iter("WORD"))
        for line in page.iter("LINE")
    ]


def reading(pages, row):
    if not 1 <= row["page"] <= len(pages):
        raise ValueError(f"Unexpected OCR page: {row['id']}")
    lines = page_lines(pages[row["page"] - 1])
    if lines.count(row["start"]) != 1 or lines.count(row["end"]) != 1:
        raise ValueError(f"Unexpected entry boundaries: {row['id']}")
    start, end = lines.index(row["start"]), lines.index(row["end"])
    if start >= end:
        raise ValueError(f"Unexpected entry boundaries: {row['id']}")
    section = lines[start + 1:end]
    if section.count(row["marker"]) != 1:
        raise ValueError(f"Unexpected romanization or byline: {row['id']}")
    raw = row["ocr"]
    if len(raw) != 2 or any(section.count(line) != 1 for line in raw):
        raise ValueError(f"Unexpected OCR reading: {row['id']}")
    first = section.index(raw[0])
    following = (section + [row["end"]])[first + 2:first + 3]
    if (section[first:first + 2] != list(raw) or section.index(row["marker"]) >= first
            or following != [row["after"]]):
        raise ValueError(f"Unexpected verse boundaries: {row['id']}")
    # Both printed lines were visually transcribed; the pinned OCR is only a locator.
    text = "\n".join(row["lines"])
    if len(row["lines"]) != 2 or digest(text.encode("utf8")) != row["sha256"]:
        raise ValueError(f"Reviewed translation changed: {row['id']}")
    return text


def records(directory):
    evidence = {name: (directory / name).read_bytes() for name in EVIDENCE}
    for name, expected in EVIDENCE.items():
        if digest(evidence[name]) != expected:
            raise ValueError(f"Reviewed evidence changed: {name}")
    pages = ET.fromstring(evidence["chamberlain-1902-transaction-vol30-ocr.xml"]).findall(".//OBJECT")
    result = {}
    for row in SELECTION:
        if row["id"] in result:
            raise ValueError("Duplicate selected poem")
        result[row["id"]] = [{
            "language": "English", "title": row["title"], "text": reading(pages, row),
            "translator": "Basil Hall Chamberlain · 1902",
            "source": f'https://archive.org/download/in.gov.ignca.26037/26037.pdf#page={row["page"]}',
            "rights": (
                "This 1902 English version is public domain in the United States; check local law. "
                "Chamberlain’s Japanese working edition is not established here; his version is an interpretation, "
                "not a claim of an exact match to the displayed Japanese. " + row["note"]
            ),
        }]
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing reviewed scan and OCR files")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = (
        "// Generated by scripts/import-chamberlain-translations.py from the reviewed 1902 edition.\n"
        + "export const chamberlainTranslations = "
        + json.dumps(records(args.directory), ensure_ascii=False, indent=2)
        + ";\n"
    )
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Translations differ from the reviewed readings")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

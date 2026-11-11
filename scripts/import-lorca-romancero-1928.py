#!/usr/bin/env -S uv run --no-project --with beautifulsoup4 python
"""Reproduce the 1928 Romancero selection from the pinned source witnesses."""

import argparse
import hashlib
import json
import re
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/lorca-romancero-1928.json"
OUTPUT = ROOT / "content/poems/lorca-romancero-1928.json"
GUTENBERG = "https://www.gutenberg.org/cache/epub/72665/pg72665-images.html"
SCAN = "https://archive.org/download/romancerogitano_202401/romancerogitano.pdf"
HEADINGS = {
    9: ["II"],
    10: ["II"],
    16: ["I", "PANORAMA DE MÉRIDA", "II", "EL MARTIRIO", "III", "INFIERNO Y GLORIA"],
    17: ["PRIMERA LAGUNA", "SIGUE", "SECUNDA LAGUNA", "SIGUE", "ÚLTIMA LAGUNA"],
}
RIGHTS = (
    "The original and 1928 printing are public domain in the United States; "
    "check local law. Project Gutenberg credits Ramón Pajares Box for its transcription."
)


def digest(value):
    if isinstance(value, str):
        value = value.encode("utf8")
    return hashlib.sha256(value).hexdigest()


def text_without_page_numbers(element):
    for page in element.select("span.pagenum"):
        page.decompose()
    return re.sub(r"\s+", " ", element.get_text(" ", strip=True)).strip()


def extract(data):
    soup = BeautifulSoup(data, "html.parser")
    chapters = soup.select('div.chapter[id^="Ch"]')
    if [chapter.get("id") for chapter in chapters] != [f"Ch{n:02}" for n in range(1, 19)]:
        raise ValueError("Unexpected numbered chapters")
    readings = []
    for number, chapter in enumerate(chapters, 1):
        dedication = chapter.select_one("p.subh2")
        if not dedication:
            raise ValueError(f"Missing dedication: {number}")
        dedication = text_without_page_numbers(dedication)
        segments, headings, pages = [], [], []
        element = chapter.find_next_sibling()
        while element and not (element.get("id", "").startswith("Ch") or element.get("id") == "ToC"):
            classes = element.get("class", [])
            if "tit" in classes:  # The separately printed heading for the next three romances.
                if number != 15:
                    raise ValueError(f"Unexpected division heading: {number}")
                element = element.find_next_sibling()
                continue
            for page in element.select('span.pagenum[id^="Page_"]'):
                pages.append(int(page["id"].removeprefix("Page_")))
            if element.name == "div" and "chapter" in classes:
                if segments or headings:
                    raise ValueError(f"Unexpected chapter title inside poem: {number}")
            elif element.name == "div" and "versos" in classes:
                for stanza in element.find_all("div", class_="estrofa", recursive=False):
                    lines = [text_without_page_numbers(p) for p in stanza.find_all("p", recursive=False)]
                    # A printed bullet separates passages; retain the break, not a verse line.
                    if lines == ["•"]:
                        continue
                    if not lines or any(not line or line == "•" for line in lines):
                        raise ValueError(f"Unexpected verse block: {number}")
                    segments.append("\n".join(lines))
            elif element.name == "p":
                heading = text_without_page_numbers(element)
                headings.append(heading)
                if number == 17 and heading == "SECUNDA LAGUNA":
                    segments.append("SEGUNDA LAGUNA")
                else:
                    segments.append(heading)
            else:
                raise ValueError(f"Unexpected source element in poem {number}: {element.name} {classes}")
            element = element.find_next_sibling()
        if headings != HEADINGS.get(number, []):
            raise ValueError(f"Unexpected internal headings: {number}")
        if not segments or not pages:
            raise ValueError(f"Empty poem or missing page range: {number}")
        readings.append({
            "number": number,
            "dedication": dedication,
            "pages": [min(pages), max(pages)],
            "text": "\n\n".join(segments),
        })
    return readings


def records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    for name, expected in manifest["sourceSha256"].items():
        if digest((directory / name).read_bytes()) != expected:
            raise ValueError(f"Reviewed source changed: {name}")
    readings = extract((directory / "gutenberg-72665.html").read_bytes())
    items = manifest["poems"]
    if [item["number"] for item in items] != list(range(1, 19)):
        raise ValueError("Unexpected reviewed selection")
    output = []
    for item, reading in zip(items, readings, strict=True):
        number = item["number"]
        text = reading["text"]
        if (
            reading["pages"] != item["pages"]
            or reading["dedication"] != item["dedication"]
            or len([line for line in text.splitlines() if line]) != item["lines"]
            or digest(text) != item["sha256"]
        ):
            raise ValueError(f"Reviewed text, dedication or page range changed: {number}")
        first, last = item["pages"]
        context = (
            f"Romance {number} in the 1928 Madrid Primer romancero gitano, pp. {first}–{last}. "
            f"Gutenberg gives the dedication, omitted from the verse, as ‘{reading['dedication']}’ "
            "Gutenberg's transcription was compared in order with OCR of the linked scan; "
            "selected mismatches and section boundaries were checked visually. Completeness "
            "refers to this printing, not every witness. Gutenberg corrected printing errors, "
            "so this is not a diplomatic transcription. Indentation and italics are omitted; "
            "printed bullet separators are represented by blank lines. Spain is an association "
            "with the poet, not an assertion of this poem's composition place or date."
        )
        if number == 9:
            context += (
                " The printed ‘II’ divides this single romance and is retained. "
                "The scan's dedication reads ‘Creselles’, "
                "where Gutenberg has ‘Croselles’."
            )
        if number == 10:
            context += " The printed ‘II’ divides this single romance and is retained."
        if number == 13:
            context += " The scan reads ‘la cuatro luces’; Gutenberg's corrected ‘las cuatro luces’ is retained."
        if number == 14:
            context += (
                " The verse heading calls it ‘Romance del emplazado’; the title leaf and "
                "contents use ‘El emplazado’. Gutenberg accents ‘Aladrén’ in the dedication, "
                "printed ‘Aladren’ in 1928."
            )
        if number == 15:
            context += " Gutenberg changes the printed ‘horzas’ to ‘orzas’."
        if number in {16, 17, 18}:
            context += " The book groups this with two other works as ‘Tres romances históricos’."
        if number == 16:
            context += " Its three titled sections belong to this one romance."
        if number == 17:
            context += (
                " The subtitle is ‘Romance con lagunas’; its laguna and sigue headings are "
                "part of this one printed work. The scan reads ‘SEGUNDA LAGUNA’, not "
                "Gutenberg's ‘SECUNDA’. ‘Una ciudad lejana’ is partly obscured in this scan; "
                "Gutenberg's reading also appears in a separately printed, undated Chilean edition."
            )
        if number == 18:
            context += " Gutenberg changes the printed ‘llemas’ to ‘yemas’."
        output.append({
            "id": f"lorca-romancero-{number:02}",
            "title": item["title"],
            "author": "Federico García Lorca",
            "authorId": "federico-garcia-lorca",
            "authorYears": "1898–1936",
            "country": "Spain",
            "language": "Spanish",
            "lang": "es",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Printed 1928 · composition date not established",
            "era": "20th century",
            "form": "Romance",
            "collection": "Primer romancero gitano · 1928",
            "themes": [],
            "mood": "paper",
            "context": context,
            "contextSource": f"{SCAN}#page={first + 2}",
            "contextSourceTitle": f"Internet Archive · 1928 scan, pp. {first}–{last}",
            "sourceTitle": f"Project Gutenberg · 1928 Romancero, no. {number}",
            "source": f"{GUTENBERG}#Ch{number:02}",
            "rights": RIGHTS,
            "text": text,
            "translations": [],
        })
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the reviewed sources")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Records differ from the reviewed sources")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Reproduce eight individually documented Swedish-language works."""

import argparse
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-swedish-classics-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-swedish-classics.json"
READINGS_SHA256 = "f71a67a8df957cb1a5b5087b071ee73604c90ad50a7a3f6fddd71dbf8647ddf8"

# Hashes identify consulted images and e-text pages, not transcription accuracy.
EVIDENCE = {
    "sodergran-dagen-1916-p6.jpg": "a2e50a49e75be4950219b17c071bc5cb7053844d7eb2fb1bfd957aae7b2190c4",
    "sodergran-dagen-1916-p7.jpg": "2daf4ae0317cb433b17a17967077f82e00d69cd73d85706172fb91e9a96cd292",
    "sodergran-dagen-LB-p7.jpg": "1ed7199d9598c9661a26da551e81192f0e272ebd8bd6f8810aebba03037b28a1",
    "sodergran-dagen-1916-p8.jpg": "3ae95dd901a37821c725bb3b17a045a52ea29ff04b3fdce5db6a0fc794037bb6",
    "sodergran-dagen-1916-p9.jpg": "e713ec9d164d4df035f9a9e9eaaced35a0f0ae6f0d2521790b70d3ec927153b9",
    "sodergran-vierge-1916-p24.jpg": "a1ba7839e2c1a75b0d6bbd5528ca6e639ca0870414f3501735f99d2d42271b2b",
    "sodergran-vierge-1916-p25.jpg": "d1b077621906edcac4366eaccd945d698d9550f72d9b606e9dfd902934126542",
    "sodergran-landet-1925-p71.jpg": "9eaf8a93807bcbe4c77c1c8f50766b649e781a812d769c8ca496c0076aa65f85",
    "sodergran-landet-1925-p72.jpg": "1bd2ff8fde81573df919e375c90aab9731408da850dd5406e34defc948f2fc54",
    "boye-rorelse-manuscript.jpg": "98afafa2991c54a4bd2fa6fd634f434bbfa9467a0e9b0fdfdb71a28f4b5b0034",
    "boye-hardarna-p42.html": "a20b175c6aca5c9602344f28699569099a848948cde6796934507afec9209f63",
    "boye-hardarna-p43.html": "eb306073095fa53289c1945154cb3d3bd3337b87ce1387a9268c54914b536ae9",
    "boye-hardarna-p44.html": "26d6e68ff59b294655464c41893d5e6fe6eb2ef2d59de02a4d705867e5d553ec",
    "boye-hardarna-p66.html": "4f6b1ae4f24bafec31526bd592ce7c225201d016341c33ac3e7cdd0376799598",
    "boye-moln-p30.html": "3809d3e0486690f7c5d835e2b469c08ebac7c250c3ec35e80eb0d46b65ebbb5c",
    "boye-moln-p46.html": "d7fcda06bd759119c98c6deceb2f0d2247576f66e212abc28e77a2885394b1b6",
}
TEXT_WITNESSES = {
    "i-rorelse": ["boye-hardarna-p66.html"],
    "jag-vill-mota": ["boye-hardarna-p42.html", "boye-hardarna-p43.html"],
    "fran-en-stygg-flicka": ["boye-hardarna-p44.html"],
    "du-ar-min-renaste-trost": ["boye-moln-p46.html"],
    "morgon": ["boye-moln-p30.html"],
}

SODERGRAN = {
    "author": "Edith Södergran", "authorId": "edith-sodergran", "authorAliases": ["Edith Irene Södergran"],
    "authorYears": "1892–1923", "country": "Finland",
}
BOYE = {"author": "Karin Boye", "authorId": "karin-boye", "authorYears": "1900–1941", "country": "Sweden"}
BOYE_RECEPTION = "https://www.selmastories.se/artikel/karin-boyes-kanda-dikter/"
BOYE_RIGHTS = (
    "The 1922 or 1927 original printing is public domain in the United States. "
    "Litteraturbanken describes its proofread, unmodernized e-text as CC0; the scan was not inspected. "
    "Copyright and moral rights vary by jurisdiction; check local law. Typography and spacing are normalized. "
    "No translation or recording is included."
)
SCAN_RIGHTS = (
    "The 1916 or 1925 historical printing is public domain in the United States; "
    "copyright and moral rights vary by jurisdiction, so check local law. "
    "The scan is linked, not republished. Indentation and punctuation typography are normalized, "
    "and printed hanging wraps are rejoined. No translation or recording is included."
)

WORKS = [
    {
        **SODERGRAN, "key": "dagen-svalnar", "title": "Dagen svalnar", "lines": 34,
        "year": 1916, "collection": "Dikter", "sourceTitle": "Dikter · 1916, pp. 6–9",
        "source": "https://runeberg.org/sedikter/0010.html",
        "reception": "https://www.boktips.no/dikt/dikt-om-kjaerlighet/dagen-svalnar-av-edith-sodergran/",
        "detail": (
            "The 1916 printing presents four numbered sections under one title; all four form one work. "
            "Two copies resolve damage to the second section's number and a word. "
            "The third section reads 'skära, skära', unlike some later editions. Hanging line wraps are rejoined; "
            "the displayed line count includes the four section numbers."
        ),
        "rights": SCAN_RIGHTS,
    },
    {
        **SODERGRAN, "key": "vierge-moderne", "title": "Vierge moderne", "titleLang": "fr", "lines": 13,
        "year": 1916, "collection": "Dikter", "sourceTitle": "Dikter · 1916, pp. 24–25",
        "source": "https://runeberg.org/sedikter/0028.html",
        "reception": "https://www.su.se/forskning/nyheter-forskning/nyhetsartiklar/2025-01-27-verket--vierge-moderne",
        "detail": (
            "This complete Swedish poem has a French title and crosses the page boundary in the 1916 printing. "
            "Stockholm University discusses it as an individual modernist classic."
        ),
        "rights": SCAN_RIGHTS,
    },
    {
        **SODERGRAN, "key": "landet-som-icke-ar", "title": "Landet som icke är", "lines": 22,
        "year": 1925, "collection": "Landet som icke är", "sourceTitle": "Landet som icke är · 1925, pp. 71–72",
        "source": "https://litteraturbanken.se/f%C3%B6rfattare/S%C3%B6dergranE/titlar/LandetSomIcke/sida/71/faksimil",
        "reception": "https://www.boktips.no/dikt/dikt-om-livet/landet-som-icke-ar-av-edith-sodergran/",
        "detail": (
            "The title poem is one complete work, not the whole posthumous collection of the same name. "
            "The 1925 printing continues onto p. 72; hanging wraps are rejoined and the page-break spacing is editorial."
        ),
        "rights": SCAN_RIGHTS,
    },
    {
        **BOYE, "key": "i-rorelse", "title": "I rörelse", "lines": 10,
        "year": 1927, "collection": "Härdarna", "sourceTitle": "Härdarna · Litteraturbanken e-text of the 1927 edition, p. 66",
        "source": "https://litteraturbanken.se/f%C3%B6rfattare/BoyeK/titlar/H%C3%A4rdarna/sida/66/etext",
        "reception": BOYE_RECEPTION,
        "detail": (
            "The complete reading has five couplets. An archival manuscript comparison and the "
            "proofread e-text agree on its ten-line boundary; the collection printing does not establish composition date."
        ),
        "rights": BOYE_RIGHTS,
    },
    {
        **BOYE, "key": "jag-vill-mota", "title": "Jag vill möta …", "lines": 20,
        "year": 1927, "collection": "Härdarna", "sourceTitle": "Härdarna · Litteraturbanken e-text of the 1927 edition, pp. 42–43",
        "source": "https://litteraturbanken.se/f%C3%B6rfattare/BoyeK/titlar/H%C3%A4rdarna/sida/42/etext",
        "reception": BOYE_RECEPTION,
        "detail": "The five quatrains cross pp. 42–43 in the source-edition e-text. The familiar opening is Rustad, rak och pansarsluten.",
        "rights": BOYE_RIGHTS,
    },
    {
        **BOYE, "key": "fran-en-stygg-flicka", "title": "Från en stygg flicka", "lines": 8,
        "year": 1927, "collection": "Härdarna", "sourceTitle": "Härdarna · Litteraturbanken e-text of the 1927 edition, p. 44",
        "source": "https://litteraturbanken.se/f%C3%B6rfattare/BoyeK/titlar/H%C3%A4rdarna/sida/44/etext",
        "reception": BOYE_RECEPTION,
        "detail": (
            "The complete poem has two quatrains. The source-edition e-text capitalizes 'Jag' on the final line; "
            "the 1994 Project Runeberg electronic edition uses lowercase 'jag'."
        ),
        "rights": BOYE_RIGHTS,
    },
    {
        **BOYE, "key": "du-ar-min-renaste-trost", "title": "Du är min renaste tröst", "lines": 8,
        "year": 1922, "collection": "Moln", "sourceTitle": "Moln · Litteraturbanken e-text of the 1922 edition, p. 46",
        "source": "https://litteraturbanken.se/f%C3%B6rfattare/BoyeK/titlar/Moln/sida/46/etext",
        "reception": BOYE_RECEPTION, "detail": "The source-edition e-text gives two complete quatrains under this title.",
        "rights": BOYE_RIGHTS,
    },
    {
        **BOYE, "key": "morgon", "title": "Morgon", "lines": 12,
        "year": 1922, "collection": "Moln", "sourceTitle": "Moln · Litteraturbanken e-text of the 1922 edition, p. 30",
        "source": "https://litteraturbanken.se/f%C3%B6rfattare/BoyeK/titlar/Moln/sida/30/etext",
        "reception": BOYE_RECEPTION, "detail": "The complete twelve-line poem is distinct from Boye's separately titled Morgonsång.",
        "rights": BOYE_RIGHTS,
    },
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class SourceLines(HTMLParser):
    """Extract the line elements of the saved Litteraturbanken pages."""

    def __init__(self):
        super().__init__()
        self.depth = 0
        self.line_depth = None
        self.parts = []
        self.lines = []

    def handle_starttag(self, tag, attrs):
        if tag == "div":
            self.depth += 1
            if "_l" in dict(attrs).get("class", "").split():
                self.line_depth = self.depth
                self.parts = []

    def handle_data(self, data):
        if self.line_depth is not None:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag == "div":
            if self.depth == self.line_depth:
                text = "".join(self.parts).strip()
                if text:
                    self.lines.append(text)
                self.line_depth = None
            self.depth -= 1


def check_boye_witnesses(records, directory):
    def normalize_typography(text):
        return " ".join(text.replace("…", "...").replace("—", "–").split())

    for key, files in TEXT_WITNESSES.items():
        lines = []
        for filename in files:
            parser = SourceLines()
            parser.feed((directory / filename).read_text(encoding="utf-8"))
            lines.extend(parser.lines)
        record = next(item for item in records if item["id"] == "recognized-swedish-classics-" + key)
        expected = [line for line in record["text"].splitlines() if line.strip()]
        if [normalize_typography(line) for line in lines] != [normalize_typography(line) for line in expected]:
            raise ValueError(f"Boye reading does not match source e-text lines: {key}")


def build():
    if digest(READINGS) != READINGS_SHA256:
        raise ValueError("Reading snapshot changed")
    blocks = [block.strip() for block in re.split(r"(?m)^## ", READINGS.read_text(encoding="utf-8")) if block.strip()]
    readings = {}
    for block in blocks:
        key, text = block.split("\n", 1)
        if key in readings:
            raise ValueError(f"Duplicate reading: {key}")
        readings[key] = text.strip()
    if list(readings) != [work["key"] for work in WORKS]:
        raise ValueError("Unexpected reading selection or order")

    records = []
    for work in WORKS:
        text = readings[work["key"]]
        if len([line for line in text.splitlines() if line.strip()]) != work["lines"]:
            raise ValueError(f"Unexpected line count: {work['key']}")
        record = {
            "id": "recognized-swedish-classics-" + work["key"], "title": work["title"],
            "author": work["author"], "authorId": work["authorId"], "authorYears": work["authorYears"],
            "country": work["country"], "language": "Swedish", "lang": "sv", "direction": "ltr",
            "year": work["year"], "yearLabel": f"{work['year']} printing · not necessarily composition date",
            "era": "20th century", "form": "Verse", "collection": work["collection"], "themes": [], "mood": "paper",
            "context": work["detail"] + " The associated place does not establish where the poem was composed.",
            "sourceTitle": work["sourceTitle"], "source": work["source"],
            "contextSourceTitle": "Individual reception and context", "contextSource": work["reception"],
            "rights": work["rights"], "text": text, "translations": [],
        }
        if "titleLang" in work:
            record["titleLang"] = work["titleLang"]
        if "authorAliases" in work:
            record["authorAliases"] = work["authorAliases"]
        records.append(record)
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
            if digest(args.evidence_dir / filename) != expected:
                raise ValueError(f"Witness does not match: {filename}")
        check_boye_witnesses(records, args.evidence_dir)
    if args.write:
        OUTPUT.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {len(records)} historical readings.")
    else:
        if json.loads(OUTPUT.read_text(encoding="utf-8")) != records:
            raise ValueError("Catalogue differs from the reviewed readings")
        print(f"Verified {len(records)} historical readings" +
              ("; witness hashes and Boye e-text lines match." if args.evidence_dir else "."))


if __name__ == "__main__":
    main()

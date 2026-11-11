#!/usr/bin/env python3
"""Reproduce selected Whitman poems from Gutenberg's 1918 anthology."""

import argparse
import hashlib
import html
import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/whitman-1918.json"
OUTPUT = ROOT / "content/poems/whitman-1918.json"
EVIDENCE = {
    "pg27494-h.htm": "792b2dcb61fb71154d4be7866ccaf67702fffad8c1e0890979064e254956f9cb",
    "whitman-1918.pdf": "d678cea38e973571a6db506a09232f7ddcbcbac5461c049c14cf28cdfab002de",
    "grasssands00whitrich_bw.pdf": "5a4b594bed5f734dda0e09dfeb7b36d0c03f6bbe67cc0983adb10b021258d89d",
}
SELECTED = (
    "bunting", "drums", "city", "march", "father", "twilight", "sight", "year", "dreams", "cluster",
    "civilian", "adieu", "long", "weave", "spirit", "captain", "hush", "america", "foreign", "democracy",
)
GUTENBERG = "https://www.gutenberg.org/ebooks/27494"
SCAN = "https://archive.org/download/patrioticpoemsof00whitiala/patrioticpoemsof00whitiala.pdf"


def digest(data):
    return hashlib.sha256(data).hexdigest()


class VerseParser(HTMLParser):
    """Read verse spans and reject unreviewed internal line breaks."""

    def __init__(self, slug):
        super().__init__(convert_charrefs=True)
        self.slug = slug
        self.divs = []
        self.spans = []
        self.stanzas = []
        self.poem_count = 0
        self.current = None
        self.exception_count = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "div":
            kind = attrs.get("class", "")
            self.divs.append(kind)
            if kind == "poem":
                self.poem_count += 1
            elif kind == "stanza":
                if "poem" not in self.divs:
                    raise ValueError("Stanza outside poem")
                self.stanzas.append([])
        elif tag == "span":
            kind = attrs.get("class", "")
            self.spans.append(kind)
            if re.fullmatch(r"i\d+", kind):
                if self.current is not None or "stanza" not in self.divs:
                    raise ValueError("Unexpected verse span")
                self.current = ""
        elif tag == "br" and self.current is not None:
            self.current += "\0"

    def handle_data(self, data):
        if self.current is not None:
            self.current += data

    def handle_endtag(self, tag):
        if tag == "div":
            if not self.divs:
                raise ValueError("Unexpected closing div")
            self.divs.pop()
        elif tag == "span":
            if not self.spans:
                raise ValueError("Unexpected closing span")
            kind = self.spans.pop()
            if re.fullmatch(r"i\d+", kind):
                parts = [" ".join(part.split()) for part in self.current.split("\0")]
                parts = [part for part in parts if part]
                self.current = None
                if len(parts) != 1:
                    if self.slug == "drums" and parts == [
                        "No bargainers' bargains by day—no brokers or speculators—would they", "continue?"
                    ]:
                        parts = [" ".join(parts)]
                    elif self.slug != "weave" or parts != [
                        "For great campaigns of peace the same the wiry threads to weave,",
                        "We know not why or what, yet weave, forever weave.",
                    ]:
                        raise ValueError(f"Unexpected internal line break: {self.slug}")
                    self.exception_count += 1
                if not parts or not self.stanzas:
                    raise ValueError("Empty verse span")
                self.stanzas[-1].extend(parts)


def extract(document, item):
    headings = list(re.finditer(r"<h2[^>]*>(.*?)</h2>", document, re.IGNORECASE | re.DOTALL))

    def heading(match):
        return html.unescape(re.sub(r"<[^>]+>", "", match.group(1))).strip()

    matches = [index for index, match in enumerate(headings) if heading(match) == item["heading"]]
    first, last = item["pages"]
    if len(matches) != 1 or not 1 <= first <= last < 200:
        raise ValueError(f"Unexpected heading or page range: {item['slug']}")
    index = matches[0]
    if index + 1 == len(headings) or f'id="Page_{first}"' not in headings[index].group(1):
        raise ValueError(f"Missing heading boundary: {item['slug']}")
    if document.count(f'id="Page_{first}"') != 1:
        raise ValueError(f"Repeated page anchor: {item['slug']}")
    parser = VerseParser(item["slug"])
    parser.feed(document[headings[index].end():headings[index + 1].start()])
    parser.close()
    expected_exceptions = int(item["slug"] in {"drums", "weave"})
    if parser.divs or parser.spans or parser.current is not None or parser.exception_count != expected_exceptions:
        raise ValueError(f"Unexpected poem markup: {item['slug']}")
    if parser.poem_count != len(item["stanzas"]) or [len(stanza) for stanza in parser.stanzas] != item["stanzas"]:
        raise ValueError(f"Unexpected stanza boundaries: {item['slug']}")
    text = "\n\n".join("\n".join(stanza) for stanza in parser.stanzas)
    lines = text.splitlines()
    if not lines or lines[0] != item["first"] or lines[-1] != item["last"]:
        raise ValueError(f"Unexpected first or last line: {item['slug']}")
    if digest(text.encode("utf8")) != item["textSha256"]:
        raise ValueError(f"Reviewed reading changed: {item['slug']}")
    return text


def records(directory):
    evidence = {}
    for name, expected in EVIDENCE.items():
        evidence[name] = (directory / name).read_bytes()
        if digest(evidence[name]) != expected:
            raise ValueError(f"Reviewed evidence changed: {name}")
    document = evidence["pg27494-h.htm"].decode("utf8")
    items = json.loads(MANIFEST.read_text(encoding="utf8"))["poems"]
    if tuple(item["slug"] for item in items) != SELECTED:
        raise ValueError("Unexpected reviewed selection")
    output = []
    for item in items:
        first, last = item["pages"]
        comp_first, comp_last = item["comparisonPdfPages"]
        if not 1 <= comp_first <= comp_last <= 448:
            raise ValueError(f"Invalid comparison page range: {item['slug']}")
        page_label = str(first) if first == last else f"{first}–{last}"
        comparison_label = str(comp_first) if comp_first == comp_last else f"{comp_first}–{comp_last}"
        context = (
            f"A complete poem as printed in The Patriotic Poems of Walt Whitman (1918), pp. {page_label}. "
            "The Gutenberg HTML was compared in verse order with punctuation-insensitive OCR of the linked "
            "1918 scan, with selected visual checks. Its extent was also compared with the 1891/92 "
            f"Leaves of Grass scan, PDF pp. {comparison_label}, using OCR and selected visual checks. "
            "The linked scan and Gutenberg text are the same edition, not necessarily the same copy; "
            "the later anthology is not an independent manuscript witness. Punctuation was not "
            "independently collated character by character; indentation and typographic details are "
            "omitted and wrapped verse lines are rejoined. This is not a diplomatic transcription. "
            "The United States is associated with Whitman, not asserted as each poem's place of "
            "composition; the exact composition year is not established."
        )
        if item["slug"] == "drums":
            context += " The 1918 print reads ‘Not the peaceful farmer’; the 1891/92 print reads ‘Nor’."
        elif item["slug"] == "march":
            context += " The 1918 print reads ‘odour of blood’; the 1891/92 print reads ‘odor of blood’."
        elif item["slug"] == "spirit":
            context += " The 1918 heading includes ‘Washington City, 1865’."
        elif item["slug"] == "hush":
            context += " The 1918 heading includes ‘May 4, 1865’."
        output.append({
            "id": f"whitman-1918-{item['slug']}",
            "title": item["title"],
            "author": "Walt Whitman",
            "authorId": "walt-whitman",
            "authorYears": "1819–1892",
            "country": "United States",
            "language": "English",
            "lang": "en",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Printed in 1918 anthology · composition year not established",
            "era": "Nineteenth century",
            "form": "Poem",
            "collection": "The Patriotic Poems of Walt Whitman · 1918 edition",
            "themes": [],
            "mood": "paper",
            "context": context,
            "contextSource": f"{SCAN}#page={first + 14}",
            "contextSourceTitle": f"Internet Archive · 1918 scan, p. {first}",
            "sourceTitle": "Project Gutenberg · The Patriotic Poems of Walt Whitman (eBook 27494)",
            "source": GUTENBERG,
            "rights": (
                "The historical poems and 1918 edition are public domain in the United States; check local law. "
                "Gutenberg credits K. Nordquist, Carla Foust and the Online Distributed Proofreading Team. "
                "Scanned pages are linked, not republished; no translation is supplied."
            ),
            "text": extract(document, item),
            "translations": [],
        })
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the reviewed source files")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Records differ from the reviewed readings")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

#!/usr/bin/env -S uv run --no-project --with beautifulsoup4 python
"""Import historical poetry from reviewed local Gutenberg files.

Run: uv run --no-project --with beautifulsoup4 python scripts/import-anthologies.py DIR
DIR must contain the five named Gutenberg files. Checksums pin the exact
transcriptions; re-review the source before changing them.
"""

import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path(__file__).resolve().parent.parent
CHECKSUMS = {
    "spanish-100.html": "b7ee567acc7050f148b7089e107d3d3dbae679034b4fd1ff9a15e0bfe122d684",
    "black-american-verse.html": "81f9e8882c46c9b5349058060817a7b5aa4eb4197bf71ebfe13b1e76231d55a8",
    "espanca.html": "01757ce48509a6dbeb7950a30e473d3b9deb5ae3ee396b349c26068d5b904e62",
    "emily-source.txt": "f4421418353de2737c9bfe3db1e4657534b6b8ae2a8603f31de2d77678d18791",
    "fleurs.html": "bfcd8c0817c1bcfa5a6a3c4005c3bc9dd64f2b026b10b94862f66f33394d6c20",
}


def soup_from(directory, filename):
    raw = (directory / filename).read_bytes()
    if hashlib.sha256(raw).hexdigest() != CHECKSUMS[filename]:
        raise ValueError(f"Source checksum changed: {filename}")
    return BeautifulSoup(raw, "html.parser")


def plain(node):
    """Omit notes and page markers without modifying the traversal tree."""
    return "".join(
        str(item) for item in node.descendants
        if isinstance(item, NavigableString) and not any(
            isinstance(p, Tag) and (p.name in {"sup", "script", "style"}
            or set(p.get("class", [])) & {"pagenum", "fnanchor", "footnote"})
            for p in item.parents if p is not node
        )
    ).strip()


def br_lines(node):
    """HTML whitespace is not a line break; br elements are."""
    parts = []
    for item in node.descendants:
        if isinstance(item, Tag) and item.name == "br":
            parts.append("\n")
        elif isinstance(item, NavigableString) and not any(
            isinstance(p, Tag) and (p.name == "sup" or "pagenum" in p.get("class", []))
            for p in item.parents if p is not node
        ):
            parts.append(re.sub(r"\s+", " ", str(item)))
    return [line.strip() for line in "".join(parts).split("\n") if line.strip()]


def slug(value):
    value = unicodedata.normalize("NFKD", value)
    value = "".join(c for c in value if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


def common(ident, title, author, country, language, lang, collection, source_title, source, text, context):
    return {
        "id": ident, "title": title, "author": author, "authorId": slug(author),
        "authorYears": "Dates not established here", "country": country,
        "language": language, "lang": lang, "direction": "ltr", "year": None,
        "yearLabel": "Composition date not established", "era": "Date not established",
        "form": "Verse", "collection": collection, "themes": [], "mood": "paper",
        "context": context, "sourceTitle": source_title, "source": source,
        "rights": "Historical original in a pre-1931 edition; public domain in the United States. Check local law before reuse.",
        "text": text, "translations": [],
    }


def spanish(soup):
    headings = soup.find_all("h3", id=re.compile(r"^P\d{3}$"))
    if [h["id"] for h in headings] != [f"P{i:03}" for i in range(1, 101)]:
        raise ValueError("Spanish anthology numbering changed")
    records = []
    for heading in headings:
        number = heading["id"][1:]
        source_author = plain(heading.find_previous("h2"))
        if source_author == "ROMANCES VIEJOS":
            author, country = "Traditional / anonymous (Romances viejos)", "Not established"
        elif source_author.startswith("ANÓNIMO"):
            author, country = source_author.title(), "Not established"
        else:
            author = re.sub(r"^(Don|Doña) ", "", source_author.title())
            author = re.sub(r"\b(De|Del|La)\b", lambda m: m.group().lower(), author)
            # Legacy place associations need individual source review; they are
            # not evidence of nationality or a poem's place of composition.
            country = ("Venezuela" if "ANDRÉS BELLO" in source_author else
                       "Cuba" if "HEREDIA" in source_author or "AVELLANEDA" in source_author else "Spain")
        stanzas = []
        last_parent = None
        for node in heading.next_elements:
            if isinstance(node, Tag) and (node.name == "h2" or node.name == "h3" and re.fullmatch(r"P\d{3}", node.get("id", ""))):
                break
            if isinstance(node, Tag) and node.name in {"h4", "h5"}:
                label = re.sub(r"\s+", " ", plain(node)).strip()
                if label:
                    stanzas.append([label])
                    last_parent = None
                continue
            if not isinstance(node, Tag) or node.name != "p" or not node.find_parent("div", class_=re.compile(r"\bversos\b")):
                continue
            line = re.sub(r"\s+", " ", plain(node)).strip()
            if not line:
                continue
            stanza = node.find_parent("div", class_="estrofa")
            if not stanzas or stanza is not last_parent or "i2" in node.get("class", []):
                stanzas.append([])
            stanzas[-1].append(line)
            last_parent = stanza
        lines = [line for stanza in stanzas for line in stanza]
        if not 4 <= len(lines) <= 1000:
            raise ValueError(f"Unexpected Spanish verse structure: {number}, {len(lines)} lines")
        title = re.sub(r"^\d+\.\s*", "", re.sub(r"\s+", " ", plain(heading))).strip()
        title = title or lines[0]
        text = "\n\n".join("\n".join(stanza) for stanza in stanzas)
        record = common(
            f"castellana-{number}", title, author, country, "Spanish", "es",
            "Las cien mejores poesías de la lengua castellana",
            f"Project Gutenberg · Las cien mejores poesías, 1910, no. {int(number)}",
            f"https://www.gutenberg.org/files/65880/65880-h/65880-h.htm#P{number}", text,
            f"Selection {int(number)} in Menéndez y Pelayo's 1910 anthology. The heading credits {source_author}; the date of this work is not established here. The transcription retains the edition's historical spelling.",
        )
        record["anonymous"] = source_author in {"ROMANCES VIEJOS", "ANÓNIMO", "ANÓNIMO SEVILLANO"}
        records.append(record)
    return records


def black_american(soup):
    start = soup.find("h2", id="id00182")
    if not start:
        raise ValueError("Anthology start not found")
    records = []
    author = None
    current = None

    def flush():
        if current is None or not current["stanzas"]:
            return
        title, stanzas, ident, poet = current["title"], current["stanzas"], current["id"], current["author"]
        lines = [line for stanza in stanzas for line in stanza]
        if not 4 <= len(lines) <= 500:
            raise ValueError(f"Unexpected English verse structure: {ident}, {len(lines)} lines")
        # These headings explicitly identify excerpts or a nested section of a longer poem.
        if ident in {"id00382", "id00384", "id00428"}:
            return
        # Legacy place associations need individual source review; do not infer
        # a poet's nationality or a poem's creation place from this anthology.
        country = "Jamaica / United States" if poet == "Claude McKay" else "United States / Caribbean" if poet == "George Reginald Margetson" else "United States"
        records.append(common(
            f"american-1922-{ident[2:]}", title, poet, country, "English", "en",
            "The Book of American Negro Poetry",
            "Project Gutenberg · The Book of American Negro Poetry (1922)",
            f"https://www.gutenberg.org/cache/epub/11986/pg11986-images.html#{ident}",
            "\n\n".join("\n".join(stanza) for stanza in stanzas),
            "This poem appears in James Weldon Johnson's 1922 anthology. The historical edition's spellings and dialect are retained; the composition date is not established here.",
        ))

    for node in start.next_siblings:
        if not isinstance(node, Tag):
            continue
        if node.name == "h2":
            break
        if node.name == "p" and "margin-top: 4em" in node.get("style", ""):
            flush()
            current = None
            author = plain(node)
        elif node.name == "h4":
            flush()
            if not author:
                raise ValueError("Poem without anthology author")
            current = {"title": re.sub(r"\[\d+\]", "", plain(node)).strip(), "id": node["id"], "author": author, "stanzas": []}
        elif node.name == "p" and current is not None:
            lines = br_lines(node)
            if lines:
                current["stanzas"].append(lines)
    flush()
    if not 100 <= len(records) <= 130 or len({p["author"] for p in records}) < 25:
        raise ValueError(f"Unexpected American anthology structure: {len(records)} records")
    return records


def espanca(soup):
    headings = [a.parent for a in soup.select("h3 > a[id]") if re.fullmatch(r"c\d+", a["id"])]
    if [h.a["id"] for h in headings] != [f"c{i}" for i in range(1, 33)]:
        raise ValueError("Portuguese anthology numbering changed")
    records = []
    for heading in headings:
        blocks = []
        for node in heading.next_siblings:
            if isinstance(node, Tag) and node.name == "h3":
                break
            if isinstance(node, Tag) and node.name == "div" and any(re.fullmatch(r"poetry[123]", c) for c in node.get("class", [])):
                blocks.append(node)
        if not blocks:
            raise ValueError(f"No Portuguese verse in {heading.a['id']}")
        # A small indented second div continues the last line in 'Vaidade'.
        lines = br_lines(blocks[0])
        for continuation in blocks[1:]:
            more = br_lines(continuation)
            if heading.a["id"] != "c2" or len(more) != 1:
                raise ValueError(f"Unexpected Portuguese continuation: {heading.a['id']}")
            lines[-1] += " " + more[0]
        if len(lines) != 14:
            raise ValueError(f"Expected a 14-line sonnet in {heading.a['id']}, got {len(lines)}")
        number = int(heading.a["id"][1:])
        record = common(
            f"espanca-magoas-{number:02}", re.sub(r"\s+", " ", plain(heading)),
            "Florbela Espanca", "Portugal", "Portuguese", "pt", "Livro de Mágoas",
            f"Project Gutenberg · Livro de Mágoas (1919), no. {number}",
            f"https://www.gutenberg.org/cache/epub/17610/pg17610-images.html#c{number}",
            "\n\n".join("\n".join(lines[a:b]) for a, b in [(0, 4), (4, 8), (8, 11), (11, 14)]),
            "From Florbela Espanca's Livro de Mágoas, published in 1919. The Gutenberg transcription retains early twentieth-century Portuguese spelling; the composition date is not established here.",
        )
        record.update({"authorYears": "1894–1930", "form": "Sonnet", "era": "Early 20th century"})
        records.append(record)
    return records


def baudelaire(soup):
    # Some other headings in this eBook run several poems together. These
    # individually checked headings have complete, separate verse blocks.
    selection = {
        "AU LECTEUR": 40, "L'ALBATROS": 16, "ELEVATION": 20,
        "LA MUSE VENALE": 14, "L'ENNEMI": 14, "LA VIE ANTERIEURE": 14,
        "BOHEMIENS EN VOYAGE": 14, "L'HOMME ET LA MER": 16,
        "DON JUAN AUX ENFERS": 20, "LA BEAUTE": 14, "L'IDEAL": 14,
        "DE PROFUNDIS CLAMAVI": 14, "REMORDS POSTHUME": 14, "LE POSSEDE": 14,
    }
    records = []
    for heading in soup.find_all("h2"):
        title = plain(heading)
        if title not in selection:
            continue
        stanzas = []
        for node in heading.next_siblings:
            if isinstance(node, Tag) and node.name == "h2":
                break
            if isinstance(node, Tag) and node.name == "p" and node.get_text(strip=True):
                stanzas.append(br_lines(node))
        if sum(map(len, stanzas)) != selection[title]:
            raise ValueError(f"Unexpected Baudelaire transcription: {title}")
        record = common(
            f"baudelaire-{slug(title)}", title, "Charles Baudelaire", "France", "French", "fr",
            "Les Fleurs du Mal", "Project Gutenberg · Les Fleurs du Mal (eBook 6099)",
            "https://www.gutenberg.org/ebooks/6099",
            "\n\n".join("\n".join(stanza) for stanza in stanzas),
            "From Project Gutenberg's transcription of Les Fleurs du Mal. The eBook does not identify the particular print edition; spelling and possible transcription errors are retained, and this work's composition date is not established here.",
        )
        record.update({"authorYears": "1821–1867", "era": "19th century", "form": "Lyric"})
        record["rights"] = "Historical French original; Gutenberg identifies this eBook as public domain in the United States. The print edition is not identified. Check local law before reuse."
        records.append(record)
    if len(records) != len(selection):
        raise ValueError("Baudelaire selection headings changed or repeated")
    return records


def dickinson(directory):
    raw = (directory / "emily-source.txt").read_bytes()
    if hashlib.sha256(raw).hexdigest() != CHECKSUMS["emily-source.txt"]:
        raise ValueError("Dickinson source checksum changed")
    source = raw.decode("utf-8").replace("\r\n", "\n")
    sections = list(re.finditer(r"(?m)^(I|II|III|IV)\. (LIFE|LOVE|NATURE|TIME AND ETERNITY)\.\s*$", source))
    if len(sections) != 12:
        raise ValueError("Unexpected Dickinson section structure")
    records = []
    for section_index, section in enumerate(sections[:8]):
        series = section_index // 4 + 1
        part = section_index % 4
        body = source[section.end():sections[section_index + 1].start()]
        if part == 3:
            body = body.split("\nPOEMS\n\nby EMILY DICKINSON", 1)[0]
        entries = list(re.finditer(r"(?m)^([IVXLCDM]+)\.\s*$", body))
        if len(entries) != [26, 18, 31, 40, 57, 16, 51, 42][section_index]:
            raise ValueError("Unexpected Dickinson poem numbering")
        for i, entry in enumerate(entries):
            text = body[entry.end():entries[i + 1].start() if i + 1 < len(entries) else len(body)].strip()
            chunks = re.split(r"\n\s*\n", text)
            title = None
            if chunks:
                candidate = chunks[0].strip()
                if "\n" not in candidate and not candidate.startswith("[") and re.search(r"[A-Z]", candidate) and candidate.upper() == candidate:
                    title = chunks.pop(0).strip().strip('"').rstrip(".")
            if chunks and chunks[0].lstrip().startswith("["):
                chunks.pop(0)
            text = "\n\n".join(chunk.strip() for chunk in chunks).strip()
            lines = text.splitlines()
            if not 4 <= len([line for line in lines if line.strip()]) <= 150:
                raise ValueError(f"Unexpected Dickinson text in series {series}, {part}, {i + 1}")
            title = title or lines[0].strip()
            record = common(
                f"dickinson-{series}-{part + 1}-{i + 1:02}", title, "Emily Dickinson",
                "United States", "English", "en", f"Poems, series {series}",
                f"Project Gutenberg · Emily Dickinson, Poems, series {series} (eBook 12242)",
                "https://www.gutenberg.org/ebooks/12242", text,
                f"From the {'1890 first' if series == 1 else '1891 second'} series of Poems, edited by Mabel Loomis Todd and T. W. Higginson. These early editions supplied most titles and altered punctuation; they do not reproduce Dickinson's manuscripts. The composition date is not established here.",
            )
            record.update({"authorYears": "1830–1886", "era": "19th century", "form": "Lyric"})
            records.append(record)
    return records


def main(directory):
    for filename, importer, target in [
        ("spanish-100.html", spanish, "castellana.json"),
        ("black-american-verse.html", black_american, "american-1922.json"),
        ("espanca.html", espanca, "espanca.json"),
        ("fleurs.html", baudelaire, "baudelaire.json"),
    ]:
        records = importer(soup_from(directory, filename))
        out = ROOT / "content/poems" / target
        out.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {len(records)} records to {out}")
    records = dickinson(directory)
    out = ROOT / "content/poems/dickinson.json"
    out.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(records)} records to {out}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]))

#!/usr/bin/env python3
"""Reproduce Firmina records after checking the reviewed historical evidence."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/firmina-historical-readings.txt"
OUTPUT = ROOT / "content/poems/firmina-historical-reviewed.json"
READINGS_SHA256 = "6f9607a3ad8a67e39ab8f1ed33984af359dce4b950bc6974f4eebe25a27e2bc3"
EVIDENCE = {
    "firmina-cantos-source.pdf": "5c8faf4f54f1b358ae42cd2c5bb831a162f82eb2d44bbca0b0fb3138b9a2fa42",
    "parnaso-maranhense-1861.pdf": "465a6cd7587269bcd6ed4d65520ce796dc7a70189856d7ff3583cddeb5468ab1",
    "memorial-hosana.pdf": "ad38a399d05b6547da4066e17b196bb70ab4891b2c7cd63ec5d64267e3f24640",
    "memorial-uns-olhos.pdf": "1627355f38c39d62d58a58562296856329a1c864fd56a5b71bc16b3cb4a18483",
    "ufrgs-amor-2022.pdf": "2e1bb22957d40e10e6bcc236d0f52a3f191169c7fda9bbd6fea1af14e7c762a3",
}
SOURCES = {
    "parnaso": {
        "collection": "Parnaso maranhense",
        "year": 1861,
        "url": "https://literaturabrasileira.ufsc.br/midias/stream?id=147845&raw=1",
        "sourceTitle": "UFSC · Parnaso maranhense, 1861",
    },
    "cantos": {
        "collection": "Cantos à beira-mar",
        "year": 1871,
        "url": "https://literaturabrasileira.ufsc.br/midias/stream?id=155427&raw=1",
        "sourceTitle": "UFSC · Cantos à beira-mar, 1871",
    },
}
# Printed pages and PDF leaves are explicit: the 1871 scan skips whole ranges.
# The stanza lists also preserve stanzas split across printed page turns.
SELECTION = (
    ("parnaso", "por-ver-te", "Por ver-te", (222, 223), (234, 235),
     (5, 4, 4, 4, 4, 5, 4), ("Love",), "",
     "The separate place marker ‘Guimarães...’ after the verse is not part of the poem."),
    ("parnaso", "minha-vida", "Minha vida", (223, 225), (235, 237),
     (4,) * 8, (), "",
     "The separate place marker ‘Guimarães...’ is omitted. Ink obscures part of a word on p. 224; ‘tristesa’ is a provisional reading, not a certain reconstruction."),
    ("cantos", "uma-tarde-no-cuman", "Uma tarde no Cuman", (25, 26), (23, 24),
     (4,) * 8, ("Love", "Nature"), "Uma tarde no Cumã",
     "The printed footnote identifies Cuman as the beaches of Guimarães; it is not part of the verse. The 1871 print reads ‘phrases’; the 2024 publisher excerpt and UFSC's modernized transcription give ‘fases’."),
    ("cantos", "supplica", "Supplica", (27, 29), (25, 27),
     (6,) * 10, ("Faith",), "Súplica",
     "The 1871 print has ‘sem gozos’; Biblioteca Pública do Paraná's 2024 transcription has ‘seus gozos’."),
    ("cantos", "ah-nao-posso", "Ah! não posso!", (45, 46), (43, 44),
     (6,) * 4, ("Love",), "",
     "A stanza continues across the page turn; the separate following poem begins on p. 47."),
    ("cantos", "um-bouquet", "Um bouquet", (125, 127), (69, 71),
     (8,) * 5, (), "",
     "The printed dedication is to a young poet on his birthday; it is not included in the verse."),
    ("cantos", "hosana", "Hosana!", (149, 151), (93, 95),
     (8,) * 7, ("Faith", "Nature"), "",
     "Dedicated in print to Ovidio da Gama Lobo. The Memorial's transcription of an earlier newspaper version differs throughout, ending ‘Concerto ao seu DEUS’ rather than ‘Hosana! Senhor!’; the earlier scan was not independently checked here."),
    ("cantos", "o-pedido", "O pedido", (157, 158), (101, 102),
     (4,) * 4, ("Love",), "", ""),
    ("cantos", "amor", "Amor", (159, 159), (103, 103),
     (4,) * 3, ("Love",), "",
     "The 1871 print begins ‘revelar-te’; a 2022 UFRGS selection gives ‘rever-te’."),
    ("cantos", "scismar", "Scismar", (161, 162), (105, 106),
     (7, 8, 8, 8), ("Faith", "Nature"), "Cismar",
     "The printed dedication to the poet's cousin is omitted from the verse; a stanza continues across the page turn."),
    ("cantos", "uns-olhos", "Uns olhos", (205, 206), (150, 151),
     (4,) * 6, ("Love",), "",
     "The 1871 print has ‘que fazem solemnes’ and ‘me excitam a viver’; the Memorial's transcription of an earlier version reads ‘que fazem sem custo’ and ‘me excitam o viver’. The earlier scan was not independently checked here."),
)
BIOGRAPHY = "https://mariafirmina.org.br/novos-dados-biograficos-e-novos-documentos/"
RIGHTS = (
    "The historical poems and pre-1931 printings are public domain in the United States; "
    "check local law. Transcribed from the linked scan; the images are linked, not reproduced."
)


def digest(value):
    return hashlib.sha256(value).hexdigest()


def make_records(directory):
    for filename, expected in EVIDENCE.items():
        if digest((directory / filename).read_bytes()) != expected:
            raise ValueError(f"Reviewed evidence changed: {filename}")
    raw = READINGS.read_bytes()
    if digest(raw) != READINGS_SHA256:
        raise ValueError("Reviewed readings changed")
    parts = re.split(r"^=== ([a-z0-9-]+) ===\n", raw.decode("utf8"), flags=re.MULTILINE)
    if parts.pop(0) or len(parts) != 2 * len(SELECTION):
        raise ValueError("Unexpected readings format")
    readings = [(parts[i], parts[i + 1].strip()) for i in range(0, len(parts), 2)]
    if tuple(slug for slug, _ in readings) != tuple(item[1] for item in SELECTION):
        raise ValueError("Unexpected selection or order")
    records = []
    for item, (_, text) in zip(SELECTION, readings, strict=True):
        source_id, slug, title, printed, pdf, stanzas, themes, display, note = item
        if printed[1] - printed[0] != pdf[1] - pdf[0]:
            raise ValueError(f"Nonconsecutive source pages: {slug}")
        if tuple(len(stanza.splitlines()) for stanza in text.split("\n\n")) != stanzas:
            raise ValueError(f"Unexpected stanza boundaries: {slug}")
        if any(line != line.strip() for line in text.splitlines()):
            raise ValueError(f"Unexpected whitespace: {slug}")
        source = SOURCES[source_id]
        page_label = str(printed[0]) if printed[0] == printed[1] else f"{printed[0]}–{printed[1]}"
        context = (
            f"From {source['collection']} ({source['year']}), pp. {page_label}. "
            "The verse, intervening page turns and its printed boundaries were checked in the "
            "linked copy; completeness refers to this printing, not every witness. Historical "
            "spelling is retained; indentation, spacing and some punctuation or accent placement "
            "are normalized. Maria Firmina dos Reis was a Brazilian writer and teacher. Her "
            "birth year is disputed: the Memorial cites documents for 1822, while UFSC gives 1825. "
            "Brazil is associated with the poet, not an assertion of this poem's composition place; "
            "its composition date is not established here. " + note
        ).strip()
        record = {
            "id": f"firmina-{source_id}-{slug}",
            "title": title,
            "author": "Maria Firmina dos Reis",
            "authorId": "maria-firmina-dos-reis",
            "authorYears": "1822 or 1825–1917",
            "country": "Brazil",
            "language": "Portuguese",
            "lang": "pt",
            "direction": "ltr",
            "year": None,
            "yearLabel": f"Printed {source['year']} · composition date not established",
            "era": "Date not established",
            "form": "Poetry",
            "collection": source["collection"],
            "themes": list(themes),
            "mood": "paper",
            "context": context,
            "contextSource": BIOGRAPHY,
            "contextSourceTitle": "Memorial de Maria Firmina · biographical documents",
            "sourceTitle": f"{source['sourceTitle']}, pp. {page_label}",
            "source": f"{source['url']}#page={pdf[0]}",
            "rights": RIGHTS,
            "text": text,
            "translations": [],
        }
        if display:
            record["displayTitle"] = display
            record["displayTitleLang"] = "pt"
            record["context"] += " The modernized display title is a discovery aid."
        records.append(record)
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the reviewed evidence")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(make_records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Records differ from the reviewed readings")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

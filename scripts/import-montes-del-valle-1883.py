#!/usr/bin/env python3
"""Reproduce selected complete poems from Montes del Valle's 1883 book."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/montes-del-valle-1883-readings.txt"
OUTPUT = ROOT / "content/poems/montes-del-valle-1883-reviewed.json"
PDF_SHA = "5586488121e97f8660de7b791365a3e16d83133755cab10d5395ddd4c8ddecbe"
READINGS_SHA = "4feb19a976ca14a4db66b0bd2e0ecc7341140a0610c6271fa250aa506e125e59"
PDF_URL = "https://babel.banrepcultural.org/digital/api/collection/p17054coll10/id/4352/download"
CATALOGUE_URL = "https://babel.banrepcultural.org/digital/collection/p17054coll10/id/4352"
SELECTION = (
    # Stable slug, heading, PDF page, printed page, displayed lines, printed dedication.
    ("a-mi-hija-luz", "A mi hija Luz en su tumba", 64, 14, 17, ""),
    ("a-zoila-rosa-del-valle", "A la señorita Zoila Rosa del Valle", 83, 33, 22, ""),
    ("una-azucena", "Una azucena", 113, 63, 16, "A la señorita Julia Lozada."),
    ("apologo", "Apólogo", 114, 64, 16, "A la señora Agripina Samper de A. en su día."),
    ("a-magdalena-giraldo-de-a", "A Magdalena Giraldo de A. en la tumba", 124, 74, 16, ""),
    ("no-te-olvidare", "No te olvidaré", 125, 75, 24, "A la señora Emilia Nátes de Latorre."),
    ("pepita-grillo", "Pepita Grillo", 131, 81, 16, ""),
    ("en-el-piano", "En el piano", 136, 88, 14, "A la señorita Helena de Francisco."),
    ("adios", "Adiós", 137, 89, 16, "Dedicado á la señorita Salustiana Afanador."),
    ("la-esperanza", "La esperanza", 170, 122, 16, "A la señora doña Mercedes H. de Álvarez."),
    ("dos-artistas", "Dos artistas", 198, 150, 16, "A los inteligentes jóvenes Alejo y Agustín Patiño."),
    ("un-canario", "Un canario", 199, 151, 12, "A la señorita María Galindo."),
    (
        "la-imprenta", "La imprenta", 201, 153, 14,
        "Al señor don Enrique Zalamea, introductor de la imprenta de vapor en Colombia.",
    ),
)
NOTES = {
    "a-zoila-rosa-del-valle": "The title joins the two printed heading lines; the index shortens it to ‘A Zoila Rosa del Valle’.",
    "una-azucena": "The poem heading reads ‘Una azucena’; the book's index gives ‘A una azucena’.",
    "apologo": "The poem ends with a comma in the printing; the following page starts a different work.",
    "a-magdalena-giraldo-de-a": (
        "The poem page prints ‘Se evaporó su aroma bendecida’; the book's errata directs readers "
        "to replace ‘aroma’ with ‘esencia’. This reading follows that correction."
    ),
    "adios": "The printing places ‘1865’ below the poem without specifying what the date denotes.",
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def make_records(directory):
    if digest((directory / "poesias-1883.pdf").read_bytes()) != PDF_SHA:
        raise ValueError("Historical PDF changed")
    raw = READINGS.read_bytes()
    if digest(raw) != READINGS_SHA:
        raise ValueError("Reviewed readings changed")
    pieces = re.split(r"(?m)^@@ ([a-z0-9-]+)\n", raw.decode("utf8"))
    if pieces[0] or len(pieces) != 2 * len(SELECTION) + 1:
        raise ValueError("Unexpected reading boundaries")
    readings = [(pieces[index], pieces[index + 1].strip()) for index in range(1, len(pieces), 2)]
    if [slug for slug, _ in readings] != [item[0] for item in SELECTION]:
        raise ValueError("Unexpected selection or order")
    if len({text for _, text in readings}) != len(readings):
        raise ValueError("Duplicate reviewed poem")

    records = []
    for (slug, title, pdf_page, printed_page, expected_lines, dedication), (_, text) in zip(
        SELECTION, readings, strict=True
    ):
        lines = text.splitlines()
        if (any(line != line.strip() for line in lines) or "\n\n\n" in text
                or len([line for line in lines if line]) != expected_lines):
            raise ValueError(f"Incomplete or malformed poem: {slug}")
        context = (
            "A poem by Colombian poet Agripina Montes del Valle in her 1883 Poesías. "
            "The printing date does not establish when or where the poem was composed. "
            "This reading preserves historical wording while normalizing spacing, indentation, ellipses, "
            "some accents and punctuation. The linked PDF may download; its physical page number is given."
        )
        if dedication:
            context += f" Printed dedication: {dedication}"
        if slug in NOTES:
            context += " " + NOTES[slug]
        record = {
            "id": f"montes-del-valle-1883-{slug}", "title": title,
            "author": "Agripina Montes del Valle", "authorId": "agripina-montes-del-valle",
            "authorYears": "1844–1915", "country": "Colombia", "language": "Spanish", "lang": "es",
            "direction": "ltr", "year": 1883, "yearLabel": "Printed in 1883", "era": "19th century",
            "form": "Sonnet" if slug == "la-imprenta" else "Verse", "collection": "Poesías (Tomo I)",
            "themes": [], "mood": "paper", "context": context,
            "sourceTitle": f"Montes del Valle · Poesías (1883), p. {printed_page} (PDF p. {pdf_page})",
            "source": f"{PDF_URL}#page={pdf_page}",
            "contextSource": f"{PDF_URL}#page=206" if slug == "a-magdalena-giraldo-de-a" else CATALOGUE_URL,
            "contextSourceTitle": "Poesías (1883) · errata (PDF p. 206)" if slug == "a-magdalena-giraldo-de-a"
            else "Banco de la República · catalogue and rights",
            "rights": (
                "Spanish original printed in 1883; public domain in the United States. "
                "Banco de la República labels the book public domain. The scan is linked, not republished; "
                "copyright and moral rights vary by jurisdiction, so check local law."
            ),
            "text": text, "translations": [],
        }
        records.append(record)
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the pinned 1883 PDF")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(make_records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Committed records differ from the reviewed readings")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

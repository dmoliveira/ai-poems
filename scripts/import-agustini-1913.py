#!/usr/bin/env python3
"""Reproduce selected complete poems from Agustini's scan-reviewed 1913 book."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/agustini-1913-readings.txt"
OUTPUT = ROOT / "content/poems/agustini-1913-reviewed.json"
PDF_SHA = "f1677fe5928d951bdd52ce05a9ee8eb3a768ba0493fc83851446c5b861719e4f"
READINGS_SHA = "7e224228920fa35a30f79b8ca4021f28f223d8e5e9a41e9ab24b53f23b7b735b"
PDF_URL = "https://upload.wikimedia.org/wikipedia/commons/9/9c/Los_c%C3%A1lices_vac%C3%ADos_-_IA_losclicesvac00agusuoft.pdf"
BIOGRAPHY = "https://autores.uy/autor/30"
SELECTION = (
    # Stable slug, title, first/last PDF pages, nonblank displayed lines, form.
    ("ofrendando-el-libro", "Ofrendando el libro a Eros", 21, 21, 13, "Verse"),
    ("nocturno-invierno", "Nocturno", 22, 23, 30, "Verse"),
    ("tu-boca", "Tu boca", 24, 24, 14, "Verse"),
    ("dia-nuestro", "Día nuestro", 29, 29, 12, "Verse"),
    ("tres-petalos-a-tu-perfil", "Tres pétalos a tu perfil", 30, 30, 18, "Verse"),
    ("la-ruptura", "La ruptura", 31, 31, 8, "Verse"),
    ("con-tu-retrato", "Con tu retrato", 37, 37, 14, "Sonnet"),
    ("en-silencio", "En silencio...", 38, 38, 14, "Verse"),
    ("otra-estirpe", "Otra estirpe", 39, 39, 14, "Sonnet"),
    ("fiera-de-amor", "Fiera de amor", 45, 45, 19, "Verse"),
    ("ceguera", "Ceguera", 46, 46, 8, "Verse"),
    ("inextinguibles", "Inextinguibles...", 47, 47, 8, "Verse"),
    ("nocturno-lago", "Nocturno", 52, 52, 8, "Verse"),
)
NOTES = {
    "ofrendando-el-libro": (
        "The title combines the poem's two printed headings; the book's index lists it as ‘Eros’."
    ),
    "nocturno-invierno": (
        "This is the Nocturno beginning ‘Fuera, la noche’; the same book contains a different Nocturno "
        "beginning ‘Engarzado en la noche’. The stanza break across the page turn is editorial."
    ),
    "tu-boca": (
        "The 1913 printing has ‘Seguía mi divina labor sobre la roca’; "
        "the linked comparison has ‘Seguía mi divina labor de roca’."
    ),
    "la-ruptura": (
        "The printed poem ends with a comma and spells ‘Esfinje’; the linked comparison ends with a period "
        "and spells ‘Esfinge’. The reason for these differences is not established."
    ),
    "en-silencio": (
        "The printing reads ‘Mi cabello se desfloca’; the linked Archiletras comparison, "
        "titled ‘El silencio’, has ‘mi cabello se desfleca’. The reason for the difference is unknown."
    ),
    "ceguera": (
        "The printing accents ‘cómo’ in the question; some later transcriptions have ‘como’. "
        "The displayed line count includes the short printed line ‘No sé...’."
    ),
    "inextinguibles": (
        "The poem heading is plural, ‘Inextinguibles...’, but the book's index gives the singular ‘Inextinguible’."
    ),
    "nocturno-lago": (
        "This is the Nocturno beginning ‘Engarzado en la noche’; the same book contains a different Nocturno "
        "beginning ‘Fuera, la noche’. The 1913 printing reads ‘la sima de la Vida’; "
        "the linked Ciudad Seva comparison reads ‘la cima de la Vida’. The reason for the difference is unknown."
    ),
}
COMPARISONS = {
    "tu-boca": ("https://leercuentos.online/poemas/tu-boca", "LeerCuentos · Tu boca (comparison)"),
    "la-ruptura": ("https://leercuentos.online/poemas/la-ruptura", "LeerCuentos · La ruptura (comparison)"),
    "en-silencio": (
        "https://www.archiletras.com/poemassentidos/delmira-agustini-toda-alma-toda-cuerpo/",
        "Archiletras · El silencio (comparison)",
    ),
    "inextinguibles": (f"{PDF_URL}#page=152", "1913 index · Inextinguible"),
    "nocturno-lago": ("https://ciudadseva.com/texto/nocturno-agustini/", "Ciudad Seva · Nocturno (comparison)"),
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def make_records(directory):
    if digest((directory / "calices-1913.pdf").read_bytes()) != PDF_SHA:
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
    for (slug, title, first, last, expected_lines, form), (_, text) in zip(SELECTION, readings, strict=True):
        lines = text.splitlines()
        if (any(line != line.strip() for line in lines) or "\n\n\n" in text
                or len([line for line in lines if line]) != expected_lines):
            raise ValueError(f"Incomplete or malformed poem: {slug}")
        page_label = f"PDF p. {first}" if first == last else f"PDF pp. {first}–{last}"
        context = (
            "A poem by Uruguayan poet Delmira Agustini as printed in Los cálices vacíos (1913). "
            "The book's publication date does not establish when or where the poem was composed. "
            "Uruguay's National Library gives her birth year as 1886; some sources give 1887. "
            "This reading retains historical spellings while normalizing spacing, ellipses, some punctuation "
            "and accents; italics and indentation are not reproduced."
        )
        if slug in NOTES:
            context += " " + NOTES[slug]
        comparison_url, comparison_title = COMPARISONS.get(
            slug, (BIOGRAPHY, "autores.uy · Delmira Agustini (birth-year sources)")
        )
        records.append({
            "id": f"agustini-1913-{slug}", "title": title,
            "author": "Delmira Agustini", "authorId": "delmira-agustini", "authorYears": "1886–1914",
            "country": "Uruguay", "language": "Spanish", "lang": "es", "direction": "ltr",
            "year": 1913, "yearLabel": "Printed in 1913", "era": "Early 20th century", "form": form,
            "collection": "Los cálices vacíos", "themes": [], "mood": "paper", "context": context,
            "sourceTitle": f"Agustini · Los cálices vacíos (1913), {page_label}",
            "source": f"{PDF_URL}#page={first}",
            "contextSource": comparison_url, "contextSourceTitle": comparison_title,
            "rights": (
                "Spanish original printed in 1913; public domain in the United States. "
                "The scan is linked, not republished. Copyright terms and moral rights vary: check local law."
            ),
            "text": text, "translations": [],
        })
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the pinned 1913 PDF")
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

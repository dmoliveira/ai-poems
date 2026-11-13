#!/usr/bin/env python3
"""Reproduce selected complete poems from Storni's scan-reviewed 1918 printing."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/storni-1918-readings.txt"
OUTPUT = ROOT / "content/poems/storni-1918-reviewed.json"
PDF = "circe-1918.pdf"
PDF_SHA = "e7beba3b80c04d19ac18db76f4bd1709c17e087e03c5c390f7326bbc41c76e9b"
READINGS_SHA = "3fe43a561604e9eef2efc533e6909dd24c7e82a0797492244871c0030359491b"
PDF_URL = "https://upload.wikimedia.org/wikipedia/commons/b/b4/El_Dulce_Da%C3%B1o_-_Alfonsina_Storni.pdf"
SELECTION = (
    ("asi", "Así", 5, 6, 18),
    ("este-grave-dano", "Este grave daño", 7, 7, 8),
    ("sabado", "Sábado", 9, 10, 25),
    ("dime", "Dime", 14, 15, 24),
    ("capricho", "Capricho", 16, 17, 28),
    ("dulce-tortura", "Dulce tortura", 26, 26, 8),
    ("el-dulce-dano", "El dulce daño", 27, 28, 14),
    ("dos-palabras", "Dos palabras", 36, 37, 18),
    ("tu-dulzura", "Tu dulzura", 38, 39, 14),
    ("el-llamado", "El llamado", 45, 46, 19),
    ("bajo-tus-miradas", "Bajo tus miradas", 56, 57, 14),
    ("queja", "Queja", 65, 66, 16),
    ("ladrona", "Ladrona", 71, 72, 12),
    ("transfusion", "Transfusión", 78, 79, 14),
    ("siete-vidas", "Siete vidas", 83, 84, 16),
    ("tu-me-quieres-blanca", "Tú me quieres blanca", 98, 101, 59),
    ("el-oro-de-la-vida", "El oro de la vida", 113, 113, 10),
    ("tentacion", "Tentación", 114, 114, 12),
    ("que-diria", "¿Qué diría?", 115, 116, 12),
    ("sentirse", "Sentirse", 117, 117, 8),
    ("cuadrados-y-angulos", "Cuadrados y ángulos", 137, 137, 9),
    ("aspecto", "Aspecto", 138, 138, 8),
    ("bah", "Bah!", 139, 139, 8),
    ("una-pared", "Una pared", 140, 140, 6),
    ("parasitos", "Parásitos", 141, 141, 7),
    ("verdad", "¿Verdad?", 142, 142, 8),
    ("sabeis-algo", "¿Sabéis algo?", 143, 143, 6),
    ("el-extrano-deseo", "El extraño deseo", 144, 145, 14),
)
NOTES = {
    "sabado": (
        "The 1918 print begins ‘Levanté temprano’ and reads ‘Comedor en sombras’; "
        "the linked Ciudad Seva comparison has ‘Me levanté temprano’ and ‘Comedor en sombra’."
    ),
    "tu-me-quieres-blanca": (
        "The print begins ‘Tu me quieres alba’ and reads ‘y lévate al alba’; the linked Ciudad Seva "
        "comparison has ‘Tú me quieres alba’ and ‘y límpiate al alba’. The reason for the difference "
        "is not established; the printed reading is retained."
    ),
    "que-diria": (
        "The 1918 print has ‘extra fantasía’ and ‘cubriendo las aceras’; the linked 2017 Biblioteca del "
        "Congreso anthology has ‘ultra fantasía’ and ‘cubriendo en las aceras’. The reason for "
        "the differences is not established; the printed reading is retained."
    ),
}
COMPARISONS = {
    "sabado": ("https://ciudadseva.com/texto/sabado/", "Ciudad Seva · Sábado (comparison)"),
    "tu-me-quieres-blanca": (
        "https://ciudadseva.com/texto/tu-me-quieres-blanca/",
        "Ciudad Seva · Tú me quieres blanca (comparison)",
    ),
    "que-diria": (
        "https://bcn.gob.ar/uploads/PoemasAlfonsinaStorni.pdf#page=18",
        "Biblioteca del Congreso · Poemas (2017), PDF p. 18 (comparison)",
    ),
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def make_records(directory):
    if digest((directory / PDF).read_bytes()) != PDF_SHA:
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
    for (slug, title, first, last, expected_lines), (_, text) in zip(SELECTION, readings, strict=True):
        lines = text.splitlines()
        if (any(line != line.strip() for line in lines) or "\n\n\n" in text
                or len([line for line in lines if line]) != expected_lines):
            raise ValueError(f"Incomplete or malformed poem: {slug}")
        context = (
            "A complete poem by Swiss-born Argentine poet Alfonsina Storni in El dulce daño, "
            "published in Buenos Aires in 1918. This reading follows the linked printing, preserving "
            "historical spelling and punctuation while normalizing title case and accents, spacing, "
            "indentation and ellipses; stanza joins at page breaks may be editorial. "
            "Publication does not establish the date or place of composition."
        )
        if slug in NOTES:
            context += " " + NOTES[slug]
        page_label = f"PDF p. {first}" if first == last else f"PDF pp. {first}–{last}"
        record = {
            "id": f"storni-1918-{slug}", "title": title,
            "author": "Alfonsina Storni", "authorId": "alfonsina-storni", "authorYears": "1892–1938",
            "country": "Argentina", "language": "Spanish", "lang": "es", "direction": "ltr",
            "year": 1918, "yearLabel": "Published 1918", "era": "Modernismo",
            "form": "Verse", "collection": "El dulce daño", "themes": [], "mood": "paper",
            "context": context,
            "sourceTitle": f"Storni · El dulce daño (1918), {page_label}",
            "source": f"{PDF_URL}#page={first}",
            "rights": (
                "Historical original published in 1918; public domain in the United States. "
                "Wikimedia Commons marks the linked scan public domain; images are not republished. "
                "Check local law before reuse."
            ),
            "text": text, "translations": [],
        }
        if slug in COMPARISONS:
            record["contextSource"], record["contextSourceTitle"] = COMPARISONS[slug]
        records.append(record)
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the pinned Circe PDF")
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

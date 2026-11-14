#!/usr/bin/env python3
"""Reproduce selected Haitian poems from the scan-reviewed Morpeau anthology."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/haiti-morpeau-1925-readings.txt"
OUTPUT = ROOT / "content/poems/haiti-morpeau-1925-reviewed.json"
PDF_SHA = "639f5ea48893d664e9a3e8d4d7a187d6f5526c6fb1b56d6660490a6cdb997e91"
READINGS_SHA = "41543480d3bd15824ad70d9886d4e2325272094bf4a55910f021520a29eec1bb"
PDF_URL = "https://manioc.univ-antilles.fr/omeka-s/files/original/3530/PAP11095.pdf"
COMPARISON = (
    "https://commons.wikimedia.org/w/index.php?title=File:Durand_-_Rires_et_pleurs,"
    "_po%C3%A9sies._Premi%C3%A8re_partie_-_Po%C3%A8mes,_%C3%A9l%C3%A9gies,"
    "_satires,_odelettes,_1896.djvu&page=57"
)
SELECTION = (
    # slug, title, poet, first and last PDF pages, displayed nonblank lines
    ("puisque-le-ciel-tenvoie", "Puisque le ciel t’envoie", "sampeur", 109, 109, 12),
    ("labandonnee", "L’Abandonnée", "sampeur", 109, 110, 30),
    ("au-temps", "Au Temps", "sampeur", 111, 111, 12),
    ("le-fils-du-noir", "Le Fils du Noir", "durand", 122, 123, 30),
    ("orfevrerie", "Orfèvrerie", "durand", 123, 124, 16),
    ("absinthe", "Absinthe", "durand", 124, 124, 14),
    ("les-papillons", "Les Papillons", "durand", 125, 125, 15),
)
NOTES = {
    "labandonnee": (
        "The anthology dates this poem 1876 without explaining the date. It prints ‘n’a-t-il pu se défendre’; "
        "the linked Montclair transcription has ‘n’a-t-il su se défendre’. The reason for the difference is unknown."
    ),
    "le-fils-du-noir": (
        "The two numbered sonnets form one work; the line count includes both headings. "
        "Morpeau prints ‘mon cœur est plein de sève encor’ and ‘nos bruns maïs’; "
        "the linked 1896 printing has ‘mon cœur est jeune encor’ and ‘nos blonds maïs’. "
        "Other readings differ too; the reason is not established."
    ),
    "orfevrerie": (
        "The anthology prints 2 March 1899 below the poem, without identifying the date's significance. "
        "The line count includes the print's split line ‘Le Maître souffre. / Ainsi, nous autres, milliardaires’."
    ),
    "absinthe": "The anthology prints 5 May 1899 below the poem, without identifying the date's significance.",
    "les-papillons": (
        "The anthology prints 2 October 1901 below the poem, without identifying the date's significance. "
        "The line count includes the print's split line ‘À jamais plus !... / Par les persiennes décloses’. "
        "Durand’s 1896 poem with the same title begins ‘Te souvient-il’ and is not this text."
    ),
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def make_records(directory):
    if digest((directory / "morpeau-1925.pdf").read_bytes()) != PDF_SHA:
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
    for (slug, title, poet, first, last, expected_lines), (_, text) in zip(SELECTION, readings, strict=True):
        lines = text.splitlines()
        if (any(line != line.strip() for line in lines) or "\n\n\n" in text
                or len([line for line in lines if line]) != expected_lines):
            raise ValueError(f"Incomplete or malformed poem: {slug}")
        name, author_id, years = (("Virginie Sampeur", "virginie-sampeur", "1839–1919")
                                  if poet == "sampeur" else ("Oswald Durand", "oswald-durand", "1840–1906"))
        context = (
            f"A poem by Haitian poet {name}, as printed in Louis Morpeau’s 1925 anthology. "
            "This reading follows the linked printing, preserving its wording and punctuation while normalizing "
            "spacing, indentation and apostrophes and supplying accents on initial capitals. "
            "The anthology date does not establish when or where the poem was composed."
        )
        if slug in NOTES:
            context += " " + NOTES[slug]
        page_label = f"PDF p. {first}" if first == last else f"PDF pp. {first}–{last}"
        record = {
            "id": f"haiti-morpeau-1925-{slug}", "title": title,
            "author": name, "authorId": author_id, "authorYears": years,
            "country": "Haiti", "language": "French", "lang": "fr", "direction": "ltr",
            "year": 1925, "yearLabel": "Anthologized 1925", "era": "19th century / early 20th century",
            "form": "Sonnet" if slug in {"absinthe", "les-papillons"} else "Verse",
            "collection": "Anthologie d’un siècle de poésie haïtienne", "themes": [], "mood": "paper",
            "context": context,
            "sourceTitle": f"Morpeau · Anthologie d’un siècle de poésie haïtienne (1925), {page_label}",
            "source": f"{PDF_URL}#page={first}",
            "rights": (
                "Historical French original printed in 1925; public domain in the United States. "
                "The linked scan is not republished and its image-reuse terms are not established here. "
                "Check local law and moral rights before reuse."
            ),
            "text": text, "translations": [],
        }
        if slug == "labandonnee":
            record["contextSource"] = "https://digitalcommons.montclair.edu/phareshatiens/author/sampeur/1/"
            record["contextSourceTitle"] = "Montclair State · L’Abandonnée (comparison)"
        elif slug == "le-fils-du-noir":
            record["contextSource"] = COMPARISON
            record["contextSourceTitle"] = "Durand · Rires et pleurs (1896), scan p. 57 (comparison)"
        elif slug == "les-papillons":
            record["contextSource"] = COMPARISON.replace("&page=57", "&page=37")
            record["contextSourceTitle"] = "Durand · Rires et pleurs (1896), same title, scan p. 37"
        records.append(record)
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the pinned Morpeau PDF")
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

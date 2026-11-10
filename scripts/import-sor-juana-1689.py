#!/usr/bin/env python3
"""Reproduce Sor Juana records from the scan-reviewed 1689 readings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/sor-juana-1689-readings.txt"
OUTPUT = ROOT / "content/poems/sor-juana-1689-reviewed.json"
READINGS_SHA256 = "e647ffb2a19987c5dbe056a0d0c1153d612c907bee22ce3a6bea7f980089074a"
EVIDENCE = {
    "sor-juana-inundacion-sevilla-1689.pdf": "1a8bc2f0e36f69b596e05fed48fdfd243ed1ef0c4e6f25b8502e316f3a677f89",
    "poesias-escogidas-1901.pdf": "b4be5c6ad8cb535e093a02d59592cc640c6111279801a61ee2d74c8fbfc0363a",
    "gutenberg-74087.txt": "64f49ae3ac6892b76baa33344f92890210bf1e13184d411436e322dada797de7",
}
# Pages are the 1689 book's printed pages, not PDF page numbers. The 1901
# and 1873 comparisons inform notes, not the transcribed 1689 text.
SELECTION = (
    ("hijo-esclava", 1, 1, "Sonnet", ("Sonnets",),
     "The printed dedication addresses the countess of Paredes; the prose signature after the sonnet is not verse."),
    ("engano-colorido", 3, 3, "Sonnet", ("Sonnets", "Time"),
     "The 1689 print reads ‘con falsos sylogismos’; the 1901 anthology, p. 94, prints ‘Son falsos silogismos’."),
    ("fabio-sylvio", 3, 4, "Sonnet", ("Sonnets", "Love"), ""),
    ("ingrato-amante", 4, 4, "Sonnet", ("Sonnets", "Love"), ""),
    ("feliciano-lysardo", 5, 5, "Sonnet", ("Sonnets", "Love"),
     "The 1689 ‘todos modos’ and final ‘aqueste’ / ‘aquel’ differ from ‘entrambos modos’ and ‘aquese’ / ‘aqueste’ in Gutenberg’s transcription of the 1873 anthology."),
    ("fabio-beldades", 5, 6, "Sonnet", ("Sonnets", "Love"),
     "The 1689 print reads ‘en viendo a muchos’; the 1901 anthology, p. 95, prints ‘á muchas’."),
    ("perseguirme-mundo", 6, 6, "Sonnet", ("Sonnets",),
     "The 1689 print repeats ‘entendimiento’ in lines 7–8; some later editions use ‘pensamiento’ there."),
    ("tan-grande-hado", 6, 7, "Sonnet", ("Sonnets",), ""),
    ("miro-celia-rosa", 7, 7, "Sonnet", ("Sonnets", "Nature", "Time"),
     "The 1689 print has ‘la pompa’; Gutenberg’s 1873 transcription reads ‘su pompa’."),
    ("famosa-lucrecia", 8, 8, "Sonnet", ("Sonnets",),
     "The 1689 print has ‘ensangrentado’ and ‘ayudaste’; Gutenberg’s 1873 transcription has ‘desgarrado’ and ‘valiste’."),
    ("tarquino-artificio", 8, 9, "Sonnet", ("Sonnets",), ""),
    ("esposa-pompeyo", 9, 9, "Sonnet", ("Sonnets",),
     "The 1689 ‘tenía / en las entrañas Julia’ differs from ‘escondia / en sus entrañas Julia’ in Gutenberg’s 1873 transcription."),
    ("passion-porcia", 9, 10, "Sonnet", ("Sonnets",),
     "The 1689 print reads ‘con tu vida’; Gutenberg’s 1873 transcription reads ‘con tu muerte’."),
    ("funesto-moral", 10, 10, "Sonnet", ("Sonnets", "Love"), ""),
    ("vesme-alcino", 11, 11, "Sonnet", ("Sonnets", "Love"),
     "The 1689 ‘passo’ and ‘Pues ves’ differ from ‘sufro’ and ‘Pues mira’ in Gutenberg’s 1873 transcription."),
    ("mandas-anarda", 11, 12, "Sonnet", ("Sonnets", "Love"), ""),
    ("ausente-zeloso", 12, 12, "Sonnet", ("Sonnets", "Love"), ""),
    ("hombres-necios", 85, 86, "Redondillas", (),
     "The 1689 print reads ‘obre bien’; Gutenberg’s 1873 transcription reads ‘obren bien’."),
    ("encarnacion-romance", 205, 205, "Romance", ("Faith",),
     "The printed heading identifies this independent romance as ‘A la encarnación’."),
    ("san-jose-romance", 209, 209, "Romance", ("Faith",),
     "The romance is headed ‘A lo mismo’, following a separately printed glosa to Saint Joseph."),
    ("san-pedro-romance", 209, 209, "Romance", ("Faith",),
     "The printed heading identifies this independent romance as ‘A San Pedro’."),
    ("pilatos-soneto", 210, 210, "Sonnet", ("Sonnets", "Faith"),
     "The printed heading relates Pilate’s sentence against Christ to the responsibility of judges."),
)
DISPLAY_TITLES = {
    "ingrato-amante": "Al que ingrato me deja, busco amante",
    "perseguirme-mundo": "¿En perseguirme, mundo, qué interesas?",
    "passion-porcia": "Qué pasión, Porcia, qué dolor tan ciego",
    "ausente-zeloso": "El ausente, el celoso, se provoca",
    "encarnacion-romance": "Que hoy bajó Dios a la tierra",
}
BIOGRAPHY = "https://filosofiamexicana.org/2025/04/17/sor-juana-ines-de-la-cruz-la-filosofa-a-330-anos-de-su-muerte/"
RIGHTS = (
    "The historical original and 1689 printing are public domain in the United States. "
    "Transcribed from the cited printing; check local law."
)


def digest(value):
    return hashlib.sha256(value).hexdigest()


def make_records(directory):
    for name, expected in EVIDENCE.items():
        if digest((directory / name).read_bytes()) != expected:
            raise ValueError(f"Reviewed evidence changed: {name}")
    raw = READINGS.read_bytes()
    if digest(raw) != READINGS_SHA256:
        raise ValueError("Reviewed readings changed")
    parts = re.split(r"^=== ([a-z0-9-]+) ===\n", raw.decode("utf8"), flags=re.MULTILINE)
    if parts.pop(0):
        raise ValueError("Unexpected text before first reading")
    readings = [(parts[index], parts[index + 1].strip()) for index in range(0, len(parts), 2)]
    if tuple(slug for slug, _ in readings) != tuple(item[0] for item in SELECTION):
        raise ValueError("Unexpected selection or order")
    output = []
    for item, (_, text) in zip(SELECTION, readings, strict=True):
        slug, first, last, form, themes, note = item
        stanzas = [len(stanza.splitlines()) for stanza in text.split("\n\n")]
        if form == "Sonnet" and stanzas != [4, 4, 3, 3]:
            raise ValueError(f"Unexpected sonnet boundaries: {slug}")
        if form == "Romance" and (any(length != 4 for length in stanzas) or len(stanzas) < 6):
            raise ValueError(f"Unexpected romance boundaries: {slug}")
        if form == "Redondillas" and stanzas != [4] * 17:
            raise ValueError(f"Unexpected redondilla boundaries: {slug}")
        if any(line != line.strip() or not line for stanza in text.split("\n\n") for line in stanza.splitlines()):
            raise ValueError(f"Unexpected verse whitespace: {slug}")
        title = text.splitlines()[0].rstrip(".,;:!?")
        pages = str(first) if first == last else f"{first}–{last}"
        context = (
            f"From Inundación castálida (Madrid, 1689), pp. {pages}. The complete verse and its "
            "printed boundaries were checked in the University of Seville copy; completeness here "
            "refers to this printing, not every witness. The first line supplies the title. Long s, "
            "u/v and i/j letterforms and abbreviations are normalized; capitalization, spacing, "
            "accents and punctuation are regularized, and stanza spacing is editorial. Some spellings "
            "are normalized, while others remain historical. Sor Juana was a Mexican writer and "
            "Catholic nun; her birth year is "
            "disputed between 1648 and 1651. Mexico is an association with the poet, not a claim "
            "about this poem’s composition place; its composition date is not established here. "
            + note
        )
        record = {
            "id": f"sor-juana-1689-{slug}",
            "title": title,
            "author": "Sor Juana Inés de la Cruz",
            "authorId": "sor-juana-ines-de-la-cruz",
            "authorYears": "1648 or 1651–1695",
            "country": "Mexico",
            "language": "Spanish",
            "lang": "es",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Printed 1689 · composition date not established",
            "era": "Baroque",
            "form": form,
            "collection": "Inundación castálida · 1689",
            "themes": list(themes),
            "mood": "paper",
            "context": context.strip(),
            "contextSource": BIOGRAPHY,
            "contextSourceTitle": "Centro de Estudios de Filosofía Mexicana · Sor Juana",
            "sourceTitle": f"University of Seville / Internet Archive · 1689, pp. {pages}",
            # The scan offsets differ between these reviewed printed ranges.
            "source": f"https://archive.org/details/A086A273/page/n{first + (19 if first <= 12 else 21)}/mode/1up",
            "rights": RIGHTS,
            "text": text,
            "translations": [],
        }
        if slug in DISPLAY_TITLES:
            record["displayTitle"] = DISPLAY_TITLES[slug]
            record["displayTitleLang"] = "es"
            record["context"] += " The modernized display title is a discovery aid, not a printed 1689 title."
        output.append(record)
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the reviewed evidence files")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(make_records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Records differ from the reviewed sources")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

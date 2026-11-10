#!/usr/bin/env python3
"""Reproduce the reviewed Dante selection from Gutenberg's 1903 text."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "content/poems/dante-vita-nuova-1903.json"
EVIDENCE = {
    "gutenberg-71218.txt": "dba06061d6cd86a196b3de504e8600b6a1536ef1d90b5d413e8a4aa5addfca6c",
    "la-vita-nuova-1903.pdf": "5dc136a94dc25ba37e2c3ff5d86776a358aa77e1db60c9a2cf5eae0b49258522",
}
READINGS_SHA256 = "fc12f02b910a786842771dc28c48cbb3afb8754d0eb7070f4dde7c8abf4ccaa0"
# Index position, printed page, PDF start/end, stanza lengths, first and last
# verses. Position 20 is excluded: its canzone is interrupted, not complete.
# PDF leaf offsets vary because of plates; they must not be inferred from page.
SELECTION = (
    (1, 39, 49, 49, (4, 4, 3, 3), "A ciascun’alma presa e gentil core,", "Appresso gir lo ne vedea piangendo."),
    (2, 45, 55, 55, (6, 6, 4, 4), "O voi, che per la via d’Amor passate,", "E dentro dallo cor mi struggo e ploro."),
    (3, 48, 58, 58, (4, 4, 3, 3), "Piangete, amanti, poi che piange Amore,", "Che donna fu di sì gaia sembianza."),
    (4, 50, 60, 60, (6, 6, 4, 4), "Morte villana, di pietà nimica,", "Non speri mai d’aver sua compagnia."),
    (5, 54, 66, 66, (4, 4, 3, 3), "Cavalcando l’altr’ieri per un cammino,", "Ch’egli disparve, e non m’accorsi come."),
    (6, 61, 77, 78, (4, 10, 10, 10, 10), "Ballata, io vo’ che tu ritruovi Amore,", "Muovi in quel punto, che tu n’aggi onore."),
    (7, 66, 82, 82, (4, 4, 3, 3), "Tutti li miei pensier parlan d’amore:", "Madonna la Pietà, che mi difenda."),
    (8, 71, 87, 87, (4, 4, 3, 3), "Con l’altre donne mia vista gabbate,", "Gli guai degli scacciati tormentosi."),
    (9, 74, 88, 88, (4, 4, 3, 3), "Ciò che m’incontra, nella mente more", "Degli occhi, c’hanno di lor morte voglia."),
    (10, 77, 91, 91, (4, 4, 3, 3), "Spesse fïate vegnonmi alla mente", "Che fa de’ polsi l’anima partire."),
    (11, 83, 97, 99, (14, 14, 14, 14, 14), "Donne, ch’avete intelletto d’amore,", "Raccomandami a lui come tu dêi."),
    (12, 89, 103, 103, (4, 4, 3, 3), "Amore e ’l cor gentil sono una cosa,", "E simil face in donna uomo valente."),
    (13, 91, 105, 105, (4, 4, 3, 3), "Negli occhi porta la mia donna Amore,", "Sì è novo miracolo gentile."),
    (14, 96, 110, 110, (4, 4, 3, 3), "Voi, che portate la sembianza umìle,", "Che ’l cor mi trema di vederne tanto."),
    (15, 98, 112, 112, (4, 4, 3, 3), "Se’ tu colui c’hai trattato sovente", "Sarebbe innanzi a lei piangendo morta."),
    (16, 105, 125, 132, (14, 14, 14, 14, 14, 14), "Donna pietosa e di novella etate,", "Voi mi chiamaste allor, vostra mercede."),
    (17, 112, 136, 136, (4, 4, 3, 3), "Io mi sentii svegliar dentro dal core", "E quella ha nome Amor, sì mi somiglia."),
    (18, 119, 147, 147, (4, 4, 3, 3), "Tanto gentile e tanto onesta pare", "Che va dicendo all’anima: sospira."),
    (19, 121, 149, 149, (4, 4, 3, 3), "Vede perfettamente ogni salute", "Che non sospiri in dolcezza d’amore."),
    (21, 131, 165, 168, (14, 14, 14, 14, 14, 6), "Gli occhi dolenti per pietà del core", "Vattene sconsolata a star con elle."),
    (22, 136, 170, 170, (4, 4, 3, 3), "Venite a intender li sospiri miei,", "Abbandonata dalla sua salute."),
    (23, 139, 173, 173, (13, 13), "Quantunque volte, lasso! mi rimembra", "Face maravigliar; tanto è gentile!"),
    (24, 142, 178, 178, (4, 4, 3, 3), "Era venuta nella mente mia", "Oggi fa l’anno che nel ciel salisti."),
    (25, 144, 180, 180, (4, 4, 3, 3), "Videro gli occhi miei quanta pietate", "Lo qual mi face andar così piangendo."),
    (26, 146, 182, 182, (4, 4, 3, 3), "Color d’amore, e di pietà sembianti,", "Ma lagrimar dinanzi a voi non sanno."),
    (27, 149, 189, 189, (4, 4, 3, 3), "L’amaro lagrimar che voi faceste,", "Così dice il mio core, e poi sospira."),
    (28, 153, 193, 193, (4, 4, 3, 3), "Gentil pensiero, che parla di vui,", "Che si turbava de’ nostri martìri."),
    (29, 156, 196, 196, (4, 4, 3, 3), "Lasso! per forza de’ molti sospiri,", "E della morte sua molte parole."),
    (30, 160, 200, 200, (4, 4, 3, 3), "Deh, peregrini, che pensosi andate", "Hanno virtù di far piangere altrui."),
    (31, 163, 207, 207, (4, 4, 3, 3), "Oltre la spera, che più larga gira,", "Sì ch’io lo ’ntendo ben, donne mie care."),
)
END_PAGES = {6: 62, 11: 85, 16: 108, 21: 134}
DISPLAY_TITLES = {
    6: "Ballata, i’ vo’ che tu ritrovi Amore",
    13: "Ne li occhi porta la mia donna Amore",
    21: "Li occhi dolenti per pietà del core",
    24: "Era venuta ne la mente mia",
}
GUTENBERG = "https://www.gutenberg.org/files/71218/71218-h/71218-h.htm"
SCAN = "https://archive.org/download/lavitanuova04aliggoog/lavitanuova04aliggoog.pdf"
RIGHTS = (
    "Dante's original and the 1903 printing are public domain in the United States; "
    "check local law. Project Gutenberg credits Barbara Magni and the Online "
    "Distributed Proofreading Team for its transcription."
)


def digest(value):
    return hashlib.sha256(value).hexdigest()


def extract(book):
    texts = []
    if [entry[0] for entry in SELECTION] != [i for i in range(1, 32) if i != 20]:
        raise ValueError("Unexpected index selection")
    for number, _, _, _, sizes, first, last in SELECTION:
        start = "    " + first
        starts = list(re.finditer(r"(?m)^" + re.escape(start) + r"$", book))
        if len(starts) != (2 if number == 24 else 1):
            raise ValueError(f"Unexpected opening count: {number}")
        if number == 24:
            marker = book.rfind("    SECONDO COMINCIAMENTO.\n", 0, starts[1].start())
            if marker < starts[0].start():
                raise ValueError("Second opening not identified")
        begin = starts[-1].start()
        endings = list(re.finditer(r"(?m)^\s*" + re.escape(last) + r"$", book[begin:]))
        if len(endings) != 1:
            raise ValueError(f"Unexpected closing count: {number}")
        raw = book[begin:begin + endings[0].end()]
        lines = []
        for row in raw.splitlines():
            if not row.strip():
                continue
            if number == 16 and row.strip() == "[Illustrazione: Il sogno di Dante]":
                continue
            if not row.startswith("    ") or "[" in row or "]" in row:
                raise ValueError(f"Unexpected verse markup: {number}: {row}")
            lines.append(row.strip())
        if len(lines) != sum(sizes) or lines[0] != first or lines[-1] != last:
            raise ValueError(f"Unexpected verse boundary: {number}")
        stanzas = []
        offset = 0
        for size in sizes:
            stanzas.append("\n".join(lines[offset:offset + size]))
            offset += size
        texts.append("\n\n".join(stanzas))
    if digest("\n===\n".join(texts).encode()) != READINGS_SHA256:
        raise ValueError("Extracted readings changed")
    return texts


def make_records(directory):
    for name, expected in EVIDENCE.items():
        if digest((directory / name).read_bytes()) != expected:
            raise ValueError(f"Reviewed evidence changed: {name}")
    book = (directory / "gutenberg-71218.txt").read_text(encoding="utf8")
    texts = extract(book.replace("\r\n", "\n"))
    records = []
    for entry, text in zip(SELECTION, texts, strict=True):
        number, page, leaf, _, _, first, _ = entry
        end_page = END_PAGES.get(number, page)
        label = str(page) if page == end_page else f"{page}–{end_page}"
        context = (
            f"From La vita nuova in Gutenberg's 1903 Roux e Viarengo printing, pp. {label}. "
            "The original verses were compared in order with OCR of a separate scanned 1903 "
            "second edition; selected page turns, boundaries and OCR differences were checked "
            "visually. Gutenberg credits a Cologne source copy and says it silently corrected "
            "minor typographic errors: this is not a diplomatic transcription. Indentation "
            "is omitted. Italy is associated with the poet, not a claim about this poem's "
            "exact composition place or date."
        )
        if number in (2, 4):
            context += " This is a complete 20-line sonetto doppio, not a truncated 14-line sonnet."
        if number == 16:
            context += " The 84-line canzone continues across pages and is one work."
        if number == 21:
            context += " This canzone contains five 14-line stanzas and a six-line congedo."
        if number == 23:
            context += (
                " The prose presents two stanzas for two voices; both are given together as "
                "one canzone, also identified as such by Treccani."
            )
        if number == 24:
            context += (
                " The printing presents two alternative first quatrains. This is the second "
                "opening followed by the shared ten lines; the first opening is available "
                "in the linked scan and is not counted as another work."
            )
        form = "Ballata" if number == 6 else "Canzone" if number in (11, 16, 21, 23) else "Sonnet"
        record = {
            "id": f"dante-vita-nuova-{number:03d}",
            "title": first.rstrip(" ,;:.!?"),
            "author": "Dante Alighieri",
            "authorId": "dante-alighieri",
            "authorYears": "1265–1321",
            "country": "Italy",
            "language": "Italian",
            "lang": "it",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Late 13th century · exact composition date not established",
            "era": "Medieval",
            "form": form,
            "collection": "La vita nuova · 1903 printing",
            "themes": [],
            "mood": "paper",
            "context": context,
            "contextSource": f"{SCAN}#page={leaf}",
            "contextSourceTitle": f"Internet Archive · 1903 second edition, pp. {label}",
            "sourceTitle": f"Project Gutenberg · La vita nuova, pp. {label}",
            "source": f"{GUTENBERG}#Page_{page}",
            "rights": RIGHTS,
            "text": text,
            "translations": [],
        }
        if number in DISPLAY_TITLES:
            record["displayTitle"] = DISPLAY_TITLES[number]
            record["displayTitleLang"] = "it"
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

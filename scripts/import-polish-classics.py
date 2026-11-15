#!/usr/bin/env python3
"""Reproduce selected Polish classics from credited historical-page revisions."""

import argparse
import hashlib
import html
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = ROOT / "scripts/sources/polish-classics-revisions.json"
OUTPUT = ROOT / "content/poems/polish-classics.json"
SNAPSHOT_SHA256 = "a815d1f861c2a6f701ef3549f84ac9af6c9169841f88428e2761a22c1aeae793"
POCALUNKI = "Maria Pawlikowska-Jasnorzewska - Pocałunki.djvu"
WACHLARZ = "Maria Pawlikowska-Jasnorzewska - Wachlarz.djvu"
EVIDENCE = {
    "pawlikowska-pocalunki-1926.djvu": "ea4062ada9905c3a98a9a815a95e3fbb362e3c471373d2e3afb01da67ff7f92f",
    "mickiewicz-sonety-1826-028.jpg": "cde0f062c2ebc17260975790a564aa62e8581a6680bc5f339105899ddc258dce",
    "mickiewicz-poezye-1899-249.jpg": "f9ee3913f3366652808a796d20eca7f05a5b33eac355e35461b590ad7f38a61d",
    "mickiewicz-poezye-1899-251.jpg": "0b26c9b65e18aa5289df072ed71437414d15ece1c2652dc7c0cba0dad82f8f4c",
    "mickiewicz-poezye-1899-268.jpg": "ab70b55356e660bb4edc9d7a80a71e91bd7f082e4347b65a17cdc97920f60c77",
    "mickiewicz-poezye-1899-269.jpg": "e1befe670834ca4ae6c8d55d63ed55cdb8b8c9b7bff22a746a460cb5500d5dbb",
    "konopnicka-piosenki-1903-005.jpg": "2ad41fdd911b21a2df48a53b27e8bdbe714c66cabd8e1e3eac492c73c2f444d1",
    "konopnicka-piosenki-1903-095.jpg": "722365fb9c83ff0033b6f2f20a7d76ebd52685235aaadaa1cbaecb174532c276",
    "konopnicka-piosenki-1903-096.jpg": "d7ef254aec1cc67e2d9cca9e43f651810bab836b6cdefd1f0799662b7bc45a97",
}

# Each selected item has its own heading in the 1926 book. Multi-part works,
# unmatched readings, the ambiguous "Wiersz ukradziony", and scan page 43
# are intentionally excluded. Labels are page-section IDs, not poem numbers.
SELECTION = (
    (7, "wybrzeże"), (8, "morze"), (8, "portret"), (8, "gorzka"),
    (9, "westchnienia"), (9, "mewa"), (10, "talerz"), (10, "obrazek"),
    (12, "umarły"), (12, "zmierzch"), (14, "bezpieczeństwo"),
    (17, "narcyz"), (17, "miłość"), (18, "cnoty"), (18, "upał"),
    (19, "telegram"), (19, "ptak"), (19, "wielki"),
    (21, "la"), (21, "zraniona"), (21, "ofelja"),
    (22, "krowy"), (22, "fotografja"), (22, "tancerka"),
    (23, "aeroplan"), (23, "huragan"), (26, "tapicer"), (26, "cień"),
    (27, "grad"), (27, "listy"), (31, "krokusy"), (31, "gwiazdy"),
    (31, "wiosna"), (32, "łabędź"), (32, "słowiki"),
    (33, "ogród"), (33, "wydarty"), (33, "list"),
    (34, "ślepa"), (34, "przebyta"), (34, "burza"),
    (35, "nike"), (35, "atlas"), (39, "jesień"), (39, "kurze"),
    (39, "dni"), (40, "październik"), (40, "liście"), (40, "żebrak"),
    (41, "dziadek"), (41, "babka"), (41, "kobieta"),
    (42, "żórawie"), (42, "pod"), (42, "kwiatki"),
)

ROMANTIC = (
    ("stepy-akermanskie", "Stepy akermańskie", "Adam Mickiewicz", "adam-mickiewicz", "1798–1855",
     1826, "Sonety · 1826", ["PL Adam Mickiewicz-Sonety Adama Mickiewicza 028.jpeg"], None),
    ("oda-do-mlodosci", "Oda do młodości", "Adam Mickiewicz", "adam-mickiewicz", "1798–1855",
     1899, "Poezye Adama Mickiewicza · tom I, 1899",
     [f"PL Poezye Adama Mickiewicza. T. 1. (1899) {n:03}.jpg" for n in (249, 250, 251)], "młodości"),
    ("smierc-pulkownika", "Śmierć pułkownika", "Adam Mickiewicz", "adam-mickiewicz", "1798–1855",
     1899, "Poezye Adama Mickiewicza · tom I, 1899",
     [f"PL Poezye Adama Mickiewicza. T. 1. (1899) {n:03}.jpg" for n in (268, 269)], "pułkownik"),
    ("a-jak-poszedl-krol", "A jak poszedł król na wojnę", "Maria Konopnicka", "maria-konopnicka", "1842–1910",
     1903, "Poezye · Pieśni i piosenki, 1903",
     [f"PL Maria Konopnicka-Poezye w nowym układzie III Pieśni i piosenki {n:03}.jpeg" for n in (95, 96)], None),
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def fold(text):
    """Ignore typography, but not Polish diacritics, when comparing editions."""
    return "".join(c for c in unicodedata.normalize("NFC", text.casefold()) if c.isalnum())


def slug(text):
    text = text.casefold().replace("ł", "l")
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def revision_url(page):
    title = quote(page["title"].replace(" ", "_"), safe="")
    return f"https://pl.wikisource.org/w/index.php?title={title}&oldid={page['revision']}"


def commons_file(filename, page=None):
    url = "https://commons.wikimedia.org/wiki/File:" + quote(filename.replace(" ", "_"), safe="")
    return url + (f"?page={page}" if page is not None else "")


def pages_from_api(path):
    pages = json.loads(path.read_text(encoding="utf8"))["query"]["pages"]
    result = []
    for page in pages:
        revisions = page.get("revisions", [])
        if len(revisions) != 1:
            raise ValueError(f"Missing page revision: {page['title']}")
        rev = revisions[0]
        result.append({"title": page["title"], "revision": rev["revid"], "content": rev["slots"]["main"]["content"]})
    return result


def number(page):
    return int(page["title"].rsplit("/", 1)[1])


def sections(page):
    if '<pagequality level="4"' not in page["content"]:
        raise ValueError(f"Page is not marked validated: {page['title']}")
    matches = re.findall(r'<section begin="([^"]+)"\s*/>(.*?)<section end="\1"\s*/>',
                         page["content"], flags=re.DOTALL | re.IGNORECASE)
    if len(matches) != len(dict(matches)):
        raise ValueError(f"Duplicate section IDs: {page['title']}")
    return dict(matches)


def four_line_reading(body, heading_required):
    blocks = re.findall(r"<poem>(.*?)</poem>", body, flags=re.DOTALL | re.IGNORECASE)
    if len(blocks) != 1:
        raise ValueError("Expected one complete poem block")
    text = blocks[0]
    heading = re.search(r"\{\{f\|''(.+?)''\|[^\n]*\}\}", text, flags=re.IGNORECASE)
    if heading_required and not heading:
        raise ValueError("Missing separately printed heading")
    text = re.sub(r"\{\{f\|''.+?''\|[^\n]*\}\}", "", text, flags=re.IGNORECASE)
    text = html.unescape(re.sub(r"<[^>]*>", "", text))
    if re.search(r"[{}<>]|\[\[", text):
        raise ValueError("Unrecognized page markup")
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if len(lines) != 4:
        raise ValueError("Expected four complete lines")
    title = heading.group(1).capitalize() if heading else ""
    title = {"Talerz z kopenhagi": "Talerz z Kopenhagi", "Wielki wóz": "Wielki Wóz",
             "Kwiatki z waterloo": "Kwiatki z Waterloo"}.get(title, title)
    return title, "\n".join(lines)


def comparison_index(pages):
    result = {}
    for page in pages:
        for name, body in sections(page).items():
            try:
                _, text = four_line_reading(body, False)
            except ValueError:
                continue
            key = fold(text)
            if key in result:
                raise ValueError("Ambiguous comparison reading")
            result[key] = (page, name)
    return result


def prepare(directory):
    primary = pages_from_api(directory / "polish-pocalunki-research-revisions.json")
    comparison = pages_from_api(directory / "polish-wachlarz-research-revisions.json")
    romantic = pages_from_api(directory / "polish-romantic-research-revisions.json")
    primary = [page for page in primary if number(page) in {n for n, _ in SELECTION}]
    index = comparison_index([p for p in comparison if '<pagequality level="4"' in p["content"]])
    used = set()
    for page_number, label in SELECTION:
        page = next(p for p in primary if number(p) == page_number)
        _, text = four_line_reading(sections(page)[label], True)
        used.add(index[fold(text)][0]["title"])
    comparison = [page for page in comparison if page["title"] in used]
    names = {"Strona:" + name for item in ROMANTIC for name in item[7]}
    romantic = [page for page in romantic if page["title"] in names]
    if len(romantic) != len(names) or len(primary) != len({n for n, _ in SELECTION}):
        raise ValueError("Missing source pages")
    snapshot = {"primary": sorted(primary, key=number), "comparison": sorted(comparison, key=number),
                "romantic": sorted(romantic, key=lambda p: p["title"])}
    SNAPSHOT.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(f"Prepared {SNAPSHOT.relative_to(ROOT)}; SHA-256 {digest(SNAPSHOT.read_bytes())}")


def clean_historical_page(page, label):
    content = page["content"]
    if '<pagequality level="4"' not in content:
        raise ValueError(f"Page is not marked validated: {page['title']}")
    if label:
        content = sections(page)[label]
    blocks = re.findall(r"<poem>(.*?)</poem>", content, flags=re.DOTALL | re.IGNORECASE)
    if len(blocks) != 1:
        raise ValueError(f"Expected one poem block: {page['title']}")
    text = blocks[0]
    text = re.sub(r"<center>.*?</center>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<ref\b[^>]*>.*?</ref>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"\{\{tab(?:\|[^}]*)?\}\}", "", text, flags=re.IGNORECASE)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = html.unescape(text).replace("''", "").replace("\xa0", " ")
    if re.search(r"[{}<>]|\[\[", text):
        raise ValueError(f"Unrecognized historical-page markup: {page['title']}")
    text = "\n".join(line.strip() for line in text.splitlines()).strip()
    return re.sub(r"\n{3,}", "\n\n", text)


def records():
    data = SNAPSHOT.read_bytes()
    if digest(data) != SNAPSHOT_SHA256:
        raise ValueError("Pinned Polish page snapshot changed")
    snapshot = json.loads(data)
    primary = {number(page): page for page in snapshot["primary"]}
    comparison = comparison_index(snapshot["comparison"])
    output = []
    modern = {"Fotografja": "Fotografia", "Ofelja": "Ofelia", "Żórawie": "Żurawie"}
    for n, label in SELECTION:
        page = primary[n]
        title, text = four_line_reading(sections(page)[label], True)
        other, other_label = comparison[fold(text)]
        other_heading = re.search(r"\{\{(?:c|f)\|([^|{}]+)", sections(other)[other_label], flags=re.IGNORECASE)
        if not other_heading or fold(other_heading.group(1).strip("' ")) not in {fold(title), fold(modern.get(title, title))}:
            raise ValueError(f"Comparison title differs for {title}")
        original_ref, other_ref = revision_url(page), revision_url(other)
        result = {
            "id": f"pawlikowska-1926-{slug(title)}", "title": title,
            "author": "Maria Pawlikowska-Jasnorzewska", "authorId": "maria-pawlikowska-jasnorzewska",
            "authorYears": "1891–1945", "country": "Poland", "language": "Polish", "lang": "pl", "direction": "ltr",
            "year": 1926, "yearLabel": "Printed in 1926", "era": "20th century", "form": "Lyric",
            "collection": "Pocałunki · 1926", "themes": [], "mood": "paper",
            "context": (f"This separately titled four-line poem follows page {n} of Pocałunki, printed under the name Maria Pawlikowska. "
                        "The reading follows the credited Polish Wikisource page transcription; spacing and typography are normalized. "
                        "The 1927 Wachlarz reprints Pocałunki and its page transcription has the same words after normalization; "
                        "the printings are not counted as separate works. Publication does not establish composition date or place, "
                        "and inclusion in the collection does not establish individual popularity. Poland is an associated place."),
            "sourceTitle": f"Pocałunki · 1926, scan page {n}", "source": commons_file(POCALUNKI, n),
            "contextSourceTitle": f"Polish Wikisource contributors · page {n}, revision {page['revision']}",
            "contextSource": original_ref,
            "rights": ("Polish original printed in 1926; public domain in the United States. "
                       "Page transcription adapted from Polish Wikisource contributors under CC BY-SA 4.0 "
                       "(https://creativecommons.org/licenses/by-sa/4.0/); revision and comparison histories: "
                       f"{original_ref}; {other_ref}. Copyright and moral rights vary by jurisdiction; check local law. "
                       "Scans are linked, not republished."),
            "text": text, "translations": [],
        }
        if title in modern:
            result.update(displayTitle=modern[title], displayTitleLang="pl")
            result["context"] += " The modern-spelling display title is editorial; the verse retains the historical spelling."
        output.append(result)
    historic = {page["title"]: page for page in snapshot["romantic"]}
    for ident, title, author, author_id, years, year, collection, names, label in ROMANTIC:
        pages = [historic["Strona:" + name] for name in names]
        text = "\n\n".join(clean_historical_page(page, label) for page in pages)
        note = ""
        if ident == "stepy-akermanskie":
            note = " The print places the individually titled sonnet in the Crimean sequence; an editorial footnote is not included in the verse."
            if len([line for line in text.splitlines() if line]) != 14:
                raise ValueError("Unexpected sonnet length")
        if ident == "smierc-pulkownika":
            if text.count("przed chatką leśnika") != 1:
                raise ValueError("Unexpected opening in credited transcription")
            text = text.replace("przed chatką leśnika", "przed chatą leśnika")
            note = " The 1899 scan reads ‘przed chatą leśnika’; the linked transcription has ‘przed chatką leśnika’. The scan reading is used here."
        if ident == "a-jak-poszedl-krol":
            if len([line for line in text.splitlines() if line]) != 24:
                raise ValueError("Unexpected song length")
            note = (" The 1903 printing has six stanzas and reads ‘liliowe’; "
                    "the 1915 critical printing also has six stanzas but reads ‘liljowe’.")
        refs = "; ".join(revision_url(page) for page in pages)
        output.append({
            "id": f"{'mickiewicz' if author_id == 'adam-mickiewicz' else 'konopnicka'}-{year}-{ident}",
            "title": title, "author": author, "authorId": author_id,
            "authorYears": years, "country": "Poland", "language": "Polish", "lang": "pl", "direction": "ltr",
            "year": year, "yearLabel": f"Printed in {year}", "era": "19th century",
            "form": "Sonnet" if ident == "stepy-akermanskie" else "Verse", "collection": collection,
            "themes": [], "mood": "paper",
            "context": (f"This complete reading follows {collection}. The credited Polish Wikisource page transcriptions "
                        "are adapted with spacing, indentation and typography normalized. The printing date does not establish "
                        "the date or place of composition; Poland is an associated place." + note),
            "sourceTitle": f"{collection} · first scan page", "source": commons_file(names[0]),
            "contextSourceTitle": f"Polish Wikisource contributors · first page revision {pages[0]['revision']}",
            "contextSource": revision_url(pages[0]),
            "rights": (f"Polish original printed in {year}; public domain in the United States. "
                       "Page transcriptions adapted from Polish Wikisource contributors under CC BY-SA 4.0 "
                       f"(https://creativecommons.org/licenses/by-sa/4.0/); revision histories: {refs}. "
                       "Copyright and moral rights vary by jurisdiction; check local law. Scans are linked, not republished."),
            "text": text, "translations": [],
        })
    if len({p["id"] for p in output}) != len(output) or len({fold(p["text"]) for p in output}) != len(output):
        raise ValueError("Duplicate title ID or reading")
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepare-from", type=Path, help="prepare pinned source snapshot from research API files")
    parser.add_argument("--evidence-dir", type=Path, help="also verify the historical scan witnesses")
    parser.add_argument("--check", action="store_true", help="verify output without writing")
    args = parser.parse_args()
    if args.prepare_from:
        prepare(args.prepare_from)
        return
    if args.evidence_dir:
        for filename, expected in EVIDENCE.items():
            if digest((args.evidence_dir / filename).read_bytes()) != expected:
                raise ValueError(f"Evidence hash mismatch: {filename}")
    result = json.dumps(records(), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != result:
            raise ValueError("Committed records differ from the pinned source revisions")
        print(f"Verified {len(SELECTION) + len(ROMANTIC)} Polish readings.")
    else:
        OUTPUT.write_text(result, encoding="utf8")
        print(f"Wrote {len(SELECTION) + len(ROMANTIC)} Polish readings.")


if __name__ == "__main__":
    main()

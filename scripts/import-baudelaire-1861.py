#!/usr/bin/env -S uv run --no-project --with beautifulsoup4 python
"""Reproduce the reviewed 1861 Fleurs du mal selection from saved sources.

Use --fetch with a new directory to retrieve the pinned witnesses, then --check
to compare the result with the committed records. Article revisions do not
freeze their transcluded pages: both the extracted reading and the individual
scan-page revisions are checked separately.
"""

import argparse
import hashlib
import json
import re
import runpy
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup, Tag

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts/sources/baudelaire-fleurs-1861.json"
OUTPUT = ROOT / "content/poems/baudelaire-fleurs-1861.json"
HUGO = runpy.run_path(str(ROOT / "scripts/import-hugo.py"))
NUMBERS = [
    4, 11, 22, 24, 27, 34, 35, 36, 39, 40, 43, 46, 47, 48, 50, 53,
    55, 59, 63, 64, 65, 66, 67, 68, 70, 71, 72, 77, 78, 79, 80, 81,
    82, 85, 86, 92, 93, 95, 98, 104, 107, 108, 109, 112, 118, 122, 124, 125,
]
GUTENBERG = "https://www.gutenberg.org/cache/epub/61565/pg61565-images.html"
SCAN = (
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/"
    "Baudelaire_-_Les_Fleurs_du_mal_1861.djvu/"
    "page{page}-1280px-Baudelaire_-_Les_Fleurs_du_mal_1861.djvu.jpg"
)
RIGHTS = (
    "Historical original and 1861 edition are public domain in the United States. "
    "Wikisource transcription by contributors under CC BY-SA 4.0: "
    "https://creativecommons.org/licenses/by-sa/4.0/; consult linked article and "
    "scan-page histories for contributors. Check local law before reuse."
)


def digest(value):
    if isinstance(value, str):
        value = value.encode("utf8")
    return hashlib.sha256(value).hexdigest()


def comparable(value):
    value = value.casefold().replace("œ", "oe").replace("æ", "ae")
    value = unicodedata.normalize("NFKD", value)
    return "".join(char for char in value if char.isalnum() and not unicodedata.combining(char))


def comparison_paragraphs(data):
    """Keep verse lines, not Gutenberg's separately printed variant paragraphs."""
    soup = BeautifulSoup(data, "html.parser")
    paragraphs = []
    for paragraph in soup.find_all("p"):
        spans = paragraph.select(':scope > span[style*="margin-left"]')
        if not spans:
            continue
        for preceding in paragraph.previous_siblings:
            if not isinstance(preceding, Tag):
                continue
            if re.fullmatch(r"h[1-6]", preceding.name):
                break
            if preceding.name == "p" and re.search(
                r"\bVARIANTES?\b", preceding.get_text(" ", strip=True)
            ):
                break
        else:
            continue
        if preceding.name == "p":
            continue
        lines = []
        for span in spans:
            # Editorial footnote links are not verse; preserve ordinary inline text.
            for note in span.select("a.fnanchor, sup"):
                note.decompose()
            line = re.sub(r"\s+", " ", span.get_text(" ", strip=True)).strip()
            if line:
                lines.append(line)
        if lines:
            paragraphs.append(lines)
    return paragraphs


def matches_comparison(lines, paragraphs):
    """Compare every line while ignoring case, accents, punctuation and spaces."""
    wanted = [comparable(line) for line in lines]
    return any([comparable(line) for line in paragraph] == wanted for paragraph in paragraphs)


def source_pages(directory, manifest):
    saved = json.loads((directory / "page-content-index.json").read_text(encoding="utf8"))
    if set(saved) != set(manifest["pages"]):
        raise ValueError("Scan-page revision selection changed")
    for title, expected in manifest["pages"].items():
        page = saved[title]
        if page["pageid"] != expected["pageid"] or page["revid"] != expected["revid"]:
            raise ValueError(f"Scan-page revision changed: {title}")
        if digest(page["content"]) != expected["sha256"]:
            raise ValueError(f"Scan-page transcription changed: {title}")
        if not re.search(r'<pagequality\s+level="4"', page["content"]):
            raise ValueError(f"Scan page was not validated: {title}")
    return saved


def records(directory):
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    items = manifest["poems"]
    if [item["number"] for item in items] != NUMBERS:
        raise ValueError("Unexpected reviewed selection")
    comparison = (directory / "gutenberg-61565.html").read_bytes()
    if digest(comparison) != manifest["gutenbergSha256"]:
        raise ValueError("Gutenberg comparison changed")
    paragraphs = comparison_paragraphs(comparison)
    for name, sha256 in manifest["scanSha256"].items():
        if digest((directory / name).read_bytes()) != sha256:
            raise ValueError(f"Reviewed scan changed: {name}")
    pages = source_pages(directory, manifest)
    output = []
    for item in items:
        number = item["number"]
        soup = BeautifulSoup((directory / f"{number:03}.html").read_bytes(), "html.parser")
        permalink = soup.select_one("#t-permalink a")
        quality = soup.select_one("table.pr_quality")
        year = soup.select_one(".ws-year")
        if not permalink or "https://fr.wikisource.org" + permalink.get("href", "") != item["source"]:
            raise ValueError(f"Article revision changed: {number}")
        if (
            not year or year.get_text(strip=True) != "1861" or not quality
            or quality.get("title") != item["quality"]
            or not re.fullmatch(
                r"[1-9]\d* pages? validées?, 0 pages? corrigées? et 0 pages? non corrigées?",
                quality.get("title", ""),
            )
        ):
            raise ValueError(f"Edition or proofreading status changed: {number}")
        page_titles = [page.get("title") for page in soup.select(".prp-pages-output .pagenum")]
        if page_titles != item["pages"]:
            raise ValueError(f"Transcluded scan pages changed: {number}")
        text = HUGO["verse_text"](soup)
        lines = [line for line in text.splitlines() if line]
        if digest(text) != item["sha256"] or len(lines) != item["lines"]:
            raise ValueError(f"Transcluded reading changed: {number}")
        if item["form"] not in {"Sonnet", "Verse"}:
            raise ValueError(f"Unexpected form: {number}")
        if item["form"] == "Sonnet" and [len(stanza.splitlines()) for stanza in text.split("\n\n")] != [4, 4, 3, 3]:
            raise ValueError(f"Reviewed sonnet structure changed: {number}")
        # Also verify every line, in order, against the captured page revisions.
        # Markup may intervene between lines, so this is not a diplomatic collation.
        witness = comparable(" ".join(pages[title]["content"] for title in page_titles))
        offset = 0
        for line in lines:
            normalized = comparable(line)
            position = witness.find(normalized, offset)
            if not normalized or position < 0:
                raise ValueError(f"Line absent from pinned scan-page revisions: {number}")
            offset = position + len(normalized)
        if not matches_comparison(lines, paragraphs):
            raise ValueError(f"1924 comparison no longer matches: {number}")
        note = (
            " The 1861 edition numbers this poem without a title; the opening line is used here."
            if item["untitled"] else ""
        )
        if number in {53, 86, 95}:
            note += (
                " Stanza spacing follows the 1861 transcription; the 1924 comparison "
                "divides some passages differently, and page transitions can be ambiguous."
            )
        output.append({
            "id": f"baudelaire-fleurs-1861-{number:03}",
            "title": item["title"],
            "author": "Charles Baudelaire",
            "authorId": "charles-baudelaire",
            "authorYears": "1821–1867",
            "country": "France",
            "language": "French",
            "lang": "fr",
            "direction": "ltr",
            "year": None,
            "yearLabel": "Printed 1861 · composition date not established",
            "era": "19th century",
            "form": item["form"],
            "collection": "Les Fleurs du mal · second edition (1861)",
            "themes": [],
            "mood": "paper",
            "context": (
                f"Poem {number} of the 1861 second edition of Les Fleurs du mal. "
                "The verse follows Wikisource's validated scan-backed transcription; "
                "all lines were compared with a separately printed 1924 transcription, "
                "ignoring case, accents, punctuation and spacing. This is not a diplomatic "
                "transcription; dedications and epigraphs are not included in the verse. "
                "The date and place of composition are not established here." + note
            ),
            "contextSource": GUTENBERG,
            "contextSourceTitle": "Project Gutenberg · 1924 edition for comparison",
            "sourceTitle": f"Wikisource · Les Fleurs du mal, 1861, no. {number}",
            "source": item["source"],
            "rights": RIGHTS,
            "text": text,
            "translations": [],
        })
    return output


def download(url):
    request = Request(url, headers={"User-Agent": "VersoPoetrySourceReview/1.0 (textual research)"})
    for attempt in range(5):
        try:
            with urlopen(request, timeout=60) as response:
                return response.read()
        except HTTPError as error:
            if error.code not in {429, 503} or attempt == 4:
                raise
            retry_after = error.headers.get("Retry-After", "")
            delay = min(int(retry_after), 30) if retry_after.isdecimal() else 2 ** attempt
            time.sleep(delay)
    raise AssertionError("Unreachable")


def fetch_sources(directory, manifest):
    """Retrieve missing witnesses without overwriting existing local files."""
    directory.mkdir(parents=True, exist_ok=True)
    files = [("gutenberg-61565.html", GUTENBERG)]
    files += [(f"{item['number']:03}.html", item["source"]) for item in manifest["poems"]]
    files += [(name, SCAN.format(page=6 if name == "title-page.jpg" else int(name[5:-4])))
              for name in manifest["scanSha256"]]
    def save(item):
        name, url = item
        destination = directory / name
        if destination.exists():
            return
        data = download(url)
        with destination.open("xb") as stream:
            stream.write(data)

    with ThreadPoolExecutor(max_workers=2) as executor:
        list(executor.map(save, files))
    index = directory / "page-content-index.json"
    if index.exists():
        return
    captured = {}
    revisions = list(manifest["pages"].values())
    for start in range(0, len(revisions), 40):
        params = urlencode({
            "action": "query", "format": "json", "formatversion": "2",
            "prop": "revisions", "rvprop": "ids|timestamp|content", "rvslots": "main",
            "revids": "|".join(str(page["revid"]) for page in revisions[start:start + 40]),
        })
        response = json.loads(download("https://fr.wikisource.org/w/api.php?" + params))
        for page in response["query"]["pages"]:
            revision = page["revisions"][0]
            captured[page["title"]] = {
                "pageid": page["pageid"], "revid": revision["revid"],
                "content": revision["slots"]["main"]["content"],
            }
    with index.open("x", encoding="utf8") as stream:
        stream.write(json.dumps(captured, ensure_ascii=False, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory for the saved source witnesses")
    parser.add_argument("--fetch", action="store_true", help="fetch missing sources without overwriting files")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    if args.fetch:
        fetch_sources(args.directory, manifest)
    rendered = json.dumps(records(args.directory), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Records differ from the reviewed sources")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

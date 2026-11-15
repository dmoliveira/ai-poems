#!/usr/bin/env python3
"""Build the German reading selection from pinned Wikisource revisions."""

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = ROOT / "scripts/sources/german-wikisource-revisions.json"
OUTPUT = ROOT / "content/poems/german-classics.json"
SNAPSHOT_SHA256 = "43f281a8dcde2abd7395f1fef732cd43c7a737ef46aedef35258ca2136efe357"

# The individual numbered Heine lyrics are separate poems in the 1827 index.
# Entries are (slug, Wikisource title, revision, poet, edition, first scan,
# displayed nonblank line count, optional contextual note, optional display title).
SELECTION = (
    ("goethe-heidenroslein", "Heidenröslein", 3779919, "goethe", "goethe1789", "Goethes Schriften 8 1789 105.jpg", 21, "", ""),
    ("goethe-der-fischer", "Der Fischer", 3113358, "goethe", "goethe1789", "Goethes Schriften 8 1789 155.jpg", 32, "", ""),
    ("goethe-der-zauberlehrling", "Der Zauberlehrling (1827)", 3467076, "goethe", "goethe1827", "1827 Goethes Werke 01 217.jpg", 98, "This follows the 1827 version, not the 1798 first printing. Refrains are retained in full.", ""),
    ("goethe-willkommen-und-abschied", "Willkommen und Abschied (1827)", 4811915, "goethe", "goethe1827", "De Goethe Werke LH 01 068.jpg", 32, "This is the 1827 version; an earlier version appeared in 1775.", ""),
    ("goethe-wandrers-nachtlied", "Wandrers Nachtlied", 3778644, "goethe", "goethe1827", "De Goethe Werke LH 01 099.jpg", 8, "The next poem on the same page, ‘Ein gleiches’, is a separate poem.", ""),
    ("goethe-ein-gleiches", "Ein Gleiches", 3682272, "goethe", "goethe1827", "De Goethe Werke LH 01 099.jpg", 8, "The printed heading ‘Ein gleiches’ refers to the preceding ‘Wandrers Nachtlied’; each is a separate poem.", "Wandrers Nachtlied II · Über allen Gipfeln"),
    ("eichendorff-mondnacht", "Mondnacht", 4067390, "eichendorff", "eichendorff1864", "Mondnacht (Eichendorff) 1.jpg", 12, "", ""),
    ("eichendorff-sehnsucht", "Sehnsucht (Eichendorff II)", 2569924, "eichendorff", "eichendorff1864", "Sehnsucht (Eichendorff) 1.jpg", 24, "The scan has printed pages 267–268; the transcription's page markers say 268–269.", ""),
    ("eichendorff-das-zerbrochene-ringlein", "Lied (Eichendorff)", 3778482, "eichendorff", "dichterwald1813", "Deutscher Dichterwald 052.jpg", 20, "The 1813 printing signs the poem ‘Florens’, Eichendorff’s pseudonym; the signature is not counted as verse.", "Das zerbrochene Ringlein"),
    ("schiller-an-die-freude", "Ode an die Freude", 2560615, "schiller", "schiller1808", "Schiller - An die Freude - 001.png", 104, "This is the complete later 1808 version, not Beethoven’s shortened adaptation or the 1786 first printing. Eight chorus labels are displayed as separate lines.", "Ode an die Freude"),
    ("traditional-die-gedanken-sind-frei", "Die Gedanken sind frei", 3507073, "traditional", "volkslieder1842", "Die Gedanken sind frei.png", 40, "This five-stanza traditional version differs from other versions; the transcription corrects the print’s ‘Geadnken’ to ‘Gedanken’. The preceding epigraph and music are not included.", ""),
    ("heine-im-wunderschoenen-monat-mai", "Im wunderschönen Monat Mai", 3815972, "heine", "heine1827", "Buch der Lieder 112.jpg", 8, "", ""),
    ("heine-aus-meinen-thraenen", "Aus meinen Thränen sprießen", 3815978, "heine", "heine1827", "Buch der Lieder 113.jpg", 8, "", ""),
    ("heine-wenn-ich-in-deine-augen-seh", "Wenn ich in deine Augen seh’", 3778605, "heine", "heine1827", "Buch der Lieder 114.jpg", 8, "", ""),
    ("heine-auf-fluegeln-des-gesanges", "Auf Flügeln des Gesanges", 4064468, "heine", "heine1827", "Buch der Lieder 117.jpg", 20, "", ""),
    ("heine-die-lotosblume", "Die Lotosblume ängstigt", 4064418, "heine", "heine1827", "Buch der Lieder 119.jpg", 12, "", ""),
    ("heine-im-rhein", "Im Rhein, im heiligen Strome", 4064419, "heine", "heine1827", "Buch der Lieder 120.jpg", 12, "", ""),
    ("heine-ich-grolle-nicht", "Ich grolle nicht, und wenn das Herz auch bricht", 3832113, "heine", "heine1827", "Buch der Lieder 125.jpg", 8, "The 1827 printing has eight lines; later versions and musical settings may differ.", "Ich grolle nicht"),
    ("heine-ein-fichtenbaum", "Ein Fichtenbaum steht einsam", 3778874, "heine", "heine1827", "Buch der Lieder 137.jpg", 8, "", ""),
    ("heine-ein-juengling", "Ein Jüngling liebt ein Mädchen", 3816458, "heine", "heine1827", "Buch der Lieder 144.jpg", 12, "", ""),
    ("heine-ich-hab-im-traum", "Ich hab’ im Traum’ geweinet", 3620419, "heine", "heine1827", "Buch der Lieder 159.jpg", 12, "", ""),
    ("heine-allnaechtlich-im-traume", "Allnächtlich im Traume seh’ ich dich", 4640904, "heine", "heine1827", "Buch der Lieder 160.jpg", 12, "", ""),
    ("heine-die-alten-boesen-lieder", "Die alten, bösen Lieder", 3815856, "heine", "heine1827", "Buch der Lieder 170.jpg", 24, "", ""),
    ("heine-die-lorelei", "Ich weiß nicht, was soll es bedeuten", 4635906, "heine", "heine1827", "Buch der Lieder 178.jpg", 24, "The 1827 poem is numbered II and has no printed title; ‘Die Lorelei’ is a later familiar title. The print spells the name ‘Lore-Ley’.", "Die Lorelei"),
    ("heine-du-bist-wie-eine-blume", "Du bist wie eine Blume", 3851653, "heine", "heine1827", "Buch der Lieder 223.jpg", 8, "", ""),
)

POETS = {
    "goethe": ("Johann Wolfgang von Goethe", "johann-wolfgang-von-goethe", "1749–1832"),
    "heine": ("Heinrich Heine", "heinrich-heine", "1797–1856"),
    "eichendorff": ("Joseph von Eichendorff", "joseph-von-eichendorff", "1788–1857"),
    "schiller": ("Friedrich Schiller", "friedrich-schiller", "1759–1805"),
    "traditional": ("Traditional German song", "traditional-german-song", "Dates unknown"),
}

EDITIONS = {
    "goethe1789": (1789, "Goethe’s Schriften · Band 8"),
    "goethe1827": (1827, "Goethe’s Werke · Ausgabe letzter Hand, Band 1"),
    "eichendorff1864": (1864, "Eichendorff’s sämmtliche Werke · Band 1"),
    "dichterwald1813": (1813, "Deutscher Dichterwald"),
    "schiller1808": (1808, "Schiller · Gedichte, zweiter Theil"),
    "volkslieder1842": (1842, "Schlesische Volkslieder mit Melodien"),
    "heine1827": (1827, "Buch der Lieder"),
}


def extract_verse(wikitext, title):
    match = re.search(r"<poem>(.*?)</poem>", wikitext, re.DOTALL)
    if not match:
        raise ValueError(f"Missing poem block: {title}")
    text = match.group(1)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    text = re.sub(r"<ref\b[^>]*>.*?</ref>", "", text, flags=re.DOTALL)
    text = re.sub(r"\{\{center\|'''Chor\.'''\}\}", "Chor", text, flags=re.IGNORECASE)
    text = re.sub(r"\{\{[^{}]*\}\}", "", text)
    text = re.sub(r"^\s*'''[^\n]*'''\s*\n", "", text, flags=re.MULTILINE)
    if title == "Lied (Eichendorff)":
        text = re.sub(r"\n\s*''Florens\.\s*''\s*$", "", text)
    text = text.replace("''", "")
    if re.search(r"[{}<>]|\[\[", text):
        raise ValueError(f"Unrecognized markup: {title}")
    text = "\n".join(line.strip() for line in text.splitlines()).strip()
    return re.sub(r"\n{3,}", "\n\n", text)


def records():
    data = SNAPSHOT.read_bytes()
    if hashlib.sha256(data).hexdigest() != SNAPSHOT_SHA256:
        raise ValueError("Pinned Wikisource snapshot changed")
    pages = json.loads(data)["query"]["pages"]
    by_title = {page["title"]: page for page in pages}
    if len(by_title) != len(SELECTION) or set(by_title) != {item[1] for item in SELECTION}:
        raise ValueError("Unexpected Wikisource selection")
    results = []
    for slug, wiki_title, revision, poet, edition, image, count, note, display in SELECTION:
        page = by_title[wiki_title]
        if len(page["revisions"]) != 1 or page["revisions"][0]["revid"] != revision:
            raise ValueError(f"Unexpected revision: {wiki_title}")
        wiki = page["revisions"][0]["slots"]["main"]["content"]
        if "|BEARBEITUNGSSTAND=fertig" not in wiki:
            raise ValueError(f"Transcription not marked complete: {wiki_title}")
        verse = extract_verse(wiki, wiki_title)
        if len([line for line in verse.splitlines() if line]) != count:
            raise ValueError(f"Unexpected line count: {wiki_title}")
        author, author_id, author_years = POETS[poet]
        year, collection = EDITIONS[edition]
        title = {"Der Zauberlehrling (1827)": "Der Zauberlehrling", "Willkommen und Abschied (1827)": "Willkommen und Abschied", "Sehnsucht (Eichendorff II)": "Sehnsucht", "Lied (Eichendorff)": "Lied", "Ode an die Freude": "An die Freude", "Ein Gleiches": "Ein gleiches"}.get(wiki_title, wiki_title)
        context = (f"This reading follows the German Wikisource contributors’ transcription of {collection}, printed in {year}. "
                   "Spacing and typography are normalized; the linked scan begins the poem. "
                   "The printing year does not establish when or where the poem was composed. "
                   "Germany is an associated place, not a claim about composition.")
        if poet == "heine":
            context += " The numbered lyric is an individual poem in the 1827 collection; its opening supplies the title."
        if note:
            context += " " + note
        poem = {
            "id": slug, "title": title, "author": author, "authorId": author_id,
            "authorYears": author_years, "country": "Germany", "language": "German", "lang": "de", "direction": "ltr",
            "year": year, "yearLabel": f"Printed in {year}", "era": f"{18 if year < 1800 else 19}th century",
            "form": "Ode" if poet == "schiller" else "Song" if poet == "traditional" else "Ballad" if slug in {"goethe-der-fischer", "goethe-der-zauberlehrling"} else "Verse",
            "collection": collection, "themes": [], "mood": "paper", "context": context,
            "sourceTitle": f"German Wikisource contributors · revision {revision}",
            "source": f"https://de.wikisource.org/w/index.php?title={quote(wiki_title.replace(' ', '_'), safe='')}&oldid={revision}",
            "contextSourceTitle": f"{collection} ({year}) · first scan page",
            "contextSource": f"https://commons.wikimedia.org/wiki/File:{quote(image.replace(' ', '_'), safe='')}",
            "rights": (f"German original printed in {year}; public domain in the United States. "
                       "Transcription adapted from German Wikisource contributors, CC BY-SA 4.0 "
                       "(https://creativecommons.org/licenses/by-sa/4.0/); the linked revision provides attribution. "
                       "Copyright and moral rights vary by jurisdiction; check local law. Scans are linked, not republished."),
            "text": verse, "translations": [],
        }
        if display:
            poem.update(displayTitle=display, displayTitleLang="de")
        if poet == "traditional":
            poem["anonymous"] = True
        results.append(poem)
    if len({p["text"] for p in results}) != len(results):
        raise ValueError("Duplicate reading in selection")
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = json.dumps(records(), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Committed records differ from pinned revisions")
        print(f"Verified {len(SELECTION)} German readings against the pinned revisions.")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {len(SELECTION)} German readings.")


if __name__ == "__main__":
    main()

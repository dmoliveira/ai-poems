#!/usr/bin/env python3
"""Reproduce selected Greek periodical and Russian first-edition readings."""

import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "content/poems/greek-russian-classics.json"
EVIDENCE = {
    "cavafy-ithaka-1911.pdf": "926ecfefeba4fd34d7064e44b9a3ab4660cbd0bc347484fae087d56ca56283a2",
    "cavafy-antony-1911.jpg": "30e48e1dc57f913e0e2f356973668e2e18a8de240dbea98a88b3d62db74e05b6",
    "cavafy-1926-01.jpg": "db020a500295964aca453ab32fe06d9ebda4a7751bcba58ba1cbba66e4bb37ce",
    "cavafy-1926-02.jpg": "de677a4bcae627a476f1fe68997d55aa144011500d77f1b9ff2a1029e2669408",
    "cavafy-1927-01.jpg": "6719624feb0e46fca8d0a6b59100154302546b3ffa1251983a914a5fbb1d099a",
    "akhmatova-vecher-1912.pdf": "b175d55db82bcf69f269fe40e80335cb1c25a35443f361edd8c52bed32797673",
}


def commons(title):
    return "https://commons.wikimedia.org/wiki/File:" + quote(title.replace(" ", "_"))


def wiki(language, title, revision):
    return f"https://{language}.wikisource.org/w/index.php?title={quote(title.replace(' ', '_'))}&oldid={revision}"


ITHAKA = """Σὰ βγεῖς στὸν πηγαιμὸ γιὰ τὴν Ἰθάκη,
νὰ εὔχεσαι νἆναι μακρὺς ὁ δρόμος,
γεμάτος περιπέτειες, γεμάτος γνώσεις.
Τοὺς Λαιστρυγόνας καὶ τοὺς Κύκλωπας,
τὸν θυμωμένο Ποσειδῶνα μὴ φοβᾶσαι,
τέτοια στὸν δρόμο σου ποτέ σου δὲν θὰ βρεῖς,
ἂν μέν’ ἡ σκέψις σου ὑψηλή, ἂν ἐκλεκτὴ
συγκίνησις τὸ πνεῦμα καὶ τὸ σῶμα σου ἀγγίζει.
Τοὺς Λαιστρυγόνας καὶ τοὺς Κύκλωπας,
τὸν ἄγριο Ποσειδῶνα δὲν θὰ συναντήσεις,
ἂν δὲν τοὺς κουβανεῖς μὲς στὴν ψυχή σου,
ἂν ἡ ψυχή σου δὲν τοὺς στήνει ἐμπρός σου.

Νὰ εὔχεσαι νἆναι μακρὺς ὁ δρόμος.
Πολλὰ τὰ καλοκαιρινὰ πρωϊὰ νὰ εἶναι
ποῦ μὲ τὶ εὐχαρίστησι, μὲ τὶ χαρὰ
θὰ μπαίνεις σὲ λιμένας πρωτοειδωμένους·
νὰ σταματήσεις σ’ ἐμπορεῖα Φοινικικὰ
καὶ τὲς καλὲς πραγμάτειες ν’ ἀποκτήσεις,
σεντέφια καὶ κοράλλια, κεχριμπάρια κ’ ἔβενους,
καὶ ἡδονικὰ μυρωδικὰ κάθε λογῆς,
ὅσο μπορεῖς πιὸ ἄφθονα ἡδονικὰ μυρωδικά·
σὲ πόλεις Αἰγυπτιακὲς πολλὲς νὰ πᾶς,
νὰ μάθεις καὶ νὰ μάθεις ἀπ’ τοὺς σπουδασμένους.

Πάντα στὸν νοῦ σου νἄχεις τὴν Ἰθάκη.
Τὸ φθάσιμον ἐκεῖ εἶν’ ὁ προορισμός σου.
Ἀλλὰ μὴ βιάζεις τὸ ταξείδι διόλου.
Καλλίτερα χρόνια πολλὰ νὰ διαρκέσει·
καὶ γέρος πιὰ ν’ ἀράξεις στὸ νησί,
πλούσιος μὲ ὅσα κέρδισες στὸν δρόμο,
μὴ προσδοκώντας πλούτη νὰ σὲ δώσει ἡ Ἰθάκη.

Ἡ Ἰθάκη σ’ ἔδωσε τ’ ὡραῖο ταξείδι.
Χωρὶς αὐτὴν δὲν θάβγαινες στὸν δρόμο.
Ἄλλα δὲν ἔχει νὰ σὲ δώσει πιά.

Κι ἂν πτωχικὴ τὴν βρεῖς, ἡ Ἰθάκη δὲν σὲ γέλασε.
Ἔτσι σοφὸς ποῦ ἔγινες, μὲ τόση πεῖρα,
ἤδη θὰ τὸ κατάλαβες ἡ Ἰθάκες τὶ σημαίνουν."""

# The remaining Greek readings adapt the cited Wikisource page revisions,
# compared against the linked periodical pages. Each item is one complete work.
GREEK = [
    ("candles", "Κεριά", "Candles", 1926, 1, 1, 120666,
     "The printing has ‘ἡ μέρες’, ‘Ἡ περασμένες’ and ‘μιὰ θλιβερὴ σειρὰ’; a later edition has ‘οι μέρες’, ‘Οι περασμένες’ and ‘μια θλιβερή γραμμή’.", """Τοῦ μέλλοντος ἡ μέρες στέκοντ’ ἐμπροστά μας
σὰν μιὰ σειρὰ κεράκια ἀναμένα —
χρυσᾶ, ζεστὰ, καὶ ζωηρὰ κεράκια.

Ἡ περασμένες μέρες πίσω μένουν,
μιὰ θλιβερὴ σειρὰ κεριῶν σβυσμένων·
τὰ πιὸ κοντὰ βγάζουν καπνὸν ἀκόμη,
κρύα κεριά, λυωμένα, καὶ κυρτά.

Δὲν θέλω νὰ τὰ βλέπω· μὲ λυπεῖ ἡ μορφή των,
καὶ μὲ λυπεῖ τὸ πρῶτο φῶς των νὰ θυμοῦμαι.
Ἐμπρὸς κυττάζω τ’ ἀναμένα μου κεριά.
Δὲν θέλω νὰ γυρίσω νὰ μὴ δῶ καὶ φρίξω
τί γρήγορα ποῦ ἡ σκοτεινὴ γραμμὴ μακραίνει,
τί γρήγορα ποῦ τὰ σβυστὰ κεριὰ πληθαίνουν."""),
    ("supplication", "Δέησις", "Supplication", 1926, 1, 1, 120666,
     "The printing has ‘ἕνα ναύτη’; a later edition has ‘έναν ναύτη’.", """Ἡ θάλασσα στὰ βάθη της πῆρ’ ἕνα ναύτη.—
Ἡ μάνα του, ἀνήξερη, πιαίνει κι’ ἀνάφτει

στὴν Παναγία μπροστὰ ἕνα ὑψηλὸ κερὶ
γιὰ νὰ ἐπιστρέψει γρήγορα καὶ νᾶν καλοὶ καιροὶ —

καὶ ὅλο πρὸς τὸν ἄνεμο στήνει τ’ αὐτί.
Ἀλλὰ ἐνῶ προσεύχεται καὶ δέεται αὐτή,

ἡ εἰκὼν ἀκούει, σοβαρὴ καὶ λυπημένη,
ξεύροντας πῶς δὲν θἄλθει πιὰ ὁ υἱὸς ποῦ περιμένει."""),
    ("walls", "Τείχη", "Walls", 1926, 1, 2, 107068,
     "", """Χωρὶς περίσκεψιν, χωρὶς λύπην, χωρὶς αἰδὼ
μεγάλα κ’ ὑψηλὰ τριγύρω μου ἔκτισαν τείχη.

Καὶ κάθομαι καὶ ἀπελπίζομαι τώρα ἐδῶ.
Ἄλλο δὲν σκέπτομαι: τὸν νοῦν μου τρώγει αὐτὴ ἡ τύχη.

διότι πράγματα πολλὰ ἔξω νὰ κάμω εἶχον.
Ἂ ὅταν ἔκτιζαν τὰ τείχη πῶς νὰ μὴν προσέξω.

Ἀλλὰ δὲν ἄκουσα ποτὲ κρότον κτιστῶν ἢ ἦχον.
Ἀνεπαισθήτως μ’ ἔκλεισαν ἀπὸ τὸν κόσμον ἔξω."""),
    ("windows", "Τα παράθυρα", "The Windows", 1926, 1, 2, 107068,
     "The printing reads ‘Πλὴν τὰ παράθυρα’; a later edition reads ‘Μα τα παράθυρα’.", """Σ’ αὐτὲς τὲς σκοτεινὲς κάμαρες, ποῦ περνῶ
μέρες βαρειές, ἐπάνω κάτω τριγυρνῶ
γιὰ νἄβρω τὰ παράθυρα. Ὅταν ἀνοίξει
ἕνα παράθυρο θἆναι παρηγορία.
Πλὴν τὰ παράθυρα δὲν βρίσκονται, ἢ δὲν μπορῶ
νὰ τἄβρω. Καὶ καλλίτερα ἴσως νὰ μὴν τὰ βρῶ.
Ἴσως τὸ φῶς θἆναι μιὰ νέα τυραννία.
Ποιὸς ξέρει τί καινούρια πράγματα θὰ δείξῃ."""),
    ("voices", "Φωνές", "Voices", 1927, 2, 1, 107184,
     "", """Ἰδανικὲς φωνὲς κι’ ἀγαπημένες
ἐκείνων ποῦ πέθαναν, ἢ ἐκείνων ποῦ εἶναι
γιὰ μᾶς χαμένοι σὰν τοὺς πεθαμένους.

Κάποτε μὲς στὰ ὄνειρά μας ὁμιλοῦνε·
κάποτε μὲς στὴν σκέψι τὲς ἀκούει τὸ μυαλό.

Καὶ μὲ τὸν ἦχο των γιὰ μιὰ στιγμὴ ἐπιστρέφουν
ἦχοι ἀπὸ τὴν πρώτη ποίηση τῆς ζωῆς μας —
σὰ μουσική, τὴν νύχτα, μακρυνή, ποῦ σβύνει."""),
    ("thermopylae", "Θερμοπύλες", "Thermopylae", 1927, 2, 1, 107184,
     "", """Τιμὴ σ’ ἐκείνους ὅπου στὴν ζωὴ των
ὥρισαν καὶ φυλάγουν Θερμοπύλες.
Ποτὲ ἀπὸ τὸ χρέος μὴ κινοῦντες·
δίκαιοι κ’ ἴσιοι σ’ ὅλες των τὲς πράξεις,
ἀλλὰ μὲ λύπη κιόλας κ’ εὐσπλαχνία·
γενναῖοι ὁσάκις εἶναι πλούσιοι, κι ὅταν
εἶναι πτωχοί, πάλ’ εἰς μικρὸν γενναῖοι,
πάλι συντρέχοντες ὅσο μποροῦνε·
πάντοτε τὴν ἀλήθεια ὁμιλοῦντες,
πλὴν χωρὶς μῖσος γιὰ τοὺς ψευδομένους.

Καὶ περισσότερη τιμὴ τοὺς πρέπει
ὅταν προβλέπουν (καὶ πολλοὶ προβλέπουν)
πῶς ὁ Ἐφιάλτης θὰ φανεῖ στὸ τέλος,
κ’ οἱ Μῆδοι ἐπὶ τέλους θὰ διαβοῦνε."""),
]

ANTONY = """Σὰν ἔξαφνα, ὥρα μεσάνυχτ’, ἀκουσθεῖ
ἀόρατος θίασος νὰ περνᾶ
μὲ μουσικὲς ἐξαίσιες, μὲ φωνές —
τὴν τύχη σου ποῦ ἐνδίδει πιά, τὰ ἔργα σου
ποῦ ἀπέτυχαν, τὰ σχέδια τῆς ζωῆς σου
ποῦ βγῆκαν ὅλα πλάνες, μὴ ἀνοφέλετα θρηνήσεις.
Σὰν ἕτοιμος ἀπὸ καιρό, σὰ θαρραλέος,
ἀποχαιρέτα την, τὴν Ἀλεξάνδρεια ποῦ φεύγει.
Πρὸ πάντων νὰ μὴ γελασθεῖς, μὴν πεῖς πῶς ἦταν
ἕνα ὄνειρο, πῶς ἀπατήθηκεν ἡ ἀκοή σου·
μάταιες ἐλπίδες τέτοιες μὴν καταδεχθεῖς.
Σὰν ἕτοιμος ἀπὸ καιρό, σὰ θαρραλέος,
σὰν ποῦ ταιριάζει σε ποῦ ἀξιώθηκες μιὰ τέτοια πόλι,
πλησίασε σταθερὰ πρὸς τὸ παράθυρο,
κι ἄκουσε μὲ συγκίνησιν, ἀλλ’ ὄχι
μὲ τῶν δειλῶν τὰ παρακάλια καὶ παράπονα,
ὡς τελευταία ἀπόλαυσι τοὺς ἤχους,
τὰ ἐξαίσια ὄργανα τοῦ μυστικοῦ θιάσου,
κι ἀποχαιρέτα την, τὴν Ἀλεξάνδρεια ποῦ χάνεις."""


def greek_base(slug, title, display, year, collection, source_title, source, context_source_title, context_source, context, rights, text):
    return {
        "id": f"cavafy-{year}-{slug}", "title": title, "displayTitle": display,
        "author": "C. P. Cavafy", "authorOriginal": "Κωνσταντίνος Π. Καβάφης",
        "authorId": "c-p-cavafy", "authorYears": "1863–1933", "country": "Egypt",
        "language": "Greek", "lang": "el", "direction": "ltr", "year": year,
        "yearLabel": f"Printed in {year}", "era": "20th century", "form": "Lyric",
        "collection": collection, "themes": [], "mood": "paper", "context": context,
        "sourceTitle": source_title, "source": source,
        "contextSourceTitle": context_source_title, "contextSource": context_source,
        "rights": rights, "text": text, "translations": [],
    }


def greek_records():
    records = []
    for slug, title, display, year, issue, page, revision, note, text in GREEK:
        file_name = f"Αλεξανδρινή Τέχνη Τομ.1 Αρ.{issue} - {page:02d}.jpg"
        contributor = wiki("el", f"Σελίδα:{file_name}", revision)
        records.append(greek_base(
            slug, title, display, year, f"Alexandriní Téchnē · {year}",
            f"Alexandriní Téchnē · issue {issue}, page {page} ({year})", commons(file_name),
            f"Greek Wikisource · page transcription revision {revision}", contributor,
            (f"This complete poem is printed on page {page} of Alexandriní Téchnē, issue {issue} ({year}). "
             "The reading adapts the linked Greek Wikisource page transcription, compared with the periodical scan. "
             "Historical spelling is retained; spacing and punctuation may be normalized. "
             f"{note} Egypt is an associated place, not a claim about composition; the year identifies the printing.").replace("  ", " "),
            (f"Greek original printed in {year}; public domain in the United States. Page transcription adapted from "
             "Greek Wikisource contributors under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/); "
             f"contributor history: {contributor}. Copyright and moral rights vary; check local law. Scan linked, not republished."),
            text,
        ))

    contributor = wiki("el", "Σελίδα:Γράμματα Αρ.3 (1911) - 65.jpg", 119595)
    records.append(greek_base(
        "antony", "Ἀπολείπειν ὁ θεὸς Ἀντώνιον", "The God Abandons Antony", 1911, "Grámmata · 1911",
        "Grámmata · issue 3, page 65 (April 1911)", commons("Γράμματα Αρ.3 (1911) - 65.jpg"),
        "Greek Wikisource · page transcription revision 119595", contributor,
        "This complete poem follows the April 1911 Grámmata printing. The Greek Wikisource page transcription "
        "was compared with the periodical scan; historical spelling is retained and spacing and punctuation "
        "may be normalized. Egypt is an associated place, not a claim about composition; the year identifies the printing.",
        "Greek original printed in 1911; public domain in the United States. Page transcription adapted from "
        "Greek Wikisource contributors under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/); "
        f"contributor history: {contributor}. Copyright and moral rights vary; check local law. Scan linked, not republished.",
        ANTONY,
    ))
    records.append(greek_base(
        "ithaka", "Ἰθάκη", "Ithaka", 1911, "Grámmata · 1911",
        "Grámmata · pages 286–287 (1911)", commons("Ithaka by Kavafis, Grammata magazine vol 9-10, 1911.pdf"),
        "Greek Wikisource · later reading, revision 152329", wiki("el", "Ιθάκη", 152329),
        "This complete reading is transcribed from the two-page 1911 Grámmata printing; the final three lines are "
        "at the top of page 287. The linked Wikisource reading is a later comparison, not the transcription source. "
        "The scan has ‘τ’ ὡραῖο’, ‘Ἄλλα’, ‘ἡ Ἰθάκες’ and ‘ταξείδι’, where the comparison differs. "
        "Historical spelling is retained; spacing and punctuation may be normalized. Egypt is an associated place, "
        "not a claim about composition; the year identifies the printing.",
        "Greek original printed in 1911; public domain in the United States. Copyright and moral rights vary; "
        "check local law. Scan linked, not republished.", ITHAKA,
    ))
    return records


RUSSIAN = [
    ("clasped-hands", "Сжала руки…", "She Clasped Her Hands", 19,
     "Сжала руки под темной вуалью (Ахматова)", 5628171,
     "The 1912 print separates ‘до пьяна’; the comparison has ‘допьяна’.", """Сжала руки под темной вуалью...
«Отчего ты сегодня бледна?»...
— Оттого что я терпкой печалью
Напоила его до пьяна.

Как забуду? Он вышел, шатаясь,
Искривился мучительно рот,
Я сбежала, перил не касаясь,
Я бежала за ним до ворот.

Задыхаясь, я крикнула: «Шутка
Все, что было. Уйдешь, я умру».
Улыбнулся спокойно и жутко
И сказал мне: «Не стой на ветру»."""),
    ("last-meeting", "Песня последней встречи", "Song of the Last Meeting", 25,
     "Песня последней встречи (Ахматова)", 5628202,
     "The 1912 printing continues on page 26 and reads ‘Я обманут, слышишь, унылый’; the linked later edition reads ‘Я обманут моей унылой’.", """Так беспомощно грудь холодела,
Но шаги мои были легки,
Я на правую руку надела
Перчатку с левой руки.

Показалось, что много ступеней,
А я знала, их только три!
Между кленов шопот осенний
Попросил: «со мною умри!

Я обманут, слышишь, унылый,
Переменчивой злой судьбой».
Я ответила: «милый, милый!
И я тоже. — Умру с тобой.»...

Это песня последней встречи,
Я взглянула на темный дом,
Только в спальне горели свечи
Равнодушно-желтым огнем."""),
    ("grey-eyed-king", "Сероглазый король", "The Grey-Eyed King", 67,
     "Сероглазый король (Ахматова)", 5769916,
     "", """Слава тебе, безысходная боль!
Умер вчера сероглазый король.

Вечер осенний был душен и ал,
Муж мой, вернувшись, спокойно сказал:

«Знаешь, с охоты его принесли,
Тело у старого дуба нашли.

«Жаль королеву. Такой молодой!..
За ночь одну она стала седой.»

Трубку свою на камине нашел
И на работу ночную ушел.

Дочку мою я сейчас разбужу,
В серые глазки ея погляжу.

А за окном шелестят тополя:
«Нет на земле твоего короля...»"""),
]


def russian_records():
    records = []
    for slug, title, display, page, comparison, revision, note, text in RUSSIAN:
        records.append({
            "id": f"akhmatova-1912-{slug}", "title": title, "displayTitle": display,
            "author": "Anna Akhmatova", "authorOriginal": "Анна Андреевна Ахматова",
            "authorId": "anna-akhmatova", "authorYears": "1889–1966", "country": "Russia",
            "language": "Russian", "lang": "ru", "direction": "ltr", "year": 1912,
            "yearLabel": "Printed in 1912", "era": "20th century", "form": "Lyric",
            "collection": "Evening · 1912", "themes": [], "mood": "paper",
            "context": (f"This complete reading is transcribed from Akhmatova’s Evening (1912), beginning on "
                        f"printed and PDF page {page}. Pre-1918 letters and final hard signs are modernized, "
                        "but some historical spellings remain; spacing and punctuation may be normalized. "
                        "The linked Russian Wikisource edition is a later comparison, not the transcription source. "
                        f"{note} Russia is an associated place, not a claim about composition; the year identifies the printing.").replace("  ", " "),
            "sourceTitle": f"Akhmatova · Evening (1912), page {page}",
            "source": commons("Akhmatova Vecher 1912.pdf") + f"?page={page}",
            "contextSourceTitle": f"Russian Wikisource · comparison revision {revision}",
            "contextSource": wiki("ru", comparison, revision),
            "rights": ("Russian original printed in 1912; public domain in the United States. Akhmatova died in 1966, "
                       "so copyright may persist elsewhere; check local law. Scan linked, not republished."),
            "text": text, "translations": [],
        })
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify the committed output without writing")
    parser.add_argument("--evidence-dir", type=Path, help="also verify the linked scan witnesses")
    args = parser.parse_args()
    if args.evidence_dir:
        for name, expected in EVIDENCE.items():
            if hashlib.sha256((args.evidence_dir / name).read_bytes()).hexdigest() != expected:
                raise SystemExit(f"Evidence hash mismatch: {name}")
    records = [*greek_records(), *russian_records()]
    result = json.dumps(records, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf-8") != result:
            raise SystemExit(f"Generated records differ from {OUTPUT}")
        print(f"Verified {len(records)} readings" + (" and six scan witnesses." if args.evidence_dir else "."))
    else:
        OUTPUT.write_text(result, encoding="utf-8")
        print(f"Wrote {len(records)} readings.")


if __name__ == "__main__":
    main()

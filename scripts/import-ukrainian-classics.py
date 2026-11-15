#!/usr/bin/env python3
"""Reproduce selected Ukrainian readings from credited historical-print pages."""

import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "content/poems/ukrainian-classics.json"
EVIDENCE = {
    "ukrainian-muse-issue2-1908.pdf": "c01941e2d95dc005e421a5aee043368382662b1a3fb667899d9843967988a0ef",
    "ukrainian-muse-issue3-1908.pdf": "2e4a5b6e2e07e1304365bbf60c4d6f21be97730bbda764d9b6a13a3c53eee39f",
    "ukrainian-muse-issue4-1908.pdf": "c8dd59a76caf0f45a49444efe187e19ed76ef7e712f19dff3cdbc2f33e6949be",
    "ukrainka-na-krylah-1892.pdf": "a4b093490150e3248022e2ac8639dbdd019b3f21c382c7a86ef6721edd83d1df",
}


def commons(title, page):
    return "https://commons.wikimedia.org/wiki/File:" + quote(title.replace(" ", "_")) + f"?page={page}"


def wiki_page(title, page, revision):
    full_title = f"Сторінка:{title}/{page}".replace(" ", "_")
    return f"https://uk.wikisource.org/w/index.php?title={quote(full_title)}&oldid={revision}"


MUSE = "Украінська Муза (Випуск {issue}).pdf"
UKRAINKA = "Леся Українка. На крилах пісень. 1892.pdf"

# Each text adapts the cited Wikisource page revisions after comparison with
# the historical scan. Line and stanza breaks follow the selected printing.
READINGS = [
    {
        "id": "shevchenko-1908-zapovit", "title": "Заповіт", "display": "Testament",
        "author": ("Taras Shevchenko", "Тарас Шевченко", "taras-shevchenko", "1814–1861"),
        "file": MUSE.format(issue=2), "pages": [(17, 1128350)], "year": 1908,
        "collection": "Ukrainska Muza · 1908", "printed": "issue 2, printed pages 145–146",
        "note": "The 1908 printing has ‘Було видно, було чути’; the 1876 Kobzar has ‘Були видні, було чути’ and reflows the middle passage. The full middle passage is included here.",
        "text": """Як умру, то поховайте
Мене на могилі,
Серед степу широкого,
На Вкраіні милій:
Щоб лани широкополі
І Дніпро, і кручі
Було видно, було чути,
Як реве ревучий!

Як понесе з Украіни
У синєє море
Кров ворожу, — отоді я
І лани, і гори —
Все покину, і полину
До самого Бога
Молитися. А до того —
Я не знаю Бога!

Поховайте та вставайте
Кайдани порвіте,
І вражою злою кровью
Волю окропіте!
І мене в сімьі великій,
В сімьі вольній, новій,
Не забудьте помьянути
Незлим тихим словом.""",
    },
    {
        "id": "shevchenko-1908-vechir", "title": "Вечір", "display": "Evening · The Cherry Orchard",
        "author": ("Taras Shevchenko", "Тарас Шевченко", "taras-shevchenko", "1814–1861"),
        "file": MUSE.format(issue=2), "pages": [(18, 1128351)], "year": 1908,
        "collection": "Ukrainska Muza · 1908", "printed": "issue 2, printed page 147",
        "note": "This separately titled 15-line poem also appears as ‘Вечір’ in the 1876 Kobzar, across pages 212–213; its opening line is often used as its title.",
        "text": """Садок вишневий коло хати,
Хрущі над вишнями гудуть;
Плугатарі з плугами йдуть.
Співають, ідучи, дівчата,
А матері вечерять ждуть.

Сімья вечеря коло хати;
Вечірня зіронька встає;
Дочка вечерять подає,
А мати хоче научати,
Так соловейко не дає.

Поклала мати коло хати
Маленьких діточок своіх,
Сама заснула коло іх.
Затихло все... Тільки дівчата
Та соловейко не затих.""",
    },
    {
        "id": "ukrainka-1892-contra-spem-spero", "title": "Contra spem spero!", "display": "Hope Against Hope",
        "author": ("Lesya Ukrainka", "Леся Українка", "lesya-ukrainka", "1871–1913"),
        "file": UKRAINKA, "pages": [(13, 560107), (14, 560111)], "year": None,
        "collection": "On the Wings of Songs · title page 1892", "printed": "printed pages 13–14",
        "note": "The title page says 1892; some publication histories give 1893. The 36-line printing has two stanzas absent from the 28-line 1908 anthology reading; the reason for the difference is not established here.",
        "text": """Гетьте, думи, ви, хмари осінні!
Тож тепера весна золота!
Чі то так у жалю, в голосінні
Проминуть молодії літа?

Ні, я хочу крізь сльози сміятись,
Серед лиха співати пісні́,
Без надії таки сподіватись,
Жити хочу! Геть думи сумні!

Я на вбогім, сумнім перелозі
Буду сіять барвисті квітки,
Буду сіять квітки на морозі,
Буду лить на них сльози гіркі.

І від сліз тих горячих розтане
Та кора льодовая, міцна,
Може, квіти зійдуть, і настане
Ще й для мене весела весна.

Я на гору круту кремьяную
Буду камінь важкий підіймать,
І, несу́чи вагу ту страшную,
Буду пісню веселу співать.

В довгу, темную нічку неви́дну
Не стулю́ ні на хвильку очей.
Все шукатиму зірку прові́дну,
Ясну вла́дарку темних ночей.

Я не дам сьому серденьку спати,
Хоч кругом буде тьма та нудьга,
Хоч я буду сама почувати,
Що на груди вже смерть наляга.

Смерть наляже на груди важенько,
Світ застеле суворая мгла,
Але дужче забьється серде́нько, —
Може, лютую смерть подола.

Так! я буду крізь сльози сміятись,
Серед лиха співати пісні,
Без надії таки сподіватись,
Буду жити! — Геть думи сумні!""",
    },
    {
        "id": "ukrainka-1892-nadiya", "title": "Надія", "display": "Hope",
        "author": ("Lesya Ukrainka", "Леся Українка", "lesya-ukrainka", "1871–1913"),
        "file": UKRAINKA, "pages": [(28, 560498)], "year": None,
        "collection": "On the Wings of Songs · title page 1892", "printed": "printed page 28",
        "note": "The title page says 1892; some publication histories give 1893. This separately titled poem has ten lines in the selected printing and in the 1908 anthology comparison.",
        "text": """Ні долі ні волі у ме́не нема
Зосталася тілько надія одна:

Надія вернутись ще раз на Вкраїну,
Поглянуть іще раз на рідну країну,

Поглянуть іще раз на синій Дніпро, —
Там жити, чі вмерти, мені все їдно;

Поглянуть іще раз на степ, могилки́,
В останнє згадати палкиї гадки́....

Ні долі, ні волі у мене нема,
Зосталася тілько надія одна.""",
    },
    {
        "id": "petrenko-1908-nedolia", "title": "Недоля · Дивлюся на небо, та й думку гадаю", "display": "I Look at the Sky · Nedolia",
        "author": ("Mykhailo Petrenko", "Михайло Петренко", "mykhailo-petrenko", "1817–1862"),
        "file": MUSE.format(issue=2), "pages": [(33, 1128366), (34, 1128367)], "year": 1908,
        "collection": "Ukrainska Muza · 1908", "printed": "issue 2, printed pages 178–179",
        "note": "The 1908 poem is untitled and continues onto page 179. It was separately titled ‘Недоля’ in 1841 and later included in the Небо triptych; those editions are not separate works here. The catalogue title combines the earlier title and opening line. The 1908 page prints ‘У в світі’, retained as printed.",
        "text": """Дивлюся на небо, та й думку гадаю:
Чому я не сокіл, чому не літаю,
Чому міні, Боже, ти крилля не дав?
Я б землю покинув і в небо злітав —

Далеко за хмари, подальше од світу,
Шукать собі долі, на горе привіту,
І ласки у зірок, у сонця, просить,
У в світі іх яснім все горе втопить.

Бо долі ще змалку здаюсь я нелюбий, —
Я наймит у неі, хлопцюга приблудний;
Чужий я у долі, чужий у людей...
Хіба ж хто кохає нерідних дітей?..

Кохаюся лихом, привіту не знаю,
І гірко, і марно свій вік коротаю.
Й у горі спізнав я, що тільки одна —
Далекее небо — моя сторона...

І на світі гірко! Як стане ще гірше, —
Я очі на небо — міні веселіше,
І в думках забуду, що я сирота,
І думка далеко-високо літа!

Коли б міні крилля, орлячі ті крилля:
Я землю б покинув — і на новосілля
Орлом бистрокрилим у небо б полинув
І в хмарах од світу на віки загинув!..""",
    },
    {
        "id": "hlibov-1908-zhurba", "title": "Журба", "display": "Sorrow · The High Hill",
        "author": ("Leonid Hlibov", "Леонід Глібов", "leonid-hlibov", "1827–1893"),
        "file": MUSE.format(issue=3), "pages": [(10, 1124412)], "year": 1908,
        "collection": "Ukrainska Muza · 1908", "printed": "issue 3, printed pages 259–260",
        "note": "The 1908 printing has ‘любе літечко’ and ‘бідне серденько’; the 1922 Struny comparison has ‘тепле літечко’ and omits ‘бідне’.",
        "text": """Стоїть гора високая,
По-під горою гай,
Зелений гай, густесенький,
Неначе справді рай.

Під гаєм вьється річенька,
Як скло, вода блищить;
Долиною зеленою
Кудись вона біжить.

Край берега, у затишку,
Привьязані човни;
А три верби схилилися,
Мов журяться вони,

Що пройде любе літечко,
Повіють холода,
Осипеться їх листячко,
І понесе вода.

Журюся й я над річкою...
Біжить вона, шумить,
А в мене бідне серденько
І мліє, і болить.

Ой, річечко, голубонько!
Як хвилечки твої,
Пробігли дні щасливії
І радощі мої...

До тебе, люба річенько,
Ще вернеться весна;
А молодість, не вернеться...
Не вернеться вона!..

Стоїть гора високая,
Зелений гай шумить;
Пташки співають голосно,
І річечка блищить.

Як хороше, як весело
На білім світі жить!..
Чого ж у мене серденько
І мліє, і болить?

Болить воно та журиться,
Що вернеться весна,
А молодість... не вернеться,
Не вернеться вона!..""",
    },
    {
        "id": "starytskyi-1908-vyklyk", "title": "Виклик · Ніч яка місячна", "display": "The Summons · Moonlit Night",
        "author": ("Mykhailo Starytskyi", "Михайло Старицький", "mykhailo-starytskyi", "1840–1904"),
        "file": MUSE.format(issue=4), "pages": [(19, 1133401)], "year": 1908,
        "collection": "Ukrainska Muza · 1908", "printed": "issue 4, printed pages 369–370",
        "note": "The historical printing reads ‘місяшна’ in the first line; the familiar modern spelling is ‘місячна’, added to the title for discovery. The poem is separately titled ‘Виклик’ in the 1922 Struny comparison.",
        "text": """Ніч яка, Господи, місяшна, зоряна!
Ясно, хоч голки збірай.
Вийди, коханая, працею зморена
Хоч на хвилиночку в гай!
Сядемо вкупі ми тут під калиною —
І над панами я пан!
Глянь, моя рибонько, — хвилею срібною
Стелеться полем туман.
Гай чарівний, ніби промінем всипаний,
Чи загадався, чи спить;
Он, на стрункій та високій осичині
Листя жагою тремтить.
Небо незміряне всипане зорями, —
Що то за Божа краса!
Перлами ясними он, під тополями,
Грає краплиста роса.
Ти не лякайся-бо, що свої ніженьки
Вмочиш у срібну росу:
Я тебе, вірная, аж до хатиноньки
Сам на руках однесу.
Ти не лякайся, що змерзнеш, лебедонько
Тепло, — ні вітру, ні хмар...
Я пригорну тебе щиро до серденька,
А воно гріє, як жар.
Ти не лякайся, щоб злоба підслухала
Тиху розмову твою:
Нічка приспала всіх, соном окутала, —
Ані шелесне в гаю!
Сплять вороги твої, знужені працею, —
Нас не сполохає сміх...
Чи ж нам, окраденим долею нашою,
Й хвиля кохання — за гріх?!""",
    },
]


def records():
    result = []
    for reading in READINGS:
        author, original, author_id, years = reading["author"]
        first_page, first_revision = reading["pages"][0]
        revisions = [wiki_page(reading["file"], page, revision) for page, revision in reading["pages"]]
        printed_year = reading["year"]
        result.append({
            "id": reading["id"], "title": reading["title"], "displayTitle": reading["display"],
            "author": author, "authorOriginal": original, "authorId": author_id, "authorYears": years,
            "country": "Ukraine", "language": "Ukrainian", "lang": "uk", "direction": "ltr",
            "year": printed_year, "yearLabel": "Printed in 1908" if printed_year else "Title page 1892; also dated 1893",
            "era": "19th century", "form": "Lyric",
            "collection": reading["collection"], "themes": [], "mood": "paper",
            "context": (f"This complete reading follows {reading['printed']}. The credited Ukrainian Wikisource page "
                        "transcription was compared with the scan; historical spellings are retained, while spacing, "
                        f"indentation and punctuation may be normalized. {reading['note']} Ukraine is an associated "
                        "place, not a claim about composition; the date identifies the printing."),
            "sourceTitle": f"{reading['collection']} · {reading['printed']}",
            "source": commons(reading["file"], first_page),
            "contextSourceTitle": f"Ukrainian Wikisource · page transcription revision {first_revision}",
            "contextSource": revisions[0],
            "rights": ("Historical Ukrainian original in a pre-1931 printing; public domain in the United States. "
                       "Page transcription adapted from Ukrainian Wikisource contributors under CC BY-SA 4.0 "
                       "(https://creativecommons.org/licenses/by-sa/4.0/); contributor histories: "
                       + "; ".join(revisions) + ". Copyright and moral rights vary; check local law. Scan linked, not republished."),
            "text": reading["text"], "translations": [],
        })
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify the committed output without writing")
    parser.add_argument("--evidence-dir", type=Path, help="also verify the linked scan witnesses")
    args = parser.parse_args()
    if args.evidence_dir:
        for name, expected in EVIDENCE.items():
            if hashlib.sha256((args.evidence_dir / name).read_bytes()).hexdigest() != expected:
                raise SystemExit(f"Evidence hash mismatch: {name}")
    readings = records()
    result = json.dumps(readings, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf-8") != result:
            raise SystemExit(f"Generated records differ from {OUTPUT}")
        print(f"Verified {len(readings)} readings" + (" and four scan witnesses." if args.evidence_dir else "."))
    else:
        OUTPUT.write_text(result, encoding="utf-8")
        print(f"Wrote {len(readings)} readings.")


if __name__ == "__main__":
    main()

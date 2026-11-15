#!/usr/bin/env python3
"""Reproduce a small, manually collated selection of historical readings."""

import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "content/poems/international-scan-classics.json"
RUSSIAN_SCAN = (
    "https://archive.org/download/semeonoff-tillyard__russian_poetry_reader/"
    "Semeonoff%20A.%20E.%2C%20Tillyard%20J.%20H.%20J.%20W.%20%28eds.%29%20%20"
    "Russian%20poetry%20reader.pdf"
)
CHINESE_SCAN = "https://archive.org/download/chineseclassics41legg_0/chineseclassics41legg_0.pdf"
GERMAN_SCAN = "https://archive.org/download/germanlyricsball00harfuoft/germanlyricsball00harfuoft.pdf"
EVIDENCE = {
    "russian-poetry-reader-1917.pdf": "1f8ffe27d59321f6271e21b5c34b5a70435917cfc550b75372ef50d96b59a5f5",
    "shijing-legge-vol4pt1.pdf": "34fa5ac39b5a620b9427e6a0854e347d5c96fb5ac277f2bae70e69ebcd29af3f",
    "german-lyrics-1900.pdf": "decb6728e5df73b1c9d625a174c05dc55070e05b09d6069f4219dbb54f824e5c",
}

AUTHORS = {
    "pushkin": ("Alexander Pushkin", "Александр Сергеевич Пушкин", "alexander-pushkin", "1799–1837"),
    "lermontov": ("Mikhail Lermontov", "Михаил Юрьевич Лермонтов", "mikhail-lermontov", "1814–1841"),
    "nekrasov": ("Nikolai Nekrasov", "Николай Алексеевич Некрасов", "nikolai-nekrasov", "1821–1878"),
}

# The English titles are editorial discovery labels; the Russian text below is
# transcribed from the 1917 pages, not copied from the comparison editions.
RUSSIAN = [
    ("pushkin", "winter-evening", "Зимний вечер", "Winter Evening", 23, "Зимний вечер (Пушкин)", 5322626, "The anthology prints ‘путник запоздалой’; the comparison has ‘путник запоздалый’.", """Буря мглою небо кроет,
Вихри снежные крутя:
То как зверь она завоет,
То заплачет, как дитя,
То по кровле обветшалой
Вдруг соломой зашумит,
То как путник запоздалой
К нам в окошко застучит.

Наша ветхая лачужка
И печальна, и темна.
Что же ты, моя старушка,
Приумолкла у окна?
Или бури завываньем
Ты, мой друг, утомлена,
Или дремлешь под жужжаньем
Своего веретена?

Выпьем, добрая подружка
Бедной юности моей,
Выпьем с горя; где же кружка?
Сердцу будет веселей.
Спой мне песню как синица
Тихо за морем жила;
Спой мне песню, как девица
За водой поутру шла.

Буря мглою небо кроет,
Вихри снежные крутя:
То как зверь она завоет,
То заплачет как дитя.
Выпьем, добрая подружка
Бедной юности моей,
Выпьем с горя; где же кружка?
Сердцу будет веселей."""),
    ("pushkin", "the-cloud", "Туча", "The Cloud", 26, "Туча (Пушкин)", 4806053, "", """Последняя туча рассеянной бури!
Одна ты несёшься по ясной лазури,
Одна ты наводишь унылую тень,
Одна ты печалишь ликующий день.

Ты небо недавно кругом облегала,
И молния грозно тебя обвивала;
И ты издавала таинственный гром,
И алчную землю поила дождём.

Довольно, сокройся! Пора миновалась,
Земля освежилась и буря промчалась,
И ветер, лаская листочки древес,
Тебя с успокоенных гонит небес."""),
    ("pushkin", "monument", "Памятник", "The Monument", 27, "Я памятник себе воздвиг нерукотворный (Пушкин)", 5057376, "The Latin epigraph ‘Exegi monumentum’ is printed above the poem, not counted as verse. Pushkin’s distinct Russian imitation draws on Horace and earlier Russian monument poems, rather than being a literal translation. The linked comparison has ‘не страшась’, ‘приемли’ and ‘не оспоривай’; the anthology reads ‘не страшись’, ‘приемля’ and ‘не оспаривай’.", """Я памятник себе воздвиг нерукотворный;
К нему не заростёт народная тропа;
Вознёсся выше он главою непокорной
Александрийского столпа.

Нет! весь я не умру! Душа в заветной лире
Мой прах переживёт и тленья убежит —
И славен буду я, доколь в подлунном мире
Жив будет хоть один пиит.

Слух обо мне пройдёт по всей Руси великой,
И назовёт меня всяк сущий в ней язык:
И гордый внук славян, и финн, и ныне дикой
Тунгуз, и друг степей калмык.

И долго буду тем любезен я народу,
Что чувства добрые я лирой пробуждал,
Что в мой жестокий век восславил я свободу,
И милость к падшим призывал.

Веленью Божию, о муза, будь послушна,
Обиды не страшись, не требуя венца;
Хвалу и клевету приемля равнодушно,
И не оспаривай глупца."""),
    ("lermontov", "the-angel", "Ангел", "The Angel", 28, "Ангел (Лермонтов)", 5083937, "The 1917 reading has ‘песни’ and ‘Остался без слов’; the comparison has ‘песни’ and punctuates the latter phrase differently.", """По небу полуночи ангел летел
И тихую песню он пел;
И месяц, и звёзды, и тучи толпой
Внимали той песне святой.

Он пел о блаженстве безгрешных духов
Под кущами райских садов,
О Боге великом он пел — и хвала
Его непритворна была.

Он душу младую в объятиях нёс
Для мира печали и слёз,
И звук его песни в душе молодой
Остался без слов, но живой.

И долго на свете томилась она,
Желанием чудным полна,
И звуков небес заменить не могли
Ей скучные песни земли."""),
    ("lermontov", "the-sail", "Парус", "The Sail", 29, "Парус (Лермонтов)", 5148434, "The anthology prints ‘одинокий’ and ‘скрипит’; the comparison reads ‘одинокой’ and ‘скрыпит’.", """Белеет парус одинокий
В тумане моря голубом...
Что ищет он в стране далёкой?
Что кинул он в краю родном?

Играют волны; ветер свищет
И мачта гнётся и скрипит...
Увы! он счастия не ищет!
И не от счастия бежит!

Под ним струя светлей лазури,
Над ним луч солнца золотой;
А он, мятежный, просит бури,
Как будто в бурях есть покой!"""),
    ("lermontov", "prayer", "Молитва", "Prayer", 29, "Молитва (В минуту жизни трудную — Лермонтов)", 5634860, "The anthology prints ‘созвучьи’ and ‘сомнение’; the comparison has ‘созвучье’ and ‘сомненье’. The opening line identifies this particular ‘Молитва’, not another work of the same title.", """В минуту жизни трудную,
Теснится ль в сердце грусть;
Одну молитву чудную
Твержу я наизусть.

Есть сила благодатная
В созвучьи слов живых,
И дышит непонятная
Святая прелесть в них.

С души как бремя скатится,
Сомнение далеко —
И верится, и плачется,
И так легко, легко..."""),
    ("lermontov", "alone-on-the-road", "Выхожу один я на дорогу", "I Go Out Alone on the Road", 31, "Выхожу один я на дорогу (Лермонтов)/ОЗ 1843 (ВТ)", 5619609, "The 1917 anthology prints ‘Я ищу’, ‘навеки так заснуть’ and ‘дремали’; the linked 1843 comparison has ‘И ищу’, ‘на веки там заснуть’ and ‘дрожали’. The anthology has no stanza spaces here; four-line groupings are editorial.", """Выхожу один я на дорогу:
Сквозь туман кремнистый путь блестит;
Ночь тиха, пустыня внемлет Богу,
И звезда с звездою говорит.

В небесах торжественно и чудно!
Спит земля в сиянье голубом...
Что же мне так больно и так трудно:
Жду ль чего? жалею ли о чём?

Уж не жду от жизни ничего я,
И не жаль мне прошлого ничуть;
Я ищу свободы и покоя;
Я б хотел забыться и заснуть...

Но не тем холодным сном могилы —
Я б желал навеки так заснуть,
Чтоб в груди дремали жизни силы,
Чтоб, дыша, вздымалась тихо грудь,

Чтоб всю ночь, весь день мой слух лелея,
Про любовь мне сладкий голос пел;
Надо мной чтоб, вечно зеленея,
Тёмный дуб склонялся и шумел."""),
    ("lermontov", "the-clouds", "Тучи", "The Clouds", 32, "Тучи (Лермонтов)", 4806058, "", """Тучки небесные, вечные странники!
Степью лазурною, цепью жемчужною
Мчитесь вы, будто как я же, изгнанники
С милого севера в сторону южную.

Кто же вас гонит: судьбы ли решение?
Зависть ли тайная? злоба ль открытая?
Или на вас тяготит преступление?
Или друзей клевета ядовитая?

Нет, вам наскучили нивы бесплодные...
Чужды вам страсти и чужды страдания;
Вечно холодные, вечно свободные,
Нет у вас родины, нет вам изгнания."""),
    ("nekrasov", "schoolboy", "Школьник", "The Schoolboy", 40, "Школьник (Некрасов)", 4807453, "The 1917 anthology reads ‘Скоро ты узнаешь’, ‘Тут уж’ and ‘пустых’; the comparison has ‘Скоро сам узнаешь’, ‘Там уж’ and ‘тупых’.", """— Ну, пошёл же, ради Бога! —
Небо, ельник и песок —
Не весёлая дорога...
— Эй! садись ко мне, дружок! —

Ноги босы, грязно тело
И едва прикрыта грудь...
Не стыдися! что за дело?
Это многих славных путь.

Вижу я в котомке книжку.
Так учиться ты идёшь...
Знаю: батька на сынишку
Издержал последний грош.

Знаю, старая дьячиха
Отдала четвертачёк,
Что проезжая купчиха
Подарила на чаёк.

Или, может, ты дворовый
Из отпущенных!... Ну что-ж!
Случай тоже уж не новый —
Не робей, не пропадёшь!...

Скоро ты узнаешь в школе
Как архангельский мужик
По своей и Божьей воле
Стал разумен и велик.

Не без добрых душ на свете —
Кто нибудь свезёт в Москву,
Будешь в университете —
Сон свершится на яву!

Тут уж поприще широко:
Знай работай да не трусь...
Вот за что тебя глубоко
Я люблю, родная Русь!

Не бездарна та природа,
Не погиб ещё тот край,
Что выводит из народа
Столько славных то-и-знай —

Столько добрых, благородных,
Сильных любящей душой,
Посреди пустых, холодных
И напыщенных собой!"""),
    ("nekrasov", "forgive", "Прости", "Forgive", 42, "Прости (Некрасов)", 4802856, "", """Прости! Не помни дней паденья,
Тоски, унынья, озлобленья —
Не помни бурь, не помни слёз,
Не помни ревности угроз!

Но дни, когда любви светило
Над нами ласково всходило,
И бодро мы свершали путь —
Благослови и не забудь!"""),
    ("nekrasov", "hearing-the-horrors-of-war", "Внимая ужасам войны", "Hearing the Horrors of War", 42, "Внимая ужасам войны (Некрасов)", 4791068, "", """Внимая ужасам войны,
При каждой новой жертве боя,
Мне жаль не друга, не жены,
Мне жаль не самого героя...
Увы! утешится жена
И друга лучший друг забудет;
Но где-то есть душа одна —
Она до гроба помнить будет!
Средь лицемерных наших дел
И всякой пошлости и прозы
Одни я в мире подсмотрел
Святые, искренние слёзы —
То слёзы бедных матерей!
Им не забыть своих детей,
Погибших на кровавой ниве,
Как не поднять плакучей иве
Своих поникнувших ветвей..."""),
]

ANGEL_ENGLISH = """Through the heavens of midnight an angel was sped
Who lifted his chant as he fled.
The moon and the clouds and the stars leaned to hear
The song rising holy and clear.

He sang of the spirits, the sinless, the blest,
Who softly in Paradise rest.
Of the gardens of God, and of God was his song,
Ringing true as a heavenly gong.

He bore a young soul to the dark gates of birth,
Toward the travailing, sorrowful earth.
And flying, he sang, and the eager soul heard
The deathless, the unuttered Word.

And the years in the world could but sadden and tire
The soul filled with wondrous desire.
And vainly the dull songs of earth would have stilled
The song wherewith heaven had thrilled."""


def wiki_url(language, title, revision):
    return f"https://{language}.wikisource.org/w/index.php?title={quote(title.replace(' ', '_'))}&oldid={revision}"


def russian_records():
    records = []
    for author_key, slug, title, display, page, comparison, revision, variation, text in RUSSIAN:
        author, native, author_id, years = AUTHORS[author_key]
        record = {
            "id": f"{author_key}-1917-{slug}", "title": title, "displayTitle": display,
            "author": author, "authorOriginal": native, "authorId": author_id, "authorYears": years,
            "country": "Russia", "language": "Russian", "lang": "ru", "direction": "ltr",
            "year": 1917, "yearLabel": "Printed in 1917", "era": "19th century", "form": "Lyric",
            "collection": "Russian Poetry Reader · 1917", "themes": [], "mood": "paper",
            "context": ("This complete reading follows Semeonoff and Tillyard’s Russian Poetry Reader (1917), "
                        f"starting on PDF page {page}. Pre-1918 letters and endings are modernized and pedagogical "
                        "stress marks are removed; some historical spellings remain. Punctuation, spacing and indentation "
                        "are normalized. The linked Russian "
                        "Wikisource edition is a comparison, not the source of this transcription. "
                        f"{variation} "
                        "The printing year and associated country do not establish composition date or place. "
                        "The PDF may download rather than open in the browser.").replace("  ", " "),
            "sourceTitle": f"Russian Poetry Reader (1917) · PDF page {page}",
            "source": f"{RUSSIAN_SCAN}#page={page}",
            "contextSourceTitle": f"Russian Wikisource · comparison revision {revision}",
            "contextSource": wiki_url("ru", comparison, revision),
            "rights": ("Russian original as printed in 1917; public domain in the United States. "
                       "Scans are linked, not republished; copyright and moral rights vary elsewhere, so check local law."),
            "text": text, "translations": [],
        }
        if slug == "the-angel":
            record["translations"] = [{
                "language": "English", "title": "The Angel",
                "translator": "Babette Deutsch and Avrahm Yarmolinsky · 1921",
                "source": "https://commons.wikimedia.org/wiki/File:Modern_Russian_Poetry.djvu?page=44",
                "rights": ("Translation published in Modern Russian Poetry (1921); public domain in the United States. "
                           "Deutsch died in 1982 and Yarmolinsky in 1975, so copyright may persist elsewhere; check local law. "
                           "This is a literary interpretation, not a literal translation: ‘heavenly gong’ and ‘unuttered Word’ elaborate the original."),
                "text": ANGEL_ENGLISH,
            }]
        records.append(record)
    return records


CHINESE = [
    ("guan-ju", "關雎", "Guan Ju", 205, 12232994, "詩經/關雎", "", """關關雎鳩，在河之洲。
窈窕淑女，君子好逑。

參差荇菜，左右流之。
窈窕淑女，寤寐求之。
求之不得，寤寐思服。
悠哉悠哉，輾轉反側。

參差荇菜，左右采之。
窈窕淑女，琴瑟友之。
參差荇菜，左右芼之。
窈窕淑女，鐘鼓樂之。""", """Kwan-kwan go the ospreys,
On the islet in the river.
The modest, retiring, virtuous, young lady:—
For our prince a good mate she.

Here long, there short, is the duckweed,
To the left, to the right, borne about by the current.
The modest, retiring, virtuous, young lady:—
Waking and sleeping, he sought her.
He sought her and found her not,
And waking and sleeping he thought about her.
Long he thought; oh! long and anxiously;
On his side, on his back, he turned, and back again.

Here long, there short, is the duckweed;
On the left, on the right, we gather it.
The modest, retiring, virtuous young lady:—
With lutes, small and large, let us give her friendly welcome.
Here long, there short, is the duckweed;
On the left, on the right, we cook and present it.
The modest, retiring, virtuous young lady:—
With bells and drums let us show our delight in her."""),
    ("jian-jia", "蒹葭", "Jian Jia", 399, 12232977, "詩經/蒹葭", "Legge’s Chinese text has ‘淒淒’; the comparison gives ‘萋萋’ with ‘淒淒’ as a variant.", """蒹葭蒼蒼，白露為霜。
所謂伊人，在水一方。
溯洄從之，道阻且長。
溯游從之，宛在水中央。

蒹葭淒淒，白露未晞。
所謂伊人，在水之湄。
溯洄從之，道阻且躋。
溯游從之，宛在水中坻。

蒹葭采采，白露未已。
所謂伊人，在水之涘。
溯洄從之，道阻且右。
溯游從之，宛在水中沚。""", """The reeds and rushes are deeply green,
And the white dew is turned into hoarfrost.
The man of whom I think
Is somewhere about the water.
I go up the stream in quest of him,
But the way is difficult and long.
I go down the stream in quest of him,
And lo! he is right in the midst of the water.

The reeds and rushes are luxuriant,
And the white dew is not yet dry.
The man of whom I think
Is on the margin of the water.
I go up the stream in quest of him,
But the way is difficult and steep.
I go down the stream in quest of him,
And lo! he is on the islet in the midst of the water.

The reeds and rushes are abundant,
And the white dew has not yet ceased.
The man of whom I think
Is on the bank of the river.
I go up the stream in quest of him,
But the way is difficult and turns to the right.
I go down the stream in quest of him,
And lo! he is on the island in the midst of the water."""),
]


def chinese_records():
    records = []
    for slug, title, display, page, revision, comparison, variation, text, english in CHINESE:
        records.append({
            "id": f"shijing-1871-{slug}", "title": title, "displayTitle": display,
            "author": "Traditional / anonymous (Shijing)", "authorId": "traditional-anonymous-shijing",
            "anonymous": True, "authorYears": "Dates not established here", "country": "China",
            "language": "Chinese", "lang": "zh", "direction": "ltr", "year": 1871,
            "yearLabel": "Printed in 1871 · composition date not established", "era": "Date not established",
            "form": "Song", "collection": "Shijing · Legge, 1871", "themes": [], "mood": "paper",
            "context": ("This is one complete, separately numbered ode in James Legge’s bilingual 1871 She King, "
                        f"beginning on PDF page {page}. The Chinese and English were transcribed from the scan; "
                        "horizontal line breaks and Chinese punctuation are editorial. The linked Chinese Wikisource "
                        "page is a comparison, not the source transcription. "
                        f"{variation} Authorship and exact composition date and place are not established here; "
                        "China is an associated place. The PDF may download rather than open in the browser.").replace("  ", " "),
            "sourceTitle": f"Legge · The Chinese Classics, vol. IV, part I (1871) · PDF page {page}",
            "source": f"{CHINESE_SCAN}#page={page}",
            "contextSourceTitle": f"Chinese Wikisource · comparison revision {revision}",
            "contextSource": wiki_url("zh", comparison, revision),
            "rights": ("Historical Chinese original as printed in 1871; public domain in the United States. "
                       "The scan is linked, not republished; copyright and moral rights vary elsewhere, so check local law."),
            "text": text,
            "translations": [{
                "language": "English", "title": f"{display} · Legge’s 1871 version",
                "translator": "James Legge · 1871", "source": f"{CHINESE_SCAN}#page={page}",
                "rights": ("Legge’s English version was published in 1871 and is public domain in the United States; "
                           "check local law. It is a historical interpretation, not a certified literal translation. "
                           "Its gender and social roles reflect Legge’s interpretation."),
                "text": english,
            }],
        })
    return records


ERLKOENIG = """Wer reitet so spät durch Nacht und Wind?
Es ist der Vater mit seinem Kind;
Er hat den Knaben wohl in dem Arm,
Er faßt ihn sicher, er hält ihn warm.

„Mein Sohn, was birgst du so bang dein Gesicht?“ —
„Siehst, Vater, du den Erlkönig nicht?
Den Erlenkönig mit Kron’ und Schweif?“ —
„Mein Sohn, es ist ein Nebelstreif.“ —

„Du liebes Kind, komm, geh mit mir!
Gar schöne Spiele spiel’ ich mit dir;
Manch bunte Blumen sind an dem Strand;
Meine Mutter hat manch gülden Gewand.“

„Mein Vater, mein Vater, und hörest du nicht,
Was Erlenkönig mir leise verspricht?“ —
„Sei ruhig, bleibe ruhig, mein Kind;
In dürren Blättern säuselt der Wind.“ —

„Willst, feiner Knabe, du mit mir gehn?
Meine Töchter sollen dich warten schön;
Meine Töchter führen den nächtlichen Reihn
Und wiegen und tanzen und singen dich ein.“

„Mein Vater, mein Vater, und siehst du nicht dort
Erlkönigs Töchter am düstern Ort?“ —
„Mein Sohn, mein Sohn, ich seh’ es genau:
Es scheinen die alten Weiden so grau.“ —

„Ich liebe dich, mich reizt deine schöne Gestalt;
Und bist du nicht willig, so brauch’ ich Gewalt.“
„Mein Vater, mein Vater, jetzt faßt er mich an!
Erlkönig hat mir ein Leids gethan!“ —

Dem Vater grauset’s, er reitet geschwind,
Er hält in Armen das ächzende Kind,
Erreicht den Hof mit Mühe und Not;
In seinen Armen das Kind war tot."""


def german_record():
    return {
        "id": "goethe-1900-erlkoenig", "title": "Erlkönig", "author": "Johann Wolfgang von Goethe",
        "authorId": "johann-wolfgang-von-goethe", "authorYears": "1749–1832", "country": "Germany",
        "language": "German", "lang": "de", "direction": "ltr", "year": 1900,
        "yearLabel": "Printed in 1900", "era": "18th century", "form": "Ballad",
        "collection": "German Lyrics and Ballads · 1900", "themes": [], "mood": "paper",
        "context": ("The complete ballad follows James Taft Hatfield’s German Lyrics and Ballads (1900), "
                    "printed pages 49–50 (PDF pages 83–84). Historical spelling is retained, while quotation "
                    "marks and spacing are normalized. The print has ‘gethan’; the linked German Wikisource "
                    "comparison has ‘getan’. The printing year and Germany as associated country do not establish "
                    "composition date or place. The PDF may download rather than open in the browser."),
        "sourceTitle": "Hatfield · German Lyrics and Ballads (1900) · PDF pages 83–84",
        "source": f"{GERMAN_SCAN}#page=83",
        "contextSourceTitle": "German Wikisource · comparison revision 3778237",
        "contextSource": wiki_url("de", "Erlkönig", 3778237),
        "rights": ("German original as printed in 1900; public domain in the United States. "
                   "The scan is linked, not republished; copyright and moral rights vary elsewhere, so check local law."),
        "text": ERLKOENIG, "translations": [],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify the committed output without writing")
    parser.add_argument("--evidence-dir", type=Path, help="also verify the three linked PDF witnesses")
    args = parser.parse_args()
    if args.evidence_dir:
        for name, expected in EVIDENCE.items():
            actual = hashlib.sha256((args.evidence_dir / name).read_bytes()).hexdigest()
            if actual != expected:
                raise SystemExit(f"Evidence hash mismatch: {name}")
    records = [*russian_records(), *chinese_records(), german_record()]
    result = json.dumps(records, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf-8") != result:
            raise SystemExit(f"Generated records differ from {OUTPUT}")
        print(f"Verified {len(records)} readings" + (" and three PDF witnesses." if args.evidence_dir else "."))
    else:
        OUTPUT.write_text(result, encoding="utf-8")
        print(f"Wrote {len(records)} readings.")


if __name__ == "__main__":
    main()

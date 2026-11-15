#!/usr/bin/env python3
"""Reproduce selected, scan-checked international readings and their credits."""

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "content/poems/recognized-international.json"
SNAPSHOT = ROOT / "scripts/sources/recognized-international-revisions.json"
SNAPSHOT_SHA256 = "02cfe890aa0d1365981d07aa9561e5e46084801574fbf5393b043b60b472f1a4"

# These are the exact page images inspected, not guarantees of correctness.
EVIDENCE = {
    "verlaine-poemes-saturniens-041.jpg": "a9b88e04e169cff804a81fda40b1f11e1faddbe2bad1d86228597a4ce04d4e3f",
    "verlaine-poemes-saturniens-042.jpg": "a1c90ecf4ba3818c66a2977f6b6f855c1825e0dd63ad61c77e278171e95c6629",
    "verlaine-poemes-saturniens-075.jpg": "1e08f3c01cfcb44f0618b44c64be91cd2d55142d11253deebeefcdb7bb60949a",
    "verlaine-poemes-saturniens-076.jpg": "3ec09ab98dfb5f2217236a191a19337669304c0e10f3c79ac1f0775ffbc64693",
    "rilke-panther-1907.gif": "2a8eae57373e48c9696153b6e4ba0619773309b3769f8c51d8ad667ba0db000b",
    "rilke-torso-1918.gif": "510b83eddcf64e4df5c5776457aa16aa1bf623b4875ec297ff19fc7d89c1458c",
    "yeats-michael-robartes-1920-013.jpg": "600ac08c2df3071fa581d1cb90731ea69f7b3c9f0f3a791d1e90db35090fff76",
    "yeats-michael-robartes-1920-014.jpg": "e8681dd1d235c8a2f60136398eb1e2899bfaef93858915838de76c58eba194ad",
    "yeats-michael-robartes-1920-015.jpg": "012eba25ca30168e7aa8b160644629abb3304e332a25b0ab96ea88006615f10f",
    "yeats-michael-robartes-1920-023.jpg": "675b5f9063e575113320e2d2df2dcac74a4f1a80004300df17425498a483f045",
    "yeats-michael-robartes-1920-024.jpg": "dc2d10e91857664b25699368f3d05fed54c4b1fed2be8d5309d29be3de2fd259",
    "naidu-golden-threshold-1905-page-037.jpg": "025ab974af57521ac4ce6d086079a5083d6591898bd9f39e33b9791eef91bcae",
    "naidu-golden-threshold-1905-page-040.jpg": "d2fe00644f5bcbb1b1bacbeaafef79000c021e8256ddb8c7ce109c4a6b301a61",
    "naidu-golden-threshold-1905-page-041.jpg": "23b08f8c99f5ca6317fc36ca6a8b0e4ecb1cb38983d40148c9d865a65986174c",
    "naidu-golden-threshold-1905-page-042.jpg": "292814756cb1465c99506cd96292fed62671bdfa17d5ebf0b124db490b101837",
    "naidu-bird-of-time-1912-080.jpg": "5fd7c6cb25b56faeb1307e21e658e22d2d1338d4158a1459489791ef6ff655cd",
    "naidu-bird-of-time-1912-081.jpg": "616955d474faad57f73f2a1bab7dfc77d7f5c34dc2c908371a8291a9443caf6f",
    "tagore-gitanjali-1913-37.jpg": "15795d21f3402adfd1b53394c00a1dc314177628b7ecc9246b6cc4825498dd2e",
}

AUTHORS = {
    "verlaine": ("Paul Verlaine", "paul-verlaine", "1844–1896", "France", "French", "fr"),
    "rilke": ("Rainer Maria Rilke", "rainer-maria-rilke", "1875–1926", "Austria", "German", "de"),
    "yeats": ("William Butler Yeats", "william-butler-yeats", "1865–1939", "Ireland", "English", "en"),
    "naidu": ("Sarojini Naidu", "sarojini-naidu", "1879–1949", "India", "English", "en"),
    "tagore": ("Rabindranath Tagore", "rabindranath-tagore", "1861–1941", "India", "Bengali", "bn"),
}

VERLAINE = "Verlaine - Poèmes saturniens, Lemerre, 1866.djvu"
YEATS = "Michael Robartes and the Dancer (1920).djvu"
GOLDEN = "The Golden Threshold.djvu"
BIRD = "The Bird of Time (Naidu).djvu"
TAGORE = "গীতাঞ্জলি - রবীন্দ্রনাথ ঠাকুর.djvu"


def wiki_url(language, title, revision):
    return f"https://{language}.wikisource.org/w/index.php?title={quote(title.replace(' ', '_'), safe='')}&oldid={revision}"


def scan_url(filename, page=None):
    url = "https://commons.wikimedia.org/wiki/File:" + quote(filename.replace(" ", "_"), safe="")
    return url + (f"?page={page}" if page is not None else "")


def page_refs(filename, revisions):
    return [(f"Page:{filename}/{page}", revision) for page, revision in revisions]


# Readings adapt the pinned contributors' transcriptions; the scan images were
# checked for boundaries and wording. Indentation and some typography are normalized.
WORKS = [
    {
        "id": "recognized-verlaine-mon-reve-familier", "author": "verlaine", "title": "Mon rêve familier",
        "year": None, "yearLabel": "Title page 1866 · cover 1867", "era": "19th century", "form": "Sonnet",
        "collection": "Poèmes saturniens", "scan": scan_url(VERLAINE, 41),
        "pages": page_refs(VERLAINE, [(41, 9931414), (42, 9931416)]), "lines": 14,
        "detail": "The title page says 1866, while the cover says 1867; this record does not resolve that conflict.",
        "text": """Je fais souvent ce rêve étrange et pénétrant
D’une femme inconnue, et que j’aime, et qui m’aime,
Et qui n’est, chaque fois, ni tout à fait la même
Ni tout à fait une autre, et m’aime et me comprend.

Car elle me comprend, et mon cœur, transparent
Pour elle seule, hélas ! cesse d’être un problème
Pour elle seule, et les moiteurs de mon front blême,
Elle seule les sait rafraîchir, en pleurant.

Est-elle brune, blonde ou rousse ? — Je l’ignore.
Son nom ? Je me souviens qu’il est doux et sonore
Comme ceux des aimés que la Vie exila.

Son regard est pareil au regard des statues,
Et, pour sa voix, lointaine, et calme, et grave, elle a
L’inflexion des voix chères qui se sont tues.""",
    },
    {
        "id": "recognized-verlaine-chanson-dautomne", "author": "verlaine", "title": "Chanson d’automne",
        "year": None, "yearLabel": "Title page 1866 · cover 1867", "era": "19th century", "form": "Lyric",
        "collection": "Poèmes saturniens", "scan": scan_url(VERLAINE, 75),
        "pages": page_refs(VERLAINE, [(75, 12871203), (76, 12871204)]), "lines": 18,
        "detail": "The title page says 1866, while the cover says 1867; this record does not resolve that conflict.",
        "text": """Les sanglots longs
Des violons
De l’automne
Blessent mon cœur
D’une langueur
Monotone.

Tout suffocant
Et blême, quand
Sonne l’heure,
Je me souviens
Des jours anciens
Et je pleure ;

Et je m’en vais
Au vent mauvais
Qui m’emporte
Deçà, delà,
Pareil à la
Feuille morte.""",
    },
    {
        "id": "recognized-rilke-der-panther", "author": "rilke", "title": "Der Panther",
        "year": 1907, "yearLabel": "Printed in 1907", "era": "20th century", "form": "Lyric",
        "collection": "Neue Gedichte · 1907", "scan": scan_url("Neue Gedichte (Rilke 1907) 037.gif"),
        "pages": [("Der Panther", 3502516)], "lines": 12,
        "detail": "The printed subtitle is ‘Im Jardin des Plantes, Paris’. Handwritten annotations on the scan are not part of the reading; punctuation and spacing are normalized.",
        "text": """Sein Blick ist vom Vorübergehn der Stäbe
so müd geworden, daß er nichts mehr hält.
Ihm ist, als ob es tausend Stäbe gäbe
und hinter tausend Stäben keine Welt.

Der weiche Gang geschmeidig starker Schritte,
der sich im allerkleinsten Kreise dreht,
ist wie ein Tanz von Kraft um eine Mitte,
in der betäubt ein großer Wille steht.

Nur manchmal schiebt der Vorhang der Pupille
sich lautlos auf –. Dann geht ein Bild hinein,
geht durch der Glieder angespannte Stille –
und hört im Herzen auf zu sein.""",
    },
    {
        "id": "recognized-rilke-torso-apollos", "author": "rilke", "title": "Archaïscher Torso Apollos",
        "year": 1918, "yearLabel": "Printed in 1918", "era": "20th century", "form": "Sonnet",
        "collection": "Der neuen Gedichte anderer Teil · 1918", "scan": scan_url("De Rilke Gedichte 1918 001.gif"),
        "pages": [("Archaïscher Torso Apollos", 3946901)], "lines": 14,
        "detail": "The selected witness is the 1918 printing, not the first appearance of the poem.",
        "text": """Wir kannten nicht sein unerhörtes Haupt,
darin die Augenäpfel reiften. Aber
sein Torso glüht noch wie ein Kandelaber,
in dem sein Schauen, nur zurückgeschraubt,

sich hält und glänzt. Sonst könnte nicht der Bug
der Brust dich blenden, und im leisen Drehen
der Lenden könnte nicht ein Lächeln gehen
zu jener Mitte, die die Zeugung trug.

Sonst stünde dieser Stein entstellt und kurz
unter der Schultern durchsichtigem Sturz
und flimmerte nicht so wie Raubtierfelle;

und bräche nicht aus allen seinen Rändern
aus wie ein Stern: denn da ist keine Stelle,
die dich nicht sieht. Du mußt dein Leben ändern.""",
    },
    {
        "id": "recognized-yeats-second-coming", "author": "yeats", "title": "The Second Coming",
        "year": 1920, "yearLabel": "1920 imprint · publication also dated 1921", "era": "20th century", "form": "Lyric",
        "collection": "Michael Robartes and the Dancer · Cuala", "scan": scan_url(YEATS, 23),
        "pages": page_refs(YEATS, [(23, 14361859), (24, 14361860)]), "lines": 22,
        "detail": "The Cuala title page bears a 1920 imprint; publication histories also date the collection to 1921. The poem starts after one work and ends before another across these pages. This printing has ‘a waste of desert sand’ and ‘Wind shadows’; another circulated reading has ‘somewhere in sands of the desert’ and ‘Reel shadows’.",
        "text": """Turning and turning in the widening gyre
The falcon cannot hear the falconer;
Things fall apart; the centre cannot hold;
Mere anarchy is loosed upon the world,
The blood-dimmed tide is loosed, and everywhere
The ceremony of innocence is drowned;
The best lack all conviction, while the worst
Are full of passionate intensity.

Surely some revelation is at hand;
Surely the Second Coming is at hand.
The Second Coming! Hardly are those words out
When a vast image out of Spiritus Mundi
Troubles my sight: a waste of desert sand;
A shape with lion body and the head of a man,
A gaze blank and pitiless as the sun,
Is moving its slow thighs, while all about it
Wind shadows of the indignant desert birds.
The darkness drops again but now I know
That twenty centuries of stony sleep
Were vexed to nightmare by a rocking cradle,
And what rough beast, its hour come round at last,
Slouches towards Bethlehem to be born?""",
    },
    {
        "id": "recognized-yeats-easter-1916", "author": "yeats", "title": "Easter, 1916",
        "year": 1920, "yearLabel": "1920 imprint · publication also dated 1921", "era": "20th century", "form": "Lyric",
        "collection": "Michael Robartes and the Dancer · Cuala", "scan": scan_url(YEATS, 13),
        "pages": page_refs(YEATS, [(13, 11874196), (14, 14361875), (15, 14361876)]), "lines": 80,
        "detail": "The Cuala title page bears a 1920 imprint; publication histories also date the collection to 1921. The printed date ‘September 25th, 1916’ follows the verse and is not counted as a line.",
        "text": """I have met them at close of day
Coming with vivid faces
From counter or desk among grey
Eighteenth-century houses.
I have passed with a nod of the head
Or polite meaningless words,
Or have lingered awhile and said
Polite meaningless words,
And thought before I had done
Of a mocking tale or a gibe
To please a companion
Around the fire at the club,
Being certain that they and I
But lived where motley is worn:
All changed, changed utterly:
A terrible beauty is born.

That woman’s days were spent
In ignorant good will,
Her nights in argument
Until her voice grew shrill.
What voice more sweet than hers
When young and beautiful,
She rode to harriers?
This man had kept a school
And rode our winged horse.
This other his helper and friend
Was coming into his force;
He might have won fame in the end,
So sensitive his nature seemed,
So daring and sweet his thought.
This other man I had dreamed
A drunken, vain-glorious lout.
He had done most bitter wrong
To some who are near my heart,
Yet I number him in the song;
He, too, has resigned his part
In the casual comedy;
He, too, has been changed in his turn,
Transformed utterly:
A terrible beauty is born.

Hearts with one purpose alone
Through summer and winter seem
Enchanted to a stone
To trouble the living stream.
The horse that comes from the road,
The rider, the birds that range
From cloud to tumbling cloud,
Minute by minute change;
A shadow of cloud on the stream
Changes minute by minute;
A horse-hoof slides on the brim,
And a horse plashes within it
Where long-legged moor-hens dive,
And hens to moor-cocks call.
Minute by minute they live:
The stone’s in the midst of all.

Too long a sacrifice
Can make a stone of the heart.
O when may it suffice?
That is heaven’s part, our part
To murmur name upon name,
As a mother names her child
When sleep at last has come
On limbs that had run wild.
What is it but nightfall?
No, no, not night but death;
Was it needless death after all?
For England may keep faith
For all that is done and said.
We know their dream; enough
To know they dreamed and are dead.
And what if excess of love
Bewildered them till they died?
I write it out in a verse—
MacDonagh and MacBride
And Connolly and Pearse
Now and in time to be,
Wherever green is worn,
Are changed, changed utterly:
A terrible beauty is born.""",
    },
    {
        "id": "recognized-naidu-palanquin-bearers", "author": "naidu", "title": "Palanquin-Bearers",
        "year": 1905, "yearLabel": "Printed in 1905", "era": "20th century", "form": "Lyric",
        "collection": "The Golden Threshold · 1905", "scan": scan_url(GOLDEN, 37),
        "pages": page_refs(GOLDEN, [(37, 8355905)]), "lines": 12,
        "detail": "The hanging continuations in the print are joined to their verse lines.",
        "text": """Lightly, O lightly we bear her along,
She sways like a flower in the wind of our song;
She skims like a bird on the foam of a stream,
She floats like a laugh from the lips of a dream.
Gaily, O gaily we glide and we sing,
We bear her along like a pearl on a string.

Softly, O softly we bear her along,
She hangs like a star in the dew of our song;
She springs like a beam on the brow of the tide,
She falls like a tear from the eyes of a bride.
Lightly, O lightly we glide and we sing,
We bear her along like a pearl on a string.""",
    },
    {
        "id": "recognized-naidu-indian-weavers", "author": "naidu", "title": "Indian Weavers",
        "year": 1905, "yearLabel": "Printed in 1905", "era": "20th century", "form": "Lyric",
        "collection": "The Golden Threshold · 1905", "scan": scan_url(GOLDEN, 40),
        "pages": page_refs(GOLDEN, [(40, 8355908)]), "lines": 12,
        "detail": "The scan prints a comma after ‘solemn and still’; the credited transcription has a period. This reading follows the scan.",
        "text": """Weavers, weaving at break of day,
Why do you weave a garment so gay? . . .
Blue as the wing of a halcyon wild,
We weave the robes of a new-born child.

Weavers, weaving at fall of night,
Why do you weave a garment so bright? . . .
Like the plumes of a peacock, purple and green,
We weave the marriage-veils of a queen.

Weavers, weaving solemn and still,
What do you weave in the moonlight chill? . . .
White as a feather and white as a cloud,
We weave a dead man's funeral shroud.""",
    },
    {
        "id": "recognized-naidu-coromandel-fishers", "author": "naidu", "title": "Coromandel Fishers",
        "year": 1905, "yearLabel": "Printed in 1905", "era": "20th century", "form": "Lyric",
        "collection": "The Golden Threshold · 1905", "scan": scan_url(GOLDEN, 41),
        "pages": page_refs(GOLDEN, [(41, 8355909), (42, 8355910)]), "lines": 12,
        "detail": "The scan prints ‘morning light,’; the credited transcription reads ‘morning lights’. This reading follows the scan. Hanging continuations are joined to their verse lines.",
        "text": """Rise, brothers, rise, the wakening skies pray to the morning light,
The wind lies asleep in the arms of the dawn like a child that has cried all night.
Come, let us gather our nets from the shore, and set our catamarans free,
To capture the leaping wealth of the tide, for we are the sons of the sea.

No longer delay, let us hasten away in the track of the sea-gull's call,
The sea is our mother, the cloud is our brother, the waves are our comrades all.
What though we toss at the fall of the sun where the hand of the sea-god drives?
He who holds the storm by the hair, will hide in his breast our lives.

Sweet is the shade of the cocoanut glade, and the scent of the mango grove,
And sweet are the sands at the full o' the moon with the sound of the voices we love.
But sweeter, O brothers, the kiss of the spray and the dance of the wild foam's glee:
Row, brothers, row to the blue of the verge, where the low sky mates with the sea.""",
    },
    {
        "id": "recognized-naidu-bangle-sellers", "author": "naidu", "title": "Bangle-sellers",
        "year": 1912, "yearLabel": "Printed in 1912", "era": "20th century", "form": "Lyric",
        "collection": "The Bird of Time · 1912", "scan": scan_url(BIRD, 80),
        "pages": page_refs(BIRD, [(80, 6835634), (81, 6835636)]), "lines": 24,
        "detail": "The four complete stanzas continue across the two printed pages.",
        "text": """Bangle-sellers are we who bear
Our shining loads to the temple fair. . . .
Who will buy these delicate, bright
Rainbow-tinted circles of light?
Lustrous tokens of radiant lives,
For happy daughters and happy wives.

Some are meet for a maiden's wrist,
Silver and blue as the mountain-mist,
Some are flushed like the buds that dream
On the tranquil brow of a woodland stream;
Some are aglow with the bloom that cleaves
To the limpid glory of new-born leaves.

Some are like fields of sunlit corn,
Meet for a bride on her bridal morn,
Some, like the flame of her marriage fire,
Or rich with the hue of her heart's desire,
Tinkling, luminous, tender, and clear,
Like her bridal laughter and bridal tear.

Some are purple and gold-flecked grey,
For her who has journeyed thro' life midway,
Whose hands have cherished, whose love has blest
And cradled fair sons on her faithful breast,
Who serves her household in fruitful pride,
And worships the gods at her husband's side.""",
    },
    {
        "id": "tagore-gitanjali-bengali-021", "author": "tagore", "title": "আজি ঝড়ের রাতে তোমার অভিসার",
        "year": None, "yearLabel": "Bengali year 1320 edition · 1913–1914", "era": "20th century", "form": "Song",
        "collection": "Gitanjali · Bengali third edition", "scan": scan_url(TAGORE, 37),
        "pages": [("পাতা:গীতাঞ্জলি - রবীন্দ্রনাথ ঠাকুর.djvu/৩৭", 1794751)], "lines": 14,
        "detail": "This is Bengali Gitanjali song 21; its opening line supplies the title. The separately printed date ‘আষাঢ় ১৩১৬’ is not verse. Tagore’s English Gitanjali no. 23 is a prose self-reworking of this song, not a separate work here; collection numbers do not generally correspond.",
        "text": """আজি ঝড়ের রাতে তোমার অভিসার
পরাণসখা বন্ধু হে আমার।

আকাশ কাঁদে হতাশ সম,
নাই যে ঘুম নয়নে মম,
দুয়ার খুলি, হে প্রিয়তম,
চাই যে বারে বার।
পরাণসখা বন্ধু হে আমার!

বাহিরে কিছু দেখিতে নাহি পাই,
তোমার পথ কোথায় ভাবি তাই।
সুদূর কোন্ নদীর পারে,
গহন কোন্ বনের ধারে,
গভীর কোন্ অন্ধকারে
হতেছ তুমি পার,
পরাণসখা বন্ধু হে আমার!""",
    },
]


def records():
    results = []
    for work in WORKS:
        author, author_id, years, country, language, lang = AUTHORS[work["author"]]
        refs = [wiki_url(lang, title, revision) for title, revision in work["pages"]]
        if len([line for line in work["text"].splitlines() if line.strip()]) != work["lines"]:
            raise ValueError(f"Unexpected line count: {work['id']}")
        context = (
            "This complete reading adapts the linked Wikisource contributors’ transcription, "
            "checked against the historical scan. Line breaks and stanzas are retained, with page breaks rejoined; "
            "indentation, spacing and some typography are normalized. "
            f"{work['detail']} {country} is an associated country, not a claim about composition place; "
            "a printing date is not necessarily a composition date."
        )
        record = {
            "id": work["id"], "title": work["title"], "author": author,
            "authorId": author_id, "authorYears": years, "country": country,
            "language": language, "lang": lang, "direction": "ltr", "year": work["year"],
            "yearLabel": work["yearLabel"], "era": work["era"], "form": work["form"],
            "collection": work["collection"], "themes": [], "mood": "paper", "context": context,
            "sourceTitle": f"{language} Wikisource contributors · revision {work['pages'][0][1]}",
            "source": refs[0], "contextSourceTitle": "Historical scan · first page of this reading",
            "contextSource": work["scan"],
            "rights": (
                "The original and historical printing are public domain in the United States. "
                f"Transcription adapted from {language} Wikisource contributors under CC BY-SA 4.0 "
                "(https://creativecommons.org/licenses/by-sa/4.0/); pinned contributor histories: "
                + "; ".join(refs) + ". Copyright and moral rights vary by jurisdiction; check local law. "
                "Scans are linked, not republished."
            ),
            "text": work["text"], "translations": [],
        }
        if work["author"] == "tagore":
            record["authorOriginal"] = "রবীন্দ্রনাথ ঠাকুর"
        results.append(record)
    if len({work["id"] for work in results}) != len(results) or len({work["text"] for work in results}) != len(results):
        raise ValueError("Duplicate ID or text in selection")
    return results


def extract_wikisource(work, page):
    """Extract only the reviewed page region, rejecting unfamiliar markup."""
    text = re.sub(r"<noinclude>.*?</noinclude>", "", page["content"], flags=re.DOTALL)
    if work["id"] == "recognized-yeats-second-coming":
        section = re.search(r'<section begin="The Second Coming"\s*/>(.*?)<section end="The Second Coming"\s*/>', text, re.DOTALL)
        if not section:
            raise ValueError(f"Missing Yeats section: {page['title']}")
        text = section.group(1)
    poem = re.search(r"<poem\b[^>]*>(.*?)</poem>", text, re.DOTALL | re.IGNORECASE)
    ppoem = re.search(r"\{\{ppoem\|[^\n]*\n(.*?)\n\}\}", text, re.DOTALL)
    if poem:
        text = poem.group(1)
        if work["author"] == "rilke":
            start = work["text"].splitlines()[0]
            if start not in text:
                raise ValueError(f"Missing Rilke opening: {page['title']}")
            text = text[text.index(start):]
    elif ppoem:
        text = re.sub(r"\{\{xl\|[^{}]*\}\}", "", ppoem.group(1))
    elif "{{block center|" in text:
        text = text.split("{{block center|", 1)[1]
        if not text.rstrip().endswith("}}"):
            raise ValueError(f"Missing block end: {page['title']}")
        text = text.rstrip()[:-2]
    elif "{{block center/s}}" in text:
        text = text.split("{{block center/s}}", 1)[1].split("{{block center/e}}", 1)[0]
    elif "{{block center/e}}" in text:
        text = text.split("{{block center/e}}", 1)[0]
    else:
        raise ValueError(f"Missing verse block: {page['title']}")
    text = re.sub(r"\{\{sc\|([^{}]+)\}\}", r"\1", text, flags=re.IGNORECASE)
    text = re.sub(r"\{\{Zeile\|\d+\}\}", "", text)
    text = text.replace("{{nop}}", "").replace("{{gap|1em}}", " ")
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE).replace("''", "")
    text = "\n".join(re.sub(r"^:+", "", line).strip() for line in text.splitlines()).strip()
    if re.search(r"[{}<>]|\[\[", text):
        raise ValueError(f"Unrecognized markup: {page['title']}")
    return text


def verify_revisions(path):
    snapshot = json.loads(path.read_text(encoding="utf8"))
    index = {(language, page["title"], page["revision"]): page for language, pages in snapshot.items() for page in pages}
    fold = lambda value: "".join(c for c in unicodedata.normalize("NFD", value.casefold()) if unicodedata.category(c)[0] in "LMN")
    for work in WORKS:
        lang = AUTHORS[work["author"]][-1]
        text = "\n".join(extract_wikisource(work, index[(lang, title, revision)]) for title, revision in work["pages"])
        if work["id"] == "recognized-naidu-coromandel-fishers":
            if text.count("morning lights") != 1:
                raise ValueError("Expected the disclosed Wikisource reading 'morning lights'")
            text = text.replace("morning lights", "morning light", 1)
        if fold(text) != fold(work["text"]):
            raise ValueError(f"Transcription differs beyond disclosed wording: {work['id']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="compare generated records without writing")
    parser.add_argument("--evidence-dir", type=Path, help="also verify the reviewed scan image hashes")
    parser.add_argument("--prepare-snapshot", type=Path, help="save the reviewed research snapshot if absent")
    args = parser.parse_args()
    if args.prepare_snapshot:
        if SNAPSHOT.exists():
            raise ValueError(f"Refusing to overwrite {SNAPSHOT}")
        snapshot = args.prepare_snapshot.read_bytes()
        if hashlib.sha256(snapshot).hexdigest() != SNAPSHOT_SHA256:
            raise ValueError("Unexpected research snapshot hash")
        verify_revisions(args.prepare_snapshot)
        SNAPSHOT.write_bytes(snapshot)
        print(f"Prepared {SNAPSHOT.relative_to(ROOT)}.")
        return
    if args.evidence_dir:
        for name, expected in EVIDENCE.items():
            if hashlib.sha256((args.evidence_dir / name).read_bytes()).hexdigest() != expected:
                raise ValueError(f"Scan hash mismatch: {name}")
    if hashlib.sha256(SNAPSHOT.read_bytes()).hexdigest() != SNAPSHOT_SHA256:
        raise ValueError("Pinned Wikisource snapshot changed")
    verify_revisions(SNAPSHOT)
    output = json.dumps(records(), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != output:
            raise ValueError("Committed readings differ from reviewed source data")
        print(f"Verified {len(WORKS)} readings against pinned revisions" + (f" and {len(EVIDENCE)} scan images." if args.evidence_dir else "."))
    else:
        OUTPUT.write_text(output, encoding="utf8")
        print(f"Wrote {len(WORKS)} readings.")


if __name__ == "__main__":
    main()

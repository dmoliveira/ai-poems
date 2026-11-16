#!/usr/bin/env python3
"""Reproduce seven individually documented historical readings."""

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READINGS = ROOT / "scripts/sources/recognized-world-classics-7-readings.txt"
OUTPUT = ROOT / "content/poems/recognized-world-classics-7.json"
READINGS_SHA256 = "9eb30b3ead36965837a05cdc90b845901a6d1603554925dae8371aa4133bd8c5"

# Hashes identify the consulted copies; they do not prove transcription accuracy.
EVIDENCE = {
    "shinushi-vol5-nlc-candidate.pdf": "a149258d2b762491c415871084d9a681a7489194026e25dcd6c83cba5e89397b",
    "lu-you-jiannan-vol24-nlc-candidate.pdf": "7ef9bbbb58aacf7b478d289e61ba1eb8af93b3187132633f9e5320e83e774e98",
    "ouyang-wenzhong-vol2-nlc-candidate.pdf": "0c14d5a4bcb12664d1fa84314f28464fe517e1d668212a67405b716f72568bb0",
    "rilke-herbst-1906-p51-candidate.jpg": "b164c4f5f41cfa449beac32a75b9d1fd33b0fb217a5c5a7be3ccc63365e49148",
    "yeats-swans-1917-candidate.pdf": "faa95ce3f0a10e53fb737cd80a27827f5bc08d477f625c2611ab8b3975a85af2",
    "yeats-swans-1919-candidate.pdf": "49f83e9454cc89afccd66a8f39998596c552afc1d67ff809c8ea1df961f4ae0b",
    "yeats-poetical-works-1906-candidate.pdf": "da433743b986a4db2c13edaed75b912f7424ba61de5c21fffc511cfc99a99b19",
}
CHINESE_RIGHTS = (
    "The historical poem and selected Ming-era reading are public domain in the United States. "
    "Copyright, edition-related and moral rights vary by jurisdiction; check local law. The scan is "
    "linked, not republished. Line breaks and punctuation are supplied, historical glyphs normalized, "
    "and simplified search aliases are not separate editions or translations. No translation or recording is included."
)
EUROPEAN_RIGHTS = (
    "The historical printing is public domain in the United States. Copyright, edition-related and moral rights "
    "vary by jurisdiction; check local law. The scan is linked, not republished. "
    "No translation or recording is included."
)


def aliases(simplified, *extra):
    return [simplified, re.sub(r"[\s，。！？]", "", simplified), *extra]


WORKS = [
    {
        "key": "li-wujiang", "title": "烏江絕句", "author": "Li Qingzhao", "authorId": "li-qingzhao",
        "authorOriginal": "李清照", "authorYears": "1084–12th century", "authorAliases": ["Li Ch'ing-chao"],
        "country": "China", "language": "Chinese", "lang": "zh-Hant", "era": "Song dynasty", "year": None,
        "yearLabel": "Song dynasty · exact composition year unknown", "form": "Verse", "collection": "詩女史 · 明嘉靖",
        "context": (
            "The Ming compilation quotes the complete quatrain in its Li Qingzhao entry as 烏江絕句云, "
            "rather than printing a separate heading; 分得知字 introduces the next quotation. It is also "
            "known as 烏江 or 夏日絕句, not additional works. A Hong Kong educational selection treats it "
            "individually; the original title and exact composition date are not established here. "
            "Line breaks and punctuation are supplied, and historical glyphs normalized. China is an associated "
            "place, not a claim about composition."
        ),
        "sourceTitle": "詩女史 · 明嘉靖, 卷十一, PDF p. 24",
        "source": "https://commons.wikimedia.org/wiki/File:NLC892-2408-209620_%E8%A9%A9%E5%A5%B3%E5%8F%B2_%E7%AC%AC5%E5%86%8A.pdf?page=24",
        "contextSourceTitle": "Skyed Press · individual educational selection",
        "contextSource": "https://www.skyedpress.com.hk/lite_new/asp_t2/03_essay/download/essay/html/1266.htm",
        "rights": CHINESE_RIGHTS,
        "searchAliases": aliases(
            "生当作人杰，\n死亦为鬼雄。\n至今思项羽，\n不肯过江东。",
            "烏江", "乌江", "乌江绝句", "夏日絕句", "夏日绝句", "生當為人傑", "生当为人杰",
            "死亦作鬼雄", "Summer Quatrain",
        ),
        "stanzas": [4],
    },
    {
        "key": "lu-shi-er", "title": "示兒", "author": "Lu You", "authorId": "lu-you",
        "authorOriginal": "陸游", "authorYears": "1125–1210", "authorAliases": ["陆游", "陸放翁", "陆放翁", "Lu Fangweng"],
        "country": "China", "language": "Chinese", "lang": "zh-Hant", "era": "Song dynasty", "year": None,
        "yearLabel": "Song dynasty · exact composition year not established here", "form": "Verse", "collection": "劍南詩稿 · 明刻",
        "context": (
            "This separately headed quatrain ends 卷八十五 before the postscript. The Ming witness reads "
            "元知 and 無忘; the Hong Kong Education Bureau's individual teaching selection reads 原知 "
            "and 毋忘. Another poem by Lu bears the same title, so the opening identifies this work. "
            "The alternatives are not extra poems. Line breaks and punctuation are supplied; China is an "
            "associated place, not a claim about composition."
        ),
        "sourceTitle": "劍南詩稿 · 明刻, 卷八十五, PDF p. 128",
        "source": "https://commons.wikimedia.org/wiki/File:NLC892-411999023439-306879_%E5%8A%8D%E5%8D%97%E8%A9%A9%E7%A8%BF_%E7%AC%AC24%E5%86%8A.pdf?page=128",
        "contextSourceTitle": "Hong Kong Education Bureau · individual teaching selection",
        "contextSource": "https://www.edb.gov.hk/attachment/tc/curriculum-development/kla/chi-edu/resources/primary/lang/culture/03_042.pdf",
        "rights": CHINESE_RIGHTS,
        "searchAliases": aliases(
            "死去元知万事空，\n但悲不见九州同。\n王师北定中原日，\n家祭无忘告乃翁。",
            "示儿", "死去原知萬事空", "死去原知万事空", "家祭毋忘告乃翁", "To My Son",
        ),
        "stanzas": [4],
    },
    {
        "key": "ouyang-huamei-niao", "title": "畫眉鳥", "author": "Ouyang Xiu", "authorId": "ouyang-xiu",
        "authorOriginal": "歐陽修", "authorYears": "1007–1072", "authorAliases": ["欧阳修", "Ou-yang Hsiu"],
        "country": "China", "language": "Chinese", "lang": "zh-Hant", "era": "Song dynasty", "year": None,
        "yearLabel": "Song dynasty · exact composition year not established here", "form": "Verse", "collection": "歐陽文忠公集 · 明刻",
        "context": (
            "The separately headed quatrain crosses the page fold and ends before 懷嵩樓新開南軒與郡僚小飲. "
            "Small notes give 郡齋聞百舌 as an alternate heading and 任 as an alternate to 隨, not extra "
            "verse or works. The Hong Kong Education Bureau discusses this poem individually. Line breaks "
            "and punctuation are supplied, and historical glyphs normalized; China is an associated place, "
            "not a claim about composition."
        ),
        "sourceTitle": "歐陽文忠公集 · 明正統, 卷十一, PDF pp. 1, 8",
        "source": "https://commons.wikimedia.org/wiki/File:NLC892-1613-208408_%E6%AD%90%E9%99%BD%E6%96%87%E5%BF%A0%E5%85%AC%E9%9B%86_%E7%AC%AC2%E5%86%8A.pdf?page=8",
        "contextSourceTitle": "Hong Kong Education Bureau · individual recitation selection",
        "contextSource": "https://www.edb.gov.hk/attachment/tc/curriculum-development/kla/chi-edu/resources/primary/lang/jilei_shi_pdf/jilei_shi_071.pdf",
        "rights": CHINESE_RIGHTS,
        "searchAliases": aliases(
            "百啭千声随意移，\n山花红紫树高低。\n始知锁向金笼听，\n不及林间自在啼。",
            "画眉鸟", "郡齋聞百舌", "郡斋闻百舌", "百囀千聲任意移", "百啭千声任意移", "The Hwamei",
        ),
        "stanzas": [4],
    },
    {
        "key": "rilke-herbst", "title": "Herbst", "author": "Rainer Maria Rilke", "authorId": "rainer-maria-rilke",
        "authorYears": "1875–1926", "country": "Austria", "language": "German", "lang": "de", "era": "20th century",
        "year": 1906, "yearLabel": "1906 printing · not necessarily composition date", "form": "Lyric",
        "collection": "Das Buch der Bilder · 1906",
        "context": (
            "This complete nine-line poem occupies p. 51 of the expanded second edition and is distinct "
            "from Herbsttag. The scan reads Einer welcher without a comma; some later readings insert one. "
            "A literary journal selects this individual poem for translation; its modern translation is not "
            "included. Spacing and indentation are normalized; Austria is an associated place, not a claim "
            "about composition."
        ),
        "sourceTitle": "Das Buch der Bilder · second edition, 1906, p. 51",
        "source": "https://commons.wikimedia.org/wiki/File:Das_Buch_der_Bilder_(Rilke)_051.jpg",
        "contextSourceTitle": "Literary Matters · individual literary selection",
        "contextSource": "https://www.literarymatters.org/12-1-rainer-maria-rilke-fall/",
        "rights": EUROPEAN_RIGHTS, "searchAliases": ["Die Blätter fallen", "Einer, welcher dieses Fallen", "Autumn"],
        "stanzas": [3, 2, 2, 2],
    },
    {
        "key": "yeats-wild-swans", "title": "The Wild Swans at Coole", "author": "William Butler Yeats",
        "authorId": "william-butler-yeats", "authorYears": "1865–1939", "country": "Ireland",
        "language": "English", "lang": "en", "era": "20th century", "year": 1917,
        "yearLabel": "1917 printing · not necessarily composition date", "form": "Lyric", "collection": "The Wild Swans at Coole · Cuala, 1917",
        "context": (
            "The five complete six-line stanzas occupy pp. 1–2 of the 1917 Cuala printing; Men Improve "
            "with the Years follows on p. 2. The source prints nineteenth Autumn and Delight men's eyes "
            "when I awake some day. Yale's Modernism Lab discusses the individual poem. Spacing, indentation "
            "and apostrophe typography are normalized; Ireland is an associated place, not a claim about composition."
        ),
        "sourceTitle": "The Wild Swans at Coole · Cuala Press, 1917, pp. 1–2",
        "source": "https://archive.org/download/wildswansatcoole00yeatrich/wildswansatcoole00yeatrich.pdf#page=17",
        "contextSourceTitle": "Yale Modernism Lab · individual literary discussion",
        "contextSource": "https://campuspress.yale.edu/modernismlab/the-wild-swans-at-coole/",
        "rights": EUROPEAN_RIGHTS, "searchAliases": ["The trees are in their autumn beauty", "nine and fifty swans"],
        "stanzas": [6, 6, 6, 6, 6],
    },
    {
        "key": "yeats-irish-airman", "title": "An Irish Airman Foresees His Death", "author": "William Butler Yeats",
        "authorId": "william-butler-yeats", "authorYears": "1865–1939", "country": "Ireland",
        "language": "English", "lang": "en", "era": "20th century", "year": 1919,
        "yearLabel": "1919 printing · not necessarily composition date", "form": "Lyric", "collection": "The Wild Swans at Coole · Macmillan, 1919",
        "context": (
            "The separately headed sixteen-line poem occupies p. 13 between In Memory of Major Robert Gregory "
            "and Men Improve with the Years. The 1919 printing reads Nor public man, nor angry crowds; "
            "other circulated readings have men and/or cheering. The Poetry Society teaches the poem "
            "individually. A printer-wrapped line is rejoined; spacing and apostrophe typography are normalized. "
            "Ireland is an associated place, not a claim about composition."
        ),
        "sourceTitle": "The Wild Swans at Coole · New York, 1919, p. 13",
        "source": "https://archive.org/download/wild00swansatcooleyeatrich/wild00swansatcooleyeatrich.pdf#page=29",
        "contextSourceTitle": "The Poetry Society · individual teaching selection",
        "contextSource": "https://resources.poetrysociety.org.uk/lesson/yeats-an-irish-airman-foresees-his-death/",
        "rights": EUROPEAN_RIGHTS,
        "searchAliases": ["I know that I shall meet my fate", "Nor public men, nor cheering crowds", "Nor public man, nor cheering crowds"],
        "stanzas": [16],
    },
    {
        "key": "yeats-stolen-child", "title": "The Stolen Child", "author": "William Butler Yeats",
        "authorId": "william-butler-yeats", "authorYears": "1865–1939", "country": "Ireland",
        "language": "English", "lang": "en", "era": "19th century", "year": 1920,
        "yearLabel": "1920 title-page printing · volume copyright and publication notice 1906", "form": "Lyric",
        "collection": "The Poetical Works · Macmillan, 1920 printing",
        "context": (
            "The separately headed poem has four complete stanzas on pp. 39–42, before To an Isle in the Water. "
            "This copy's title page is dated 1920; its copyright page credits publication in 1906, which does "
            "not establish that the text is unchanged from that impression. The source prints vats. and "
            "streams, and the final refrain begins From a world; other readings differ. Its italic refrains "
            "are presented in plain text and printer-wrapped lines rejoined. The Academy of American Poets "
            "individually selects the work. Ireland is an associated place, not a claim about composition."
        ),
        "sourceTitle": "The Poetical Works · New York, title page 1920, pp. 39–42",
        "source": "https://archive.org/download/cu31924013575083/cu31924013575083.pdf#page=59",
        "contextSourceTitle": "Academy of American Poets · individual literary selection",
        "contextSource": "https://poets.org/poem/stolen-child",
        "rights": EUROPEAN_RIGHTS,
        "searchAliases": ["Where dips the rocky highland", "Come away O human child", "For the world’s more full of weeping than he can understand"],
        "stanzas": [12, 15, 14, 12],
    },
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build():
    if digest(READINGS) != READINGS_SHA256:
        raise ValueError("Reading snapshot changed")
    blocks = [block.strip() for block in re.split(r"(?m)^## ", READINGS.read_text(encoding="utf-8")) if block.strip()]
    readings = {}
    for block in blocks:
        key, text = block.split("\n", 1)
        if key in readings:
            raise ValueError(f"Duplicate reading: {key}")
        readings[key] = text.strip()
    if list(readings) != [work["key"] for work in WORKS]:
        raise ValueError("Unexpected reading selection or order")

    records = []
    for work in WORKS:
        text = readings[work["key"]]
        if [len(stanza.splitlines()) for stanza in text.split("\n\n")] != work["stanzas"]:
            raise ValueError(f"Unexpected stanza boundaries: {work['key']}")
        record = {key: value for key, value in work.items() if key not in {"key", "stanzas"}}
        record.update({
            "id": "recognized-world-classics-7-" + work["key"], "direction": "ltr", "themes": [],
            "mood": "paper", "text": text, "translations": [],
        })
        records.append(record)
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    operation = parser.add_mutually_exclusive_group(required=True)
    operation.add_argument("--check", action="store_true")
    operation.add_argument("--write", action="store_true")
    parser.add_argument("--evidence-dir", type=Path)
    args = parser.parse_args()
    records = build()
    if args.evidence_dir:
        for filename, expected in EVIDENCE.items():
            if digest(args.evidence_dir / filename) != expected:
                raise ValueError(f"Witness does not match: {filename}")
    if args.write:
        OUTPUT.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {len(records)} historical readings.")
    else:
        if json.loads(OUTPUT.read_text(encoding="utf-8")) != records:
            raise ValueError("Catalogue differs from the reviewed readings")
        print(f"Verified {len(records)} historical readings" +
              ("; witness hashes match." if args.evidence_dir else "."))


if __name__ == "__main__":
    main()

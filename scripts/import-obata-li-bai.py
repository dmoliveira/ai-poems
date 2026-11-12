#!/usr/bin/env python3
"""Reproduce seven scan-reviewed Obata translations of existing Li Bai poems."""

import argparse
import hashlib
import json
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "content/obata-li-bai-translations.mjs"
EVIDENCE = {
    "obata-li-po-1923-london.pdf": "371baac09c51b02fc4a2443b0445a23b453532dc75b1c2ebd13c568de03d86ad",
    "obata-li-po-1923-ocr.xml": "949871796a39b8196ca5bc09e9d473c0627123afc8d2d4b47975dd18e3b3b5f6",
    "obata-li-po-1922-new-york.pdf": "e5b7811c0a628bacc6f42cba314b993a17c9f77f4444b7df4f5dba9dae93c4ef",
    "obata-li-po-1922-new-york-ocr.xml": "2bb93c8a7d5dbfc2e06bf9db8cfe0895f7d934400d571d802440940331b3f677",
}
SOURCE = "https://archive.org/download/worksoflipochine00libauoft/worksoflipochine00libauoft.pdf"
EXPECTED_SELECTION = (
    ("tang-316", 6, 57), ("tang-317", 7, 58), ("tang-318", 8, 59),
    ("tang-255", 18, 72), ("tang-269", 47, 102), ("tang-101", 51, 106), ("tang-100", 58, 114),
)
OCCASION = (
    "Obata’s title identifies Lady Yang and an imperial feast; neither is explicit in the displayed poem, "
    "and the historical occasion is not established here. "
)
SELECTION = (
    {
        "id": "tang-316", "page": 57, "number": 6,
        "title": "Lady Yang Kuei-fei at the Imperial Feast of the Peony—I",
        "start": "6. LADY YANG KUEI-FEI AT THE IMPERIAL",
        "end": "As to the occasion on which these songs were com-",
        "prefix": ("FEAST OF THE PEONY— I J jn",),
        "ocr": (
            "The glory of trailing clouds is in her garments,",
            "And the radiance of a flower on her face.",
            "O heavenly apparition, found only far above",
            "On the top of the Mountain of Many Jewels, ~^fR",
            "Or in the fairy Palace of Crystal when the moon is up! W°J",
            "Yet I see her here in the earth's garden — ^_",
            "The spring wind softly sweeps the balustrade,",
            "And the dew-drops glisten thickly. . . .",
        ),
        "lines": (
            "The glory of trailing clouds is in her garments,",
            "And the radiance of a flower on her face.",
            "O heavenly apparition, found only far above",
            "On the top of the Mountain of Many Jewels,",
            "Or in the fairy Palace of Crystal when the moon is up!",
            "Yet I see her here in the earth’s garden—",
            "The spring wind softly sweeps the balustrade,",
            "And the dew-drops glisten thickly. . . .",
        ),
        "sha256": "af036d1807bca04a4df952d345e485bee4654ab6e7bdf841c6647bfc7527da59",
        "corrections": ((" ~^fR", ""), (" W°J", ""), (" ^_", "")),
        "note": OCCASION + "The earthly-garden encounter and the rearranged images elaborate the Chinese.",
    },
    {
        "id": "tang-317", "page": 58, "number": 7,
        "title": "Lady Yang Kuei-fei at the Imperial Feast of the Peony—II",
        "start": "jfe. 7. LADY YANG KUEI-FEI AT THE IMPERIAL",
        "end": "The Legend of Cloud and Rain: King Hsiang of Chu",
        "prefix": ("FEAST OF THE PEONY— II", "m"),
        "ocr": (
            ";*. She is the flowering branch of the peony,",
            "**\\ Richly-laden with honey-dew.",
            "Hers is the charm of the vanished fairy,",
            '"~~ 33 That broke the heart of the dreamer king',
            "™N In the old legend of the Cloud and Rain.",
            "j-m Pray, who in the palace of Han",
            "Could be likened unto her,",
            "Save the lady, Flying Swallow, newly-dressed",
            "In all her loveliness?",
        ),
        "lines": (
            "She is the flowering branch of the peony,",
            "Richly-laden with honey-dew.",
            "Hers is the charm of the vanished fairy,",
            "That broke the heart of the dreamer king",
            "In the old legend of the Cloud and Rain.",
            "Pray, who in the palace of Han",
            "Could be likened unto her,",
            "Save the lady, Flying Swallow, newly-dressed",
            "In all her loveliness?",
        ),
        "sha256": "4bf8475c0e5e0c6982c1b964dc3467e792e3720a47ffc946decbcbf2c28617c8",
        "corrections": ((";*. ", ""), ("**\\ ", ""), ('"~~ 33 ', ""), ("™N ", ""), ("j-m ", "")),
        "note": OCCASION + "The dreamer king and vanished fairy elaborate the cloud-and-rain allusion.",
    },
    {
        "id": "tang-318", "page": 59, "number": 8,
        "title": "Lady Yang Kuei-fei at the Imperial Feast of the Peony—III",
        "start": "8. LADY YANG KUEI-FEI AT THE IMPERIAL", "end": "[33]",
        "prefix": ("FEAST OF THE PEONY— HI fft",),
        "ocr": (
            "She stands, leaning against the balustrade ^",
            "Of Chen-hsiang Ting, the Pavilion of Aloes. ^\\",
            "Vanquished are the endless longings of Love „",
            "Borne into the heart on the wind of spring. Ty*3",
            "The radiant flower and the flowery queen rejoice together,",
            "For the emperor deigns to watch them ever with a J~m",
            "smile.",
        ),
        "lines": (
            "She stands, leaning against the balustrade",
            "Of Chen-hsiang Ting, the Pavilion of Aloes.",
            "Vanquished are the endless longings of Love",
            "Borne into the heart on the wind of spring.",
            "The radiant flower and the flowery queen rejoice together,",
            "For the emperor deigns to watch them ever with a smile.",
        ),
        "sha256": "64770744c5268f396b47e0a4f533cd9817401087d4920f4a879348d802d2e4a1",
        "corrections": ((" ^\\", ""), (" ^", ""), (" „", ""), (" Ty*3", ""), (" J~m", "")),
        "note": OCCASION + "The version rearranges the displayed lines and interprets the longing as love.",
    },
    {
        "id": "tang-255", "page": 72, "number": 18,
        "title": "The Sorrow of the Jewel Staircase",
        "start": "18. THE SORROW OF THE JEWEL STAIRCASE", "end": "[46]",
        "ocr": (
            "The dew is white upon the staircase of jewels,",
            "And wets her silken shoes. The night is far gone.",
            "She turns within, lets fall the crystal curtain,",
            "And gazes up at the autumn moon, shining through.",
        ),
        "lines": (
            "The dew is white upon the staircase of jewels,",
            "And wets her silken shoes. The night is far gone.",
            "She turns within, lets fall the crystal curtain,",
            "And gazes up at the autumn moon, shining through.",
        ),
        "sha256": "23232aa5284bf36b405c8492a1f3ac439e272c116adebd853fcb3453be4d6129",
        "note": "‘Silken shoes’ interprets 羅襪, usually understood as silk stockings or socks.",
    },
    {
        "id": "tang-269", "page": 102, "number": 47,
        "title": "The River Journey from White King City",
        "start": "47. THE RIVER JOURNEY FROM",
        "end": "The White King City is in Ssuchuan, and Chiang-ling",
        "prefix": ("WHITE KING CITY",),
        "ocr": (
            "At dawn I left the walled city of White King,",
            "Towering among the many colored clouds;",
            "And came down streanf in a day",
            "One thousand li to Chiang-ling.",
            "The screams of monkeys on either bank",
            "Had scarcely ceased echoing in my ear",
            "When my skiff had left behind it",
            "Ten thousand ranges of hills.",
        ),
        "suffix": ("\\",),
        "lines": (
            "At dawn I left the walled city of White King,",
            "Towering among the many colored clouds;",
            "And came down stream in a day",
            "One thousand li to Chiang-ling.",
            "The screams of monkeys on either bank",
            "Had scarcely ceased echoing in my ear",
            "When my skiff had left behind it",
            "Ten thousand ranges of hills.",
        ),
        "sha256": "dd3a015a9ec9280f7da5e647657173b9698de8b179c41a929243af0149c15288",
        "corrections": (("streanf", "stream"),),
        "note": (
            "His ‘monkeys’ renders 猿 (often understood as apes or gibbons); ‘scarcely ceased’ "
            "differs from the displayed 啼不住 (calls do not stop). The final letter of ‘stream’ "
            "is obscured in the 1923 scan; the 1922 New York printing reads ‘stream’."
        ),
    },
    {
        "id": "tang-101", "page": 106, "number": 51,
        "title": "Parting at Ching-men",
        "start": "51. PARTING AT CHING-MEN", "end": "[80]",
        "ocr": (
            "Faring far across the river-narrow of Ching-men",
            "I have come with you into the land of Chu.",
            "Here ends the mountain-range that stretches along the",
            "plain,",
            "While the river flowing on, enters the distant heavens.",
            "Now under the moon like a mirror flying through the",
            "sky,",
            "And the rising clouds that build palaces and towers,",
            "I bid you farewell. Ten thousand li you sail away,",
            "But it is the waters of the home river that bear you on.",
        ),
        "lines": (
            "Faring far across the river-narrow of Ching-men",
            "I have come with you into the land of Chu.",
            "Here ends the mountain-range that stretches along the plain,",
            "While the river flowing on, enters the distant heavens.",
            "Now under the moon like a mirror flying through the sky,",
            "And the rising clouds that build palaces and towers,",
            "I bid you farewell. Ten thousand li you sail away,",
            "But it is the waters of the home river that bear you on.",
        ),
        "sha256": "437dbe13e3cba46caddaa53b1549a9667d702bb93cfedc79b979f28bcad66393",
        "note": (
            "The explicit ‘you’ and the speaker’s farewell interpret the parting; "
            "the displayed Chinese does not identify a separate addressee in the verse."
        ),
    },
    {
        "id": "tang-100", "page": 114, "number": 58,
        "title": "To Meng Hao-jan",
        "start": ">8. TO MENG HAOJAN",
        "end": "Meng Hao-jan was a native of Hupeh and a poet of",
        "ocr": (
            "I like you, my friend, Meng,",
            "Your love of beauty is something known",
            "To everybody under heaven.",
            "When young with red cheeks,",
            "You cast aside your carriage and cap;",
            "Now that your head is white,",
            "You lie among the pine trees and the clouds.",
            "You get drunk with the moon",
            "As often as with the transparent wine;",
            "And to the honor of serving the emperor",
            "You prefer the rapture of blossoms.",
            "Your nobility looms up like a high mountain,",
            "Too high for others to attain to;",
            "But they may breathe the rare fragrance",
            "That your soul imparts.",
        ),
        "lines": (
            "I like you, my friend, Meng,",
            "Your love of beauty is something known",
            "To everybody under heaven.",
            "When young with red cheeks,",
            "You cast aside your carriage and cap;",
            "Now that your head is white,",
            "You lie among the pine trees and the clouds.",
            "You get drunk with the moon",
            "As often as with the transparent wine;",
            "And to the honor of serving the emperor",
            "You prefer the rapture of blossoms.",
            "Your nobility looms up like a high mountain,",
            "Too high for others to attain to;",
            "But they may breathe the rare fragrance",
            "That your soul imparts.",
        ),
        "sha256": "8a3c7792c65771d4af1985ba683cfa337d2ea7a493df039c38840989a6173ff3",
        "note": "‘Love of beauty’ interprets 風流; the explicit reference to the soul elaborates the closing image.",
    },
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def normalize_words(text):
    return "".join(char for char in unicodedata.normalize("NFKD", text).casefold() if char.isalnum())


def page_lines(pages, number):
    if not 1 <= number <= len(pages):
        raise ValueError("Unexpected OCR page")
    return [
        " ".join("".join(word.itertext()).strip() for word in line.iter("WORD"))
        for line in pages[number - 1].iter("LINE")
    ]


def reading(pages, row):
    source = page_lines(pages, row["page"])
    start, end = row["start"], row["end"]
    if source.count(start) != 1 or source.count(end) != 1:
        raise ValueError(f"Unexpected entry boundaries: {row['id']}")
    first, last = source.index(start), source.index(end)
    if first >= last:
        raise ValueError(f"Unexpected entry boundaries: {row['id']}")
    expected = [*row.get("prefix", ()), *row["ocr"], *row.get("suffix", ())]
    if source[first + 1:last] != expected:
        raise ValueError(f"Unexpected OCR verse or boundaries: {row['id']}")
    text = "\n".join(row["lines"])
    if not row["lines"] or digest(text.encode("utf8")) != row["sha256"]:
        raise ValueError(f"Reviewed translation changed: {row['id']}")
    comparison = "\n".join(row["ocr"])
    for old, new in row.get("corrections", ()):
        if comparison.count(old) != 1:
            raise ValueError(f"Unexpected OCR correction: {row['id']}")
        comparison = comparison.replace(old, new, 1)
    if normalize_words(comparison) != normalize_words(text):
        raise ValueError(f"OCR comparison differs: {row['id']}")
    return text


def records(directory):
    evidence = {name: (directory / name).read_bytes() for name in EVIDENCE}
    for name, expected in EVIDENCE.items():
        if digest(evidence[name]) != expected:
            raise ValueError(f"Reviewed evidence changed: {name}")
    pages = ET.fromstring(evidence["obata-li-po-1923-ocr.xml"]).findall(".//OBJECT")
    comparison = ET.fromstring(evidence["obata-li-po-1922-new-york-ocr.xml"]).findall(".//OBJECT")
    if sum("And came down stream in a day" in line for line in page_lines(comparison, 103)) != 1:
        raise ValueError("1922 stream comparison changed")
    selected = tuple((row["id"], row["number"], row["page"]) for row in SELECTION)
    if len({item[0] for item in selected}) != len(selected):
        raise ValueError("Duplicate selected poem")
    if selected != EXPECTED_SELECTION:
        raise ValueError("Unexpected selection order or page")
    result = {}
    for row in SELECTION:
        result[row["id"]] = [{
            "language": "English", "title": row["title"], "text": reading(pages, row),
            "translator": "Shigeyoshi Obata · London and Toronto 1923",
            "source": f'{SOURCE}#page={row["page"]}',
            "rights": (
                "This 1923 English version is public domain in the United States. Obata died in 1971; "
                "it may remain protected in life-plus-70 jurisdictions. Check local law. "
                "His Chinese working edition is not established here; this is an interpretation, "
                "not a claim of an exact match to the displayed Chinese. " + row["note"]
            ),
        }]
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing reviewed scans and OCR files")
    parser.add_argument("--check", action="store_true", help="compare without writing")
    args = parser.parse_args()
    rendered = (
        "// Generated by scripts/import-obata-li-bai.py from the reviewed 1923 edition.\n"
        + "export const obataLiBaiTranslations = "
        + json.dumps(records(args.directory), ensure_ascii=False, indent=2)
        + ";\n"
    )
    if args.check:
        if OUTPUT.read_text(encoding="utf8") != rendered:
            raise ValueError("Translations differ from the reviewed readings")
        print(f"Verified {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.write_text(rendered, encoding="utf8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

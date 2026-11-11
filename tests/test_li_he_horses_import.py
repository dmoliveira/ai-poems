"""Offline source, boundary and rights guards for Li He's horse poems."""

import hashlib
import runpy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
MODULE = runpy.run_path(str(ROOT / "scripts/import-li-he-horses.py"))
RECORDS = MODULE["records"]
SECTIONS = MODULE["source_sections"]
REMOVE_NOTES = MODULE["remove_notes"]
COMPARE = MODULE["compare_source"]
NUMBERS = MODULE["NUMBERS"]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verse(text):
    return "".join(line[:-1] for line in text.splitlines())


def make_book(verses):
    book = "{{SK anchor|馬詩二十三首}}\n"
    for number in NUMBERS:
        if number == "其五":
            book += "其五\n"
        else:
            marker = number if number == "其一" else "{{SK anchor|" + number + "}}"
            book += f"　　{marker}\n"
        body = verses.get(number, "甲乙丙丁戊己庚辛壬癸甲乙丙丁戊己庚辛壬癸")
        book += f"　　{body}{{{{SK notes|comment {{{{nested|not verse}}}} ends}}}}"
        if number != "其四":
            book += "\n"
    return book + "{{SK anchor|申胡子觱篥歌}}"


class LiHeHorsesImporterTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.four = "甲乙丙丁戊，\n己庚辛壬癸。\n甲乙丙丁戊，\n猶自帶銅聲。"
        self.five = "大漠山如雪，\n燕山月似鈎。\n何當金絡腦，\n快走踏清秋。"
        self.six = "飢臥骨查牙，\n粗毛刺破花。\n鬣焦朱色落，\n髮斷鋸長麻。"
        self.verses = {
            "其一": "龍{{SKchar|3394}}貼連錢",
            "其四": verse(self.four),
            "其五": verse(self.five),
            "其六": verse(self.six).replace("飢", "饑").replace("臥", "卧").replace("粗", "麤").replace("鬣", "鬛"),
            "其十四": "{{SKchar|2951}}看南陌上",
        }
        self.book = make_book(self.verses)
        self.files = {"wikisource-siku-vol2-790637.wikitext": self.book.encode(), "siku.pdf": b"facsimile"}
        for name, data in self.files.items():
            (self.directory / name).write_bytes(data)
        self.readings = self.directory / "readings.txt"
        self.readings.write_text(
            f"=== four ===\n{self.four}\n\n=== five ===\n{self.five}\n\n=== six ===\n{self.six}\n", encoding="utf8"
        )
        self.rows = (
            {"slug": "four", "number": "其四", "pages": (89, 90), "hash": digest(self.four.encode()), "changes": ()},
            {"slug": "five", "number": "其五", "pages": (90, 90), "hash": digest(self.five.encode()), "changes": ()},
            {"slug": "six", "number": "其六", "pages": (90, 90), "hash": digest(self.six.encode()),
             "changes": (("饑", "飢", 1), ("卧", "臥", 1), ("麤", "粗", 1), ("鬛", "鬣", 1))},
        )
        self.settings = {
            "EVIDENCE": {name: digest(data) for name, data in self.files.items()},
            "READINGS": self.readings,
            "READINGS_SHA256": digest(self.readings.read_bytes()),
            "SELECTION": self.rows,
        }

    def test_complete_readings_titles_sources_and_credits(self):
        with patch.dict(RECORDS.__globals__, self.settings):
            four, five, six = RECORDS(self.directory)
        self.assertEqual(four["text"], self.four)
        self.assertEqual(five["text"], self.five)
        self.assertEqual(six["text"], self.six)
        self.assertEqual(five["title"], "馬詩二十三首（其五 · 大漠山如雪）")
        self.assertEqual(five["displayTitle"], "馬詩二十三首（其五 · 異文：大漠沙如雪）")
        self.assertEqual(five["displayTitleLang"], "zh-Hant")
        self.assertEqual(five["authorOriginal"], "李賀")
        self.assertTrue(five["source"].endswith("#page=90"))
        self.assertTrue(five["contextSource"].endswith("&oldid=790637"))
        self.assertIn("relationship to this scanned copy is not established", five["context"])
        self.assertIn("reproduction date is not identified", five["context"])
        self.assertIn("not a diplomatic transcription", five["context"])
        self.assertIn("CC BY-SA 4.0", five["rights"])
        self.assertIn("維基小霸王 and Wmr-bot", five["rights"])
        self.assertEqual(five["translations"], [])
        self.assertEqual(five["themes"], [])

    def test_all_boundaries_and_unanchored_fifth_are_separate(self):
        sections = SECTIONS(self.book)
        self.assertEqual(tuple(sections), NUMBERS)
        self.assertEqual(sections["其四"], self.verses["其四"])
        self.assertEqual(sections["其五"], self.verses["其五"])
        self.assertEqual(sections["其六"], self.verses["其六"])
        self.assertIn("{{SKchar|3394}}", sections["其一"])
        self.assertIn("{{SKchar|2951}}", sections["其十四"])
        self.assertEqual(REMOVE_NOTES("a{{SK notes|b{{nested|c}}d}}e"), "ae")
        with self.assertRaisesRegex(ValueError, "Unclosed"):
            REMOVE_NOTES("a{{SK notes|b{{nested|c}}")

    def test_unanchored_boundary_and_all_numbers_are_required(self):
        cases = (
            self.book.replace("猶自帶銅聲{{SK notes", "猶自帶銅聲extra{{SK notes"),
            self.book.replace("}}其五\n", "}}missing\n"),
            self.book.replace("{{SK anchor|其八}}", "missing"),
            self.book.replace("{{SK anchor|其十}}", "{{SK anchor|其十一}}"),
            self.book.replace("{{SK anchor|申胡子觱篥歌}}", "missing"),
        )
        for source in cases:
            with self.subTest(source=source[:80]), self.assertRaises(ValueError):
                SECTIONS(source)

    def test_undocumented_changes_and_placeholders_fail(self):
        COMPARE(self.verses["其六"], self.rows[2], self.six)
        with self.assertRaisesRegex(ValueError, "source change"):
            COMPARE(self.verses["其六"], {**self.rows[2], "changes": (("饑", "飢", 2),)}, self.six)
        with self.assertRaisesRegex(ValueError, "source reading"):
            COMPARE(self.verses["其六"], {**self.rows[2], "changes": ()}, self.six)
        with self.assertRaisesRegex(ValueError, "verse markup"):
            COMPARE(self.verses["其一"], self.rows[0], self.four)

    def test_missing_or_modified_evidence_and_readings_fail(self):
        scan = self.directory / "siku.pdf"
        scan.unlink()
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaises(FileNotFoundError):
            RECORDS(self.directory)
        scan.write_bytes(b"different")
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "evidence changed"):
            RECORDS(self.directory)
        scan.write_bytes(self.files["siku.pdf"])
        self.readings.write_text("changed", encoding="utf8")
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "readings changed"):
            RECORDS(self.directory)

    def test_repinned_source_or_reading_cannot_change_reviewed_poem(self):
        path = self.directory / "wikisource-siku-vol2-790637.wikitext"
        altered = self.book.replace(verse(self.five), "異" + verse(self.five)[1:], 1)
        path.write_text(altered, encoding="utf8")
        evidence = {**self.settings["EVIDENCE"], path.name: digest(path.read_bytes())}
        with patch.dict(RECORDS.__globals__, {**self.settings, "EVIDENCE": evidence}), \
                self.assertRaisesRegex(ValueError, "source reading"):
            RECORDS(self.directory)
        path.write_bytes(self.files[path.name])
        self.readings.write_text(self.readings.read_text().replace("大漠山", "大漠沙", 1), encoding="utf8")
        settings = {**self.settings, "READINGS_SHA256": digest(self.readings.read_bytes())}
        with patch.dict(RECORDS.__globals__, settings), self.assertRaisesRegex(ValueError, "poem changed"):
            RECORDS(self.directory)

    def test_incomplete_verse_fails_even_if_hashes_are_repinned(self):
        incomplete = "\n".join(self.five.splitlines()[:-1])
        self.readings.write_text(self.readings.read_text().replace(self.five, incomplete), encoding="utf8")
        rows = (self.rows[0], {**self.rows[1], "hash": digest(incomplete.encode())}, self.rows[2])
        settings = {**self.settings, "READINGS_SHA256": digest(self.readings.read_bytes()), "SELECTION": rows}
        with patch.dict(RECORDS.__globals__, settings), self.assertRaisesRegex(ValueError, "line boundaries"):
            RECORDS(self.directory)


if __name__ == "__main__":
    unittest.main()

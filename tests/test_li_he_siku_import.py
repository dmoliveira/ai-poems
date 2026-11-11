"""Offline guards for Li He's numbered poems and the Siku source."""

import hashlib
import runpy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
MODULE = runpy.run_path(str(ROOT / "scripts/import-li-he-siku.py"))
RECORDS = MODULE["records"]
SECTIONS = MODULE["source_sections"]
REMOVE_NOTES = MODULE["remove_notes"]
COMPARE = MODULE["compare_source"]
NUMBERS = MODULE["NUMBERS"]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def make_book(verses):
    book = "{{SK anchor|南園十三首}}\n"
    for number in NUMBERS:
        marker = number if number in ("其一", "其六") else "{{SK anchor|" + number + "}}"
        book += f"　　{marker}\n　　{verses[number]}\n"
        book += "　　{{SK notes|comment {{nested|not verse}} ends here}}\n"
    return book + "{{SK anchor|箋註評㸃李長吉歌詩巻一}}"


class LiHeSikuImporterTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.first_lines = ["甲乙丙丁戊己庚，", "辛壬癸子丑寅卯。", "辰巳午未申酉戌，", "亥甲乙丙丁戊己。"]
        self.last_lines = ["甲乙丙丁戊，", "己庚辛壬癸。"] * 4
        self.first = "\n".join(self.first_lines)
        self.last = "\n".join(self.last_lines)
        self.verses = dict.fromkeys(NUMBERS, "甲乙丙丁戊己庚" * 4)
        self.verses["其一"] = "".join(line[:-1] for line in self.first_lines)
        self.verses["其十三"] = "".join(line[:-1] for line in self.last_lines)
        self.book = make_book(self.verses)
        self.files = {
            "wikisource-siku-790635.wikitext": self.book.encode(),
            "siku.pdf": b"facsimile",
            "wang.pdf": b"comparison scan",
        }
        for name, data in self.files.items():
            (self.directory / name).write_bytes(data)
        self.readings = self.directory / "readings.txt"
        self.readings.write_text(f"=== one ===\n{self.first}\n\n=== thirteen ===\n{self.last}\n", encoding="utf8")
        self.rows = (
            {"slug": "one", "number": "其一", "pages": (72, 72), "width": 7,
             "hash": digest(self.first.encode()), "changes": ()},
            {"slug": "thirteen", "number": "其十三", "pages": (79, 80), "width": 5,
             "hash": digest(self.last.encode()), "changes": ()},
        )
        self.settings = {
            "EVIDENCE": {name: digest(data) for name, data in self.files.items()},
            "READINGS": self.readings,
            "READINGS_SHA256": digest(self.readings.read_bytes()),
            "SELECTION": self.rows,
        }

    def test_complete_seven_and_five_character_readings_and_credits(self):
        with patch.dict(RECORDS.__globals__, self.settings):
            first, last = RECORDS(self.directory)
        self.assertEqual(first["text"], self.first)
        self.assertEqual(last["text"], self.last)
        self.assertEqual(first["form"], "Seven-character quatrain")
        self.assertEqual(last["form"], "Five-character poem")
        self.assertTrue(first["source"].endswith("#page=72"))
        self.assertTrue(first["contextSource"].endswith("&oldid=790635"))
        self.assertIn("relationship to this scanned copy is not established", first["context"])
        self.assertIn("reproduction date is not identified", first["context"])
        self.assertIn("not a diplomatic transcription", first["context"])
        self.assertIn("CC BY-SA 4.0", first["rights"])
        self.assertIn("維基小霸王 and Wmr-bot", first["rights"])
        self.assertEqual(first["translations"], [])
        self.assertEqual(first["themes"], [])

    def test_balanced_nested_notes_are_not_verse(self):
        sections = SECTIONS(self.book)
        self.assertEqual(tuple(sections), NUMBERS)
        self.assertEqual(sections["其一"], self.verses["其一"])
        self.assertEqual(sections["其十三"], self.verses["其十三"])
        self.assertEqual(REMOVE_NOTES("a{{SK notes|b{{nested|c}}d}}e"), "ae")
        with self.assertRaisesRegex(ValueError, "Unclosed"):
            REMOVE_NOTES("a{{SK notes|b{{nested|c}}")

    def test_group_and_numbered_boundaries_are_required(self):
        cases = (
            self.book.replace("{{SK anchor|南園十三首}}", "missing"),
            self.book.replace("{{SK anchor|其七}}", "missing"),
            self.book.replace("{{SK anchor|其八}}", "{{SK anchor|其七}}"),
            self.book.replace("{{SK anchor|箋註評㸃李長吉歌詩巻一}}", "missing"),
            self.book.replace("　　其一", "unexpected\n　　其一"),
        )
        for source in cases:
            with self.subTest(source=source[:80]), self.assertRaisesRegex(ValueError, "boundaries"):
                SECTIONS(source)

    def test_source_changes_must_be_explicit_exact_and_used(self):
        source = self.verses["其一"].replace("甲", "異", 1)
        row = self.rows[0]
        with self.assertRaisesRegex(ValueError, "source reading"):
            COMPARE(source, row, self.first)
        COMPARE(source, {**row, "changes": (("異", "甲", 1),)}, self.first)
        with self.assertRaisesRegex(ValueError, "source change"):
            COMPARE(source, {**row, "changes": (("異", "甲", 2),)}, self.first)
        with self.assertRaisesRegex(ValueError, "verse markup"):
            COMPARE("{{SKchar|1}}" + source, row, self.first)

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
        altered = self.book.replace(self.verses["其一"], "異" + self.verses["其一"][1:], 1)
        path = self.directory / "wikisource-siku-790635.wikitext"
        path.write_text(altered, encoding="utf8")
        evidence = {**self.settings["EVIDENCE"], path.name: digest(path.read_bytes())}
        with patch.dict(RECORDS.__globals__, {**self.settings, "EVIDENCE": evidence}), \
                self.assertRaisesRegex(ValueError, "source reading"):
            RECORDS(self.directory)
        path.write_bytes(self.files[path.name])
        self.readings.write_text(self.readings.read_text().replace("甲乙", "異乙", 1), encoding="utf8")
        settings = {**self.settings, "READINGS_SHA256": digest(self.readings.read_bytes())}
        with patch.dict(RECORDS.__globals__, settings), self.assertRaisesRegex(ValueError, "poem changed"):
            RECORDS(self.directory)

    def test_incomplete_or_extra_lines_fail_even_if_hashes_are_repinned(self):
        text = "\n".join(self.first_lines[:-1])
        self.readings.write_text(f"=== one ===\n{text}\n\n=== thirteen ===\n{self.last}\n", encoding="utf8")
        rows = ({**self.rows[0], "hash": digest(text.encode())}, self.rows[1])
        settings = {**self.settings, "READINGS_SHA256": digest(self.readings.read_bytes()), "SELECTION": rows}
        with patch.dict(RECORDS.__globals__, settings), self.assertRaisesRegex(ValueError, "line boundaries"):
            RECORDS(self.directory)


if __name__ == "__main__":
    unittest.main()

"""Offline guards for further Xue Tao readings and comparison templates."""

import hashlib
import runpy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
MODULE = runpy.run_path(str(ROOT / "scripts/import-xue-tao-1906-further.py"))
RECORDS = MODULE["records"]


def digest(data):
    return hashlib.sha256(data).hexdigest()


class FurtherXueTaoImporterTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.comparison = self.directory / "comparison.txt"
        self.comparison.write_text(
            "題\n春日微風吹滿庭山前花鶴報晴明綠楊垂影臨溪水明月初升照遠城{{SK notes|一作別}}\n",
            encoding="utf8",
        )
        self.readings = self.directory / "readings.txt"
        self.text = "春日微風吹滿庭，\n山前花鳥報晴明。\n綠楊垂影臨溪水，\n明月初升照遠城。"
        self.fixture = f"=== sample ===\n{self.text}\n"
        self.readings.write_text(self.fixture, encoding="utf8")
        self.row = {
            "slug": "sample", "title": "題", "pages": (3, 3), "comparison": ("題", 1),
            "hash": digest(self.text.encode()), "adjustments": (("花鶴", "花鳥"),), "note": "A variant note.",
        }
        self.settings = {
            "COMPARISON_FILE": "comparison.txt", "COMPARISON_SHA256": digest(self.comparison.read_bytes()),
            "READINGS": self.readings, "READINGS_SHA256": digest(self.fixture.encode()), "SELECTION": (self.row,),
        }

    def test_records_preserve_text_sources_rights_and_attribution_caveat(self):
        with patch.dict(RECORDS.__globals__, self.settings):
            poem, = RECORDS(self.directory)
        self.assertEqual(poem["text"], self.text)
        self.assertEqual(poem["authorOriginal"], "薛濤")
        self.assertTrue(poem["source"].endswith("/book/NCL-000474792/reader"))
        self.assertIn("reader p. 3", poem["context"])
        self.assertIn("not an autograph or proof of every attribution", poem["context"])
        self.assertIn("A variant note.", poem["context"])
        self.assertIn("CC BY-SA 4.0", poem["rights"])
        self.assertIn("is distributed under CC BY-SA 4.0", poem["rights"])
        self.assertIn("維基小霸王", poem["rights"])
        self.assertEqual(poem["translations"], [])

    def test_missing_or_changed_comparison_is_rejected(self):
        self.comparison.unlink()
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaises(FileNotFoundError):
            RECORDS(self.directory)
        self.comparison.write_text("changed", encoding="utf8")
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "comparison changed"):
            RECORDS(self.directory)

    def test_changed_reading_fails_whole_file_hash(self):
        self.readings.write_text(self.fixture.replace("花鳥", "花燕"), encoding="utf8")
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "readings changed"):
            RECORDS(self.directory)

    def test_repinned_reading_still_rejects_changed_poem(self):
        altered = self.fixture.replace("花鳥", "花燕")
        self.readings.write_text(altered, encoding="utf8")
        with patch.dict(RECORDS.__globals__, {**self.settings, "READINGS_SHA256": digest(altered.encode())}), (
            self.assertRaisesRegex(ValueError, "poem changed")
        ):
            RECORDS(self.directory)

    def test_repinned_reading_rejects_bad_boundaries_and_selection(self):
        cases = (
            (self.fixture.replace("花鳥", "花"), "reading-line boundaries"),
            (self.fixture.replace("花鳥", "花□"), "reading-line boundaries"),
            (self.fixture.replace("=== sample ===", "=== other ==="), "selection or order"),
        )
        for content, error in cases:
            with self.subTest(error=error):
                self.readings.write_text(content, encoding="utf8")
                with patch.dict(RECORDS.__globals__, {**self.settings, "READINGS_SHA256": digest(content.encode())}), (
                    self.assertRaisesRegex(ValueError, error)
                ):
                    RECORDS(self.directory)

    def test_invalid_reader_page_range_is_rejected(self):
        with patch.dict(RECORDS.__globals__, {**self.settings, "SELECTION": ({**self.row, "pages": (0, 41)},)}), (
            self.assertRaisesRegex(ValueError, "Invalid reader page range")
        ):
            RECORDS(self.directory)

    def test_repinned_comparison_cannot_hide_unreviewed_difference(self):
        altered = self.comparison.read_text(encoding="utf8").replace("晴明", "晴光")
        self.comparison.write_text(altered, encoding="utf8")
        settings = {**self.settings, "COMPARISON_SHA256": digest(altered.encode())}
        with patch.dict(RECORDS.__globals__, settings), self.assertRaisesRegex(ValueError, "Undocumented comparison"):
            RECORDS(self.directory)

    def test_duplicate_heading_and_unexpected_variants_are_rejected(self):
        original = self.comparison.read_text(encoding="utf8")
        cases = (
            (original + "題\n", "comparison boundaries"),
            (original.replace("花鶴", "花鴉"), "comparison variant"),
            (original.replace("{{SK notes|一作別}}", "{{unknown}}"), "comparison markup"),
        )
        for content, error in cases:
            with self.subTest(error=error):
                self.comparison.write_text(content, encoding="utf8")
                settings = {**self.settings, "COMPARISON_SHA256": digest(content.encode())}
                with patch.dict(RECORDS.__globals__, settings), self.assertRaisesRegex(ValueError, error):
                    RECORDS(self.directory)

    def test_reviewed_template_expansion_is_pinned_and_requires_exact_count(self):
        original = self.comparison.read_text(encoding="utf8")
        content = original.replace("花鶴", "{{SKchar|1215}}{{SKchar|1215}}")
        self.comparison.write_text(content, encoding="utf8")
        row = {**self.row, "templates": (("{{SKchar|1215}}", "珊", 2),), "adjustments": (("珊珊", "花鳥"),)}
        settings = {**self.settings, "SELECTION": (row,), "COMPARISON_SHA256": digest(content.encode())}
        with patch.dict(RECORDS.__globals__, settings):
            poem, = RECORDS(self.directory)
        self.assertEqual(poem["text"], self.text)
        altered = content.replace("{{SKchar|1215}}", "珊", 1)
        self.comparison.write_text(altered, encoding="utf8")
        with patch.dict(RECORDS.__globals__, {**settings, "COMPARISON_SHA256": digest(altered.encode())}), (
            self.assertRaisesRegex(ValueError, "comparison template")
        ):
            RECORDS(self.directory)

    def test_ext_b_character_is_checked_not_silently_dropped(self):
        original = self.comparison.read_text(encoding="utf8")
        altered = original.replace("春日", "𤣥日")
        self.comparison.write_text(altered, encoding="utf8")
        settings = {**self.settings, "COMPARISON_SHA256": digest(altered.encode())}
        with patch.dict(RECORDS.__globals__, settings), self.assertRaisesRegex(ValueError, "Undocumented comparison"):
            RECORDS(self.directory)
        row = {**self.row, "adjustments": (("𤣥", "春"), ("花鶴", "花鳥"))}
        with patch.dict(RECORDS.__globals__, {**settings, "SELECTION": (row,)}):
            poem, = RECORDS(self.directory)
        self.assertEqual(poem["text"], self.text)


if __name__ == "__main__":
    unittest.main()

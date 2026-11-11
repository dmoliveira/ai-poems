"""Offline guards for further Tao evidence, boundaries and explicit variants."""

import hashlib
import runpy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
RECORDS = runpy.run_path(str(ROOT / "scripts/import-tao-drinking-ming-more.py"))["records"]


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


class FurtherTaoImporterTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.scan = self.directory / "scan.pdf"
        self.scan.write_text("reviewed scan", encoding="utf8")
        self.wiki = self.directory / "wiki.txt"
        self.comparison = "===其一===\n<poem>\n春日微風暖，花開滿故園。\n</poem>\n"
        self.wiki.write_text(self.comparison, encoding="utf8")
        self.readings = self.directory / "readings.txt"
        self.fixture = "=== 01 ===\n春日微風暖，花落滿故園。\n"
        self.readings.write_text(self.fixture, encoding="utf8")
        self.settings = {
            "EVIDENCE": {"scan.pdf": digest("reviewed scan"), "wiki.txt": digest(self.comparison)},
            "COMPARISON_FILE": "wiki.txt",
            "READINGS": self.readings,
            "READINGS_SHA256": digest(self.fixture),
            "SELECTION": (("01", "一", "春日微風暖", (5, 5), 1),),
            "SUBSTITUTIONS": {"01": (("花開滿故園", "花落滿故園"),)},
        }

    def test_explicit_variant_and_attributed_adaptation(self):
        with patch.dict(RECORDS.__globals__, self.settings):
            poem, = RECORDS(self.directory)
        self.assertEqual(poem["text"], "春日微風暖，花落滿故園。")
        self.assertTrue(poem["source"].endswith("#page=5"))
        self.assertIn("Wikisource", poem["contextSourceTitle"])
        self.assertIn("CC BY-SA 4.0", poem["rights"])
        self.assertIn("https://creativecommons.org/licenses/by-sa/4.0/", poem["rights"])

    def test_missing_or_changed_evidence_is_rejected(self):
        with patch.dict(RECORDS.__globals__, self.settings):
            self.scan.unlink()
            with self.assertRaises(FileNotFoundError):
                RECORDS(self.directory)
            self.scan.write_text("reviewed scan", encoding="utf8")
            self.wiki.write_text("changed", encoding="utf8")
            with self.assertRaisesRegex(ValueError, "Reviewed evidence changed"):
                RECORDS(self.directory)

    def test_changed_readings_fail_hash_guard(self):
        self.readings.write_text(self.fixture.replace("花落", "花謝"), encoding="utf8")
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "Reviewed readings changed"):
            RECORDS(self.directory)

    def test_repinned_readings_cannot_hide_gaps_or_new_variants(self):
        for content, error in (
            (self.fixture.replace("花落", "花□"), "Unresolved reading"),
            (self.fixture.replace("花落", "花"), "Unexpected couplet boundaries"),
            (self.fixture.replace("花落", "花謝"), "Undocumented comparison difference"),
            (self.fixture.replace("=== 01 ===", "=== 02 ==="), "Unexpected selection or order"),
        ):
            with self.subTest(error=error):
                self.readings.write_text(content, encoding="utf8")
                settings = {**self.settings, "READINGS_SHA256": digest(content)}
                with patch.dict(RECORDS.__globals__, settings), self.assertRaisesRegex(ValueError, error):
                    RECORDS(self.directory)

    def test_missing_or_repeated_reviewed_substitution_is_rejected(self):
        for comparison in (
            self.comparison.replace("花開滿故園", "花謝滿故園"),
            self.comparison.replace("花開滿故園", "花開滿故園花開滿故園"),
        ):
            with self.subTest(comparison=comparison):
                self.wiki.write_text(comparison, encoding="utf8")
                settings = {
                    **self.settings,
                    "EVIDENCE": {"scan.pdf": digest("reviewed scan"), "wiki.txt": digest(comparison)},
                }
                with patch.dict(RECORDS.__globals__, settings), self.assertRaisesRegex(ValueError, "Expected comparison passage changed"):
                    RECORDS(self.directory)


if __name__ == "__main__":
    unittest.main()

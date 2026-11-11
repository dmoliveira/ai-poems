"""Offline guards for the further Li Qingzhao scan-based readings."""

import hashlib
import runpy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
RECORDS = runpy.run_path(str(ROOT / "scripts/import-li-qingzhao-1881-more.py"))["records"]


def digest(data):
    return hashlib.sha256(data).hexdigest()


class LiQingzhaoMoreImporterTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.scan = self.directory / "scan.pdf"
        self.scan.write_bytes(b"reviewed scan")
        self.comparison = self.directory / "pg25367.txt"
        self.comparison.write_text("春日微風，花開滿庭。\n☆\n", encoding="utf8")
        self.readings = self.directory / "readings.txt"
        self.text = "春日微風，\n花開滿庭。"
        self.fixture = f"=== sample ===\n{self.text}\n"
        self.readings.write_text(self.fixture, encoding="utf8")
        self.row = ("sample", "調", "春日", (9, 9), (2,), "", digest(self.text.encode()), "An edition note.")
        self.settings = {
            "EVIDENCE": {"scan.pdf": digest(b"reviewed scan"), "pg25367.txt": digest(self.comparison.read_bytes())},
            "READINGS": self.readings,
            "READINGS_SHA256": digest(self.fixture.encode()),
            "SELECTION": (self.row,),
            "COMPARISON": {"sample": ()},
        }

    def test_fixture_preserves_text_sources_and_attribution_caveat(self):
        with patch.dict(RECORDS.__globals__, self.settings):
            poem, = RECORDS(self.directory)
        self.assertEqual(poem["text"], self.text)
        self.assertTrue(poem["source"].endswith("#page=9"))
        self.assertIn("not proof of sole authorship", poem["context"])
        self.assertIn("An edition note.", poem["context"])
        self.assertEqual(poem["translations"], [])

    def test_missing_or_changed_evidence_is_rejected(self):
        self.scan.unlink()
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaises(FileNotFoundError):
            RECORDS(self.directory)
        self.scan.write_bytes(b"changed")
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "evidence changed"):
            RECORDS(self.directory)

    def test_changed_reading_fails_whole_file_hash(self):
        self.readings.write_text(self.fixture.replace("花開", "花落"), encoding="utf8")
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "readings changed"):
            RECORDS(self.directory)

    def test_repinned_reading_still_rejects_changed_verse(self):
        altered = self.fixture.replace("花開", "花落")
        self.readings.write_text(altered, encoding="utf8")
        settings = {**self.settings, "READINGS_SHA256": digest(altered.encode())}
        with patch.dict(RECORDS.__globals__, settings), self.assertRaisesRegex(ValueError, "lyric changed"):
            RECORDS(self.directory)

    def test_repinned_readings_reject_lacunae_boundaries_and_wrong_selection(self):
        cases = (
            (self.fixture.replace("花開", "花□"), "Unresolved reading"),
            (self.fixture.replace("\n花開", "\n\n花開"), "reading-line boundaries"),
            (self.fixture.replace("=== sample ===", "=== other ==="), "selection or order"),
        )
        for content, error in cases:
            with self.subTest(error=error):
                self.readings.write_text(content, encoding="utf8")
                settings = {**self.settings, "READINGS_SHA256": digest(content.encode())}
                with patch.dict(RECORDS.__globals__, settings), self.assertRaisesRegex(ValueError, error):
                    RECORDS(self.directory)

    def test_invalid_scan_page_range_is_rejected(self):
        row = (*self.row[:3], (0, 99), *self.row[4:])
        with patch.dict(RECORDS.__globals__, {**self.settings, "SELECTION": (row,)}), self.assertRaisesRegex(
            ValueError, "Invalid PDF page range"
        ):
            RECORDS(self.directory)

    def test_repinned_comparison_cannot_hide_unreviewed_difference(self):
        self.comparison.write_text("春日微風，花落滿庭。\n☆\n", encoding="utf8")
        evidence = {**self.settings["EVIDENCE"], "pg25367.txt": digest(self.comparison.read_bytes())}
        with patch.dict(RECORDS.__globals__, {**self.settings, "EVIDENCE": evidence}), self.assertRaisesRegex(
            ValueError, "Undocumented comparison difference"
        ):
            RECORDS(self.directory)


if __name__ == "__main__":
    unittest.main()

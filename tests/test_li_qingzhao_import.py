"""Offline checks for source pinning and the reviewed-reading parser."""

import hashlib
import runpy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
RECORDS = runpy.run_path(str(ROOT / "scripts/import-li-qingzhao-1881.py"))["records"]


class LiQingzhaoImporterTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.witness = self.directory / "scan.pdf"
        self.witness.write_bytes(b"reviewed scan")
        self.readings = self.directory / "readings.txt"
        self.fixture = "=== sample ===\n春日微風，\n花開滿庭。\n"
        self.readings.write_text(self.fixture, encoding="utf8")
        self.settings = {
            "EVIDENCE": {"scan.pdf": hashlib.sha256(b"reviewed scan").hexdigest()},
            "READINGS": self.readings,
            "READINGS_SHA256": hashlib.sha256(self.fixture.encode()).hexdigest(),
            "SELECTION": (("sample", "調", "春日", (5, 5), (2,), "", ""),),
        }

    def test_fixture_is_extracted_with_a_stable_scan_page(self):
        with patch.dict(RECORDS.__globals__, self.settings):
            poem, = RECORDS(self.directory)
        self.assertEqual(poem["text"], "春日微風，\n花開滿庭。")
        self.assertTrue(poem["source"].endswith("#page=5"))

    def test_missing_or_tampered_witness_is_rejected(self):
        with patch.dict(RECORDS.__globals__, self.settings):
            self.witness.unlink()
            with self.assertRaises(FileNotFoundError):
                RECORDS(self.directory)
            self.witness.write_bytes(b"different scan")
            with self.assertRaisesRegex(ValueError, "Reviewed evidence changed"):
                RECORDS(self.directory)

    def test_changed_readings_fail_the_hash_guard(self):
        self.readings.write_text(self.fixture.replace("花開", "花落"), encoding="utf8")
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "Reviewed readings changed"):
            RECORDS(self.directory)

    def test_even_repinned_readings_cannot_hide_gaps_or_changed_boundaries(self):
        for content, error in (
            (self.fixture.replace("花開", "花□"), "Unresolved reading"),
            (self.fixture.replace("\n花開", "\n\n花開"), "Unexpected reading-line boundaries"),
            (self.fixture.replace("=== sample ===", "=== other ==="), "Unexpected selection or order"),
        ):
            with self.subTest(error=error):
                self.readings.write_text(content, encoding="utf8")
                settings = {**self.settings, "READINGS_SHA256": hashlib.sha256(content.encode()).hexdigest()}
                with patch.dict(RECORDS.__globals__, settings), self.assertRaisesRegex(ValueError, error):
                    RECORDS(self.directory)


if __name__ == "__main__":
    unittest.main()

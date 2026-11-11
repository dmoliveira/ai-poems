"""Offline guards for the copy-Y evidence and reviewed reading boundaries."""

import hashlib
import runpy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
IMPORTER = runpy.run_path(str(ROOT / "scripts/import-blake-copy-y.py"))
PARSE = IMPORTER["parse_readings"]
RECORDS = IMPORTER["records"]


class BlakeImporterTests(unittest.TestCase):
    def setUp(self):
        self.raw = b"=== fixture ===\nFirst line\nLast line\n"
        self.selection = (("fixture", "Fixture", 123, 1, 1789, (2,), ""),)
        self.hash = hashlib.sha256(self.raw).hexdigest()

    def test_reviewed_reading_and_selection_are_guarded(self):
        with patch.dict(PARSE.__globals__, {"READINGS_SHA256": self.hash, "SELECTION": self.selection}):
            self.assertEqual(PARSE(self.raw), [("fixture", "First line\nLast line")])
            with self.assertRaisesRegex(ValueError, "Reviewed readings changed"):
                PARSE(self.raw.replace(b"Last", b"Lost"))
            with self.assertRaisesRegex(ValueError, "Unexpected selection"), patch.dict(
                PARSE.__globals__, {"SELECTION": (("other",),)}
            ):
                PARSE(self.raw)

    def test_missing_and_changed_plate_evidence_fail(self):
        expected = {"plate.jpg": hashlib.sha256(b"plate").hexdigest()}
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            with patch.dict(RECORDS.__globals__, {"EVIDENCE": expected}):
                with self.assertRaises(FileNotFoundError):
                    RECORDS(directory)
                (directory / "plate.jpg").write_bytes(b"changed")
                with self.assertRaisesRegex(ValueError, "Reviewed evidence changed: plate.jpg"):
                    RECORDS(directory)

    def test_complete_fixture_and_stanza_count_guard(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            readings = directory / "readings.txt"
            readings.write_bytes(self.raw)
            changes = {
                "EVIDENCE": {}, "READINGS": readings, "READINGS_SHA256": self.hash,
                "SELECTION": self.selection,
            }
            with patch.dict(RECORDS.__globals__, changes):
                poem, = RECORDS(directory)
                self.assertEqual(poem["text"], "First line\nLast line")
                self.assertEqual(poem["source"], "https://www.metmuseum.org/art/collection/search/123")
                self.assertEqual(poem["translations"], [])
                bad = (("fixture", "Fixture", 123, 1, 1789, (1, 1), ""),)
                with patch.dict(RECORDS.__globals__, {"SELECTION": bad}), self.assertRaisesRegex(
                    ValueError, "Unexpected verse boundaries"
                ):
                    RECORDS(directory)


if __name__ == "__main__":
    unittest.main()

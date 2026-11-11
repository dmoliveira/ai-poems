"""Offline guards for Yu Xuanji's scan-reviewed readings and excerpts."""

import hashlib
import runpy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
MODULE = runpy.run_path(str(ROOT / "scripts/import-yu-xuanji-1899.py"))
RECORDS = MODULE["records"]


def digest(data):
    return hashlib.sha256(data).hexdigest()


class YuXuanjiImporterTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.scan = self.directory / "scan.pdf"
        self.scan.write_bytes(b"sample scan")
        self.text = (
            "春風吹滿庭，\n山前花鳥鳴。\n綠楊垂影密，\n明月照江城。\n"
            "秋聲入遠樹，\n江水映長空。\n歸夢隨雲去，\n孤舟過晚風。"
        )
        self.fixture = f"=== sample ===\n{self.text}\n"
        self.readings = self.directory / "readings.txt"
        self.readings.write_text(self.fixture, encoding="utf8")
        self.excerpt = (
            "# Curated fixture\n=== sample ===\n"
            "{{SK anchor|春風吹滿庭}}{{SK notes|一作別}}山前花鶴鳴綠楊垂影密明月照江城"
            "秋聲入遠樹江水映長空歸夢隨雲去孤舟過晚風\n"
        )
        self.excerpts = self.directory / "excerpts.txt"
        self.excerpts.write_text(self.excerpt, encoding="utf8")
        self.row = {
            "slug": "sample", "title": "題", "hash": digest(self.text.encode()),
            "adjustments": (("花鶴", "花鳥"),), "note": "A variant note.",
        }
        self.settings = {
            "SCAN_FILE": "scan.pdf", "SCAN_SHA256": digest(b"sample scan"),
            "READINGS": self.readings, "READINGS_SHA256": digest(self.fixture.encode()),
            "EXCERPTS": self.excerpts, "EXCERPTS_SHA256": digest(self.excerpt.encode()),
            "SELECTION": (self.row,),
        }

    def test_records_preserve_sources_rights_and_attribution_conflict(self):
        with patch.dict(RECORDS.__globals__, self.settings):
            poem, = RECORDS(self.directory)
        self.assertEqual(poem["text"], self.text)
        self.assertEqual(poem["authorOriginal"], "魚玄機")
        self.assertIn("Wu Weiye", poem["context"])
        self.assertIn("reason for the conflict is not established", poem["context"])
        self.assertIn("not a diplomatic transcription", poem["context"])
        self.assertIn("A variant note.", poem["context"])
        self.assertTrue(poem["source"].endswith(".pdf#page=3"))
        self.assertIn("oldid=669708", poem["contextSource"])
        self.assertIn("CC BY-SA 4.0", poem["rights"])
        self.assertIn("is distributed under CC BY-SA 4.0", poem["rights"])
        self.assertIn("維基小霸王", poem["rights"])
        self.assertEqual(poem["translations"], [])
        self.assertEqual(poem["themes"], [])

    def test_missing_or_changed_scan_is_rejected(self):
        self.scan.unlink()
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaises(FileNotFoundError):
            RECORDS(self.directory)
        self.scan.write_bytes(b"changed")
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "scan changed"):
            RECORDS(self.directory)

    def test_reading_and_excerpt_file_hashes_are_required(self):
        self.readings.write_text(self.fixture.replace("花鳥", "花燕"), encoding="utf8")
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "readings changed"):
            RECORDS(self.directory)
        self.readings.write_text(self.fixture, encoding="utf8")
        self.excerpts.write_text(self.excerpt + "X", encoding="utf8")
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "excerpts changed"):
            RECORDS(self.directory)

    def test_repinned_reading_rejects_changed_text_boundaries_and_selection(self):
        cases = (
            (self.fixture.replace("花鳥", "花燕"), "poem changed"),
            (self.fixture.replace("花鳥", "花"), "reading-line boundaries"),
            (self.fixture.replace("花鳥", "花□"), "reading-line boundaries"),
            (self.fixture.replace("=== sample ===", "=== other ==="), "selection or order"),
        )
        for content, error in cases:
            with self.subTest(error=error):
                self.readings.write_text(content, encoding="utf8")
                settings = {**self.settings, "READINGS_SHA256": digest(content.encode())}
                with patch.dict(RECORDS.__globals__, settings), self.assertRaisesRegex(ValueError, error):
                    RECORDS(self.directory)

    def test_repinned_excerpt_cannot_hide_unreviewed_differences(self):
        cases = (
            (self.excerpt.replace("江城", "江山"), "Undocumented comparison"),
            (self.excerpt.replace("花鶴", "花鴉"), "comparison variant"),
            (self.excerpt.replace("{{SK notes|一作別}}", "{{unknown}}"), "comparison markup"),
            (self.excerpt + "=== sample ===\n多餘\n", "section count"),
        )
        for content, error in cases:
            with self.subTest(error=error):
                self.excerpts.write_text(content, encoding="utf8")
                settings = {**self.settings, "EXCERPTS_SHA256": digest(content.encode())}
                with patch.dict(RECORDS.__globals__, settings), self.assertRaisesRegex(ValueError, error):
                    RECORDS(self.directory)


if __name__ == "__main__":
    unittest.main()

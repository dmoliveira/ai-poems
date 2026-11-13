"""Offline evidence, selection and boundary tests for the 1896 Darío readings."""

import hashlib
import io
import json
import re
import runpy
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
MODULE = runpy.run_path(str(ROOT / "scripts/import-dario-1896.py"))
RECORDS = MODULE["make_records"]


def digest(data):
    return hashlib.sha256(data).hexdigest()


class DarioImporterTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.pdf = self.directory / MODULE["PDF"]
        self.ocr = self.directory / MODULE["OCR"]
        self.readings = self.directory / "readings.txt"
        self.pdf.write_bytes(b"fixture PDF, not a facsimile")
        self.ocr.write_bytes(b"fixture OCR, not source evidence")
        self.readings.write_bytes(MODULE["READINGS"].read_bytes())
        self.globals = {
            "READINGS": self.readings, "PDF_SHA": digest(self.pdf.read_bytes()),
            "OCR_SHA": digest(self.ocr.read_bytes()), "READINGS_SHA": digest(self.readings.read_bytes()),
        }

    def records(self):
        with patch.dict(RECORDS.__globals__, self.globals):
            return RECORDS(self.directory)

    def test_complete_poems_have_individual_scan_pages_and_no_inferred_themes(self):
        poems = self.records()
        self.assertEqual(len(poems), 12)
        for poem, (slug, title, first, last, count) in zip(poems, MODULE["SELECTION"], strict=True):
            self.assertEqual(poem["id"], f"dario-1896-{slug}")
            self.assertEqual(poem["title"], title)
            self.assertEqual(len([line for line in poem["text"].splitlines() if line]), count)
            self.assertTrue(poem["source"].endswith(f"#page={first}"))
            self.assertIn(f"PDF pp. {first}–{last}", poem["sourceTitle"])
            self.assertEqual(poem["country"], "Nicaragua")
            self.assertEqual(poem["themes"], [])
            self.assertEqual(poem["translations"], [])
            self.assertIn("image-reuse terms are not established", poem["rights"])
        title_variant = poems[-1]
        self.assertEqual(title_variant["title"], "Ite misa est")
        self.assertEqual(title_variant["displayTitle"], "Ite, missa est")
        self.assertEqual(title_variant["displayTitleLang"], "la")

    def test_missing_or_tampered_evidence_is_rejected(self):
        for path, error in (
            (self.pdf, "Historical PDF changed"),
            (self.ocr, "OCR evidence changed"),
            (self.readings, "Reviewed readings changed"),
        ):
            with self.subTest(path=path.name):
                original = path.read_bytes()
                path.unlink()
                with self.assertRaises(FileNotFoundError):
                    self.records()
                path.write_bytes(original + b"changed")
                with self.assertRaisesRegex(ValueError, error):
                    self.records()
                path.write_bytes(original)

    def test_repinned_readings_still_require_order_boundaries_and_complete_lines(self):
        original = self.readings.read_text(encoding="utf8")
        pieces = re.split(r"(?m)^@@ ([a-z0-9-]+)\n", original)
        for changed, error in (
            (original.replace("@@ sonatina\n", "", 1), "reading boundaries"),
            (original.replace("@@ sonatina", "@@ other", 1), "selection or order"),
            (original.replace(pieces[4], pieces[2], 1), "Duplicate reviewed poem"),
            (original.replace("La princesa está triste... ¿qué tendrá la princesa?\n", "", 1),
             "Incomplete or malformed poem: sonatina"),
            (original.replace("Los suspiros se escapan", " Los suspiros se escapan", 1),
             "Incomplete or malformed poem: sonatina"),
        ):
            with self.subTest(error=error):
                self.readings.write_text(changed, encoding="utf8")
                self.globals["READINGS_SHA"] = digest(self.readings.read_bytes())
                with self.assertRaisesRegex(ValueError, error):
                    self.records()

    def test_check_mode_refuses_drift_without_overwriting(self):
        output = self.directory / "output.json"
        output.write_text(json.dumps(self.records(), ensure_ascii=False, indent=2) + "\n", encoding="utf8")
        with (
            patch.dict(MODULE["main"].__globals__, {**self.globals, "OUTPUT": output, "ROOT": self.directory}),
            patch("sys.argv", ["import-dario-1896.py", str(self.directory), "--check"]),
            redirect_stdout(io.StringIO()),
        ):
            MODULE["main"]()
            output.write_text("changed", encoding="utf8")
            with self.assertRaisesRegex(ValueError, "records differ"):
                MODULE["main"]()
        self.assertEqual(output.read_text(encoding="utf8"), "changed")


if __name__ == "__main__":
    unittest.main()

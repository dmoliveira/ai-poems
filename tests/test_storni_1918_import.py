"""Offline evidence, selection and boundary tests for the 1918 Storni readings."""

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
MODULE = runpy.run_path(str(ROOT / "scripts/import-storni-1918.py"))
RECORDS = MODULE["make_records"]


def digest(data):
    return hashlib.sha256(data).hexdigest()


class StorniImporterTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.pdf = self.directory / MODULE["PDF"]
        self.readings = self.directory / "readings.txt"
        self.pdf.write_bytes(b"fixture PDF, not a facsimile")
        self.readings.write_bytes(MODULE["READINGS"].read_bytes())
        self.globals = {
            "READINGS": self.readings, "PDF_SHA": digest(self.pdf.read_bytes()),
            "READINGS_SHA": digest(self.readings.read_bytes()),
        }

    def records(self):
        with patch.dict(RECORDS.__globals__, self.globals):
            return RECORDS(self.directory)

    def test_complete_poems_have_individual_scan_pages_and_no_inferred_themes(self):
        poems = self.records()
        self.assertEqual(len(poems), 28)
        for poem, (slug, title, first, last, count) in zip(poems, MODULE["SELECTION"], strict=True):
            self.assertEqual(poem["id"], f"storni-1918-{slug}")
            self.assertEqual(poem["title"], title)
            self.assertEqual(len([line for line in poem["text"].splitlines() if line]), count)
            self.assertTrue(poem["source"].endswith(f"#page={first}"))
            page_label = f"PDF p. {first}" if first == last else f"PDF pp. {first}–{last}"
            self.assertIn(page_label, poem["sourceTitle"])
            self.assertEqual(poem["country"], "Argentina")
            self.assertNotIn("creationPlace", poem)
            self.assertEqual(poem["themes"], [])
            self.assertEqual(poem["translations"], [])
            self.assertIn("public domain in the United States", poem["rights"])
        by_id = {poem["id"]: poem for poem in poems}
        white = by_id["storni-1918-tu-me-quieres-blanca"]
        self.assertIn("y lévate al alba.", white["text"])
        self.assertIn("‘y límpiate al alba’", white["context"])
        saturday = by_id["storni-1918-sabado"]
        self.assertTrue(saturday["text"].startswith("Levanté temprano"))
        self.assertIn("‘Me levanté temprano’", saturday["context"])
        what = by_id["storni-1918-que-diria"]
        self.assertIn("por extra fantasía", what["text"])
        self.assertIn("‘ultra fantasía’", what["context"])
        self.assertTrue(what["contextSource"].endswith("#page=18"))

    def test_missing_or_tampered_evidence_is_rejected(self):
        for path, error in ((self.pdf, "Historical PDF changed"), (self.readings, "Reviewed readings changed")):
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
            (original.replace("@@ asi\n", "", 1), "reading boundaries"),
            (original.replace("@@ asi", "@@ other", 1), "selection or order"),
            (original.replace(pieces[4], pieces[2], 1), "Duplicate reviewed poem"),
            (original.replace("Hice el libro así:\n", "", 1), "Incomplete or malformed poem: asi"),
            (original.replace("Gimiendo, llorando", " Gimiendo, llorando", 1), "Incomplete or malformed poem: asi"),
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
            patch("sys.argv", ["import-storni-1918.py", str(self.directory), "--check"]),
            redirect_stdout(io.StringIO()),
        ):
            MODULE["main"]()
            output.write_text("changed", encoding="utf8")
            with self.assertRaisesRegex(ValueError, "records differ"):
                MODULE["main"]()
        self.assertEqual(output.read_text(encoding="utf8"), "changed")


if __name__ == "__main__":
    unittest.main()

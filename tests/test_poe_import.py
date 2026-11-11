"""Small offline checks for the Poe source guard and illustration parser."""

import hashlib
import json
import runpy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
IMPORTER = runpy.run_path(str(ROOT / "scripts/import-poe-1900.py"))
EXTRACT = IMPORTER["extract"]
RECORDS = IMPORTER["records"]


class PoeImporterTests(unittest.TestCase):
    def setUp(self):
        self.book = (
            "\nTHE RAVEN\n\n[Illustration: A CAPTION\nCONTINUED]\n\n"
            "  First line\n  Middle line\n  Last line\n\n"
            "THE BELLS\n\nPOEMS WRITTEN IN YOUTH\n"
        )
        text = "First line\nMiddle line\nLast line"
        self.item = {
            "slug": "fixture",
            "heading": "THE RAVEN",
            "nextHeading": "THE BELLS",
            "illustrations": 1,
            "segments": [3],
            "first": "First line",
            "last": "Last line",
            "textSha256": hashlib.sha256(text.encode()).hexdigest(),
        }
        self.text = text

    def test_multiline_caption_is_not_verse(self):
        self.assertEqual(EXTRACT(self.book, self.item), self.text)

    def test_rejects_unexpected_markup_or_changed_reading(self):
        with self.assertRaisesRegex(ValueError, "Unrecognized markup"):
            EXTRACT(self.book.replace("Middle line", "[Footnote: unexpected]\n  Middle line"), self.item)
        with self.assertRaisesRegex(ValueError, "Reviewed reading changed"):
            EXTRACT(self.book.replace("Middle line", "Altered line"), self.item)
        with self.assertRaisesRegex(ValueError, "Ambiguous poem heading"):
            EXTRACT(self.book.replace("THE BELLS\n", "THE BELLS\n\nTHE BELLS\n"), self.item)

    def test_missing_and_tampered_witnesses_fail_before_extraction(self):
        valid = {"pg76996.txt": b"pinned text", "poe-1900.pdf": b"pinned scan"}
        expected = {name: hashlib.sha256(data).hexdigest() for name, data in valid.items()}
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            manifest = directory / "manifest.json"
            manifest.write_text(json.dumps({"witnesses": {name: {"sha256": sha} for name, sha in expected.items()}}))
            with patch.dict(RECORDS.__globals__, {"MANIFEST": manifest, "EVIDENCE": expected}):
                with self.assertRaises(FileNotFoundError):
                    RECORDS(directory)
                (directory / "pg76996.txt").write_bytes(b"changed text")
                with self.assertRaisesRegex(ValueError, "Reviewed evidence changed: pg76996.txt"):
                    RECORDS(directory)
                (directory / "pg76996.txt").write_bytes(valid["pg76996.txt"])
                (directory / "poe-1900.pdf").write_bytes(b"changed scan")
                with self.assertRaisesRegex(ValueError, "Reviewed evidence changed: poe-1900.pdf"):
                    RECORDS(directory)


if __name__ == "__main__":
    unittest.main()

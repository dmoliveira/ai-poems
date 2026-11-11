"""Offline checks for the Keats archive, headings and complete verse boundaries."""

import hashlib
import io
import json
import runpy
import tempfile
import unittest
import warnings
import zipfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
IMPORTER = runpy.run_path(str(ROOT / "scripts/import-keats-1909.py"))
EXTRACT = IMPORTER["extract"]
RECORDS = IMPORTER["records"]


def digest(data):
    return hashlib.sha256(data).hexdigest()


class KeatsImporterTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.html = (
            '<p><span class="pagenum"><a id="Page_1"></a>[1]</span></p>'
            '<h2>FIXTURE.</h2><div class="poem"><div class="stanza">'
            '<span class="i0">1.<br /></span></div><div class="stanza">'
            '<span class="i0">First &amp; fine<span class="linenum">1</span><br /></span>'
            '<span class="i0">A middle line<br /></span>'
            '<span class="i0">Last line.<br /></span></div></div>'
            '<p><span class="pagenum"><a id="Page_2"></a>[2]</span></p>'
        )
        self.text = "First & fine\nA middle line\nLast line."
        self.item = {
            "slug": "fixture", "title": "Fixture", "pages": [1, 1],
            "headings": ["<h2>FIXTURE.</h2>"], "stanzas": [3], "numbers": [1],
            "first": "First & fine", "last": "Last line.", "textSha256": digest(self.text.encode()),
        }
        self.manifest = self.directory / "manifest.json"
        self.manifest.write_text(json.dumps({"poems": [self.item]}), encoding="utf8")
        self.archive = self.directory / "pg23684-h.zip"
        self.archive_bytes = self.make_archive()
        self.archive.write_bytes(self.archive_bytes)
        self.settings = {
            "ARCHIVE_SHA256": digest(self.archive_bytes), "MANIFEST": self.manifest,
            "SELECTED": ("fixture",),
        }

    def make_archive(self, *, image=True, duplicate=False):
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as archive:
            archive.writestr("23684-h/23684-h.htm", self.html)
            if image:
                archive.writestr("23684-h/images/1.png", b"page")
            if duplicate:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", UserWarning)
                    archive.writestr("23684-h/images/1.png", b"second page")
        return output.getvalue()

    def test_fixture_keeps_verse_but_omits_editor_numbers(self):
        self.assertEqual(EXTRACT(self.html, self.item), self.text)
        with patch.dict(RECORDS.__globals__, self.settings):
            poem, = RECORDS(self.directory)
        self.assertEqual(poem["text"], self.text)
        self.assertEqual(poem["source"], "https://www.gutenberg.org/ebooks/23684")
        self.assertTrue(poem["contextSource"].endswith("/images/1.png"))
        self.assertIn("public domain in the United States", poem["rights"])
        self.assertEqual(poem["translations"], [])

    def test_missing_or_changed_archive_is_rejected(self):
        self.archive.unlink()
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaises(FileNotFoundError):
            RECORDS(self.directory)
        self.archive.write_bytes(b"changed")
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "archive changed"):
            RECORDS(self.directory)

    def test_missing_or_repeated_archive_page_is_rejected_even_if_repinned(self):
        for content in (self.make_archive(image=False), self.make_archive(duplicate=True)):
            with self.subTest(size=len(content)):
                self.archive.write_bytes(content)
                settings = {**self.settings, "ARCHIVE_SHA256": digest(content)}
                with patch.dict(RECORDS.__globals__, settings), self.assertRaisesRegex(ValueError, "archive member"):
                    RECORDS(self.directory)

    def test_page_heading_and_number_guards(self):
        cases = (
            (self.html.replace('id="Page_2"', 'id="Page_1"'), "page boundaries"),
            (self.html.replace("FIXTURE.", "OTHER."), "poem heading"),
            (self.html.replace(">1.<br", ">2.<br"), "stanza boundaries"),
        )
        for html, error in cases:
            with self.subTest(error=error), self.assertRaisesRegex(ValueError, error):
                EXTRACT(html, self.item)

    def test_middle_line_change_cannot_hide_behind_the_same_boundaries(self):
        changed = self.html.replace("A middle line", "A different line")
        with self.assertRaisesRegex(ValueError, "Reviewed reading changed"):
            EXTRACT(changed, self.item)

    def test_selection_and_page_range_are_guarded(self):
        with patch.dict(RECORDS.__globals__, {**self.settings, "SELECTED": ("other",)}), self.assertRaisesRegex(
            ValueError, "Unexpected reviewed selection"
        ):
            RECORDS(self.directory)
        bad = {**self.item, "pages": [1, 500000000]}
        self.manifest.write_text(json.dumps({"poems": [bad]}), encoding="utf8")
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "Invalid page range"):
            RECORDS(self.directory)


if __name__ == "__main__":
    unittest.main()

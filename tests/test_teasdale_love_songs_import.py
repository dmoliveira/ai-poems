"""Offline guards for Teasdale extraction and the separate scan comparison."""

import hashlib
import json
import runpy
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
MODULE = runpy.run_path(str(ROOT / "scripts/import-teasdale-love-songs.py"))
EXTRACT = MODULE["extract"]
COMPARE = MODULE["compare_ocr"]
RECORDS = MODULE["records"]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def make_xml(pages):
    root = ET.Element("DjVuXML")
    for lines in pages:
        page = ET.SubElement(root, "OBJECT")
        for text in lines:
            line = ET.SubElement(page, "LINE")
            ET.SubElement(line, "WORD").text = text
    return ET.tostring(root)


class TeasdaleImporterTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.verse = "First & fine\nA middle line\nLast line."
        self.document = (
            '<p id="id00025">Sample</p>'
            '<p id="id00026">First &amp; fine<br>A middle\n line<br>Last line.<br></p>'
            '<h2 id="id00029">Next</h2>'
        )
        self.row = {
            "slug": "sample", "title": "Sample", "heading": "id00025", "nextHeading": "id00029",
            "pages": [3, 4], "stanzas": [3], "textSha256": digest(self.verse.encode()),
            "ocrPrefixNoise": ["FRONT"], "ocrNoise": ["[3]", "[4]"], "continuationHeading": "RUNNING",
            "ocrCorrections": [["(S) A middle-", "A middle-"]],
        }
        self.pages = [[] for _ in range(23)]
        self.pages[21] = ["FRONT", "SAMPLE", "First & fine", "(S) A middle-", "[3]"]
        self.pages[22] = ["RUNNING", "line", "Last line.", "[4]"]
        self.manifest = self.directory / "manifest.json"
        self.inputs = {
            "gutenberg-442.html": self.document.encode(),
            "teasdale-michigan.pdf": b"sample scan",
            "teasdale-michigan-ocr.xml": make_xml(self.pages),
        }
        for name, data in self.inputs.items():
            (self.directory / name).write_bytes(data)
        self.write_manifest([self.row])

    def write_manifest(self, rows):
        self.manifest.write_text(json.dumps({"poems": rows}), encoding="utf8")
        self.settings = {
            "EVIDENCE": {name: digest(data) for name, data in self.inputs.items()},
            "MANIFEST": self.manifest,
            "MANIFEST_SHA256": digest(self.manifest.read_bytes()),
            "SELECTED": ("sample",),
        }

    def test_extract_and_comparison_preserve_lines_across_page_wrap(self):
        self.assertEqual(EXTRACT(self.document, self.row), self.verse)
        objects = ET.fromstring(make_xml(self.pages)).findall(".//OBJECT")
        COMPARE(objects, self.row, self.verse)
        with patch.dict(RECORDS.__globals__, self.settings):
            poem, = RECORDS(self.directory)
        self.assertEqual(poem["text"], self.verse)
        self.assertEqual(poem["authorId"], "sara-teasdale")
        self.assertEqual(poem["source"], "https://www.gutenberg.org/ebooks/442")
        self.assertTrue(poem["contextSource"].endswith("/page/n21/mode/1up"))
        self.assertIn("not established as the same copy", poem["context"])
        self.assertIn("not exhaustive punctuation collation", poem["context"])
        self.assertIn("public domain in the United States", poem["rights"])
        self.assertIn("A. Light and L. Bowser", poem["rights"])
        self.assertEqual(poem["translations"], [])
        self.assertEqual(poem["themes"], [])

    def test_missing_and_changed_source_files_fail(self):
        source = self.directory / "teasdale-michigan.pdf"
        source.unlink()
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaises(FileNotFoundError):
            RECORDS(self.directory)
        source.write_bytes(b"changed")
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "evidence changed"):
            RECORDS(self.directory)

    def test_changed_manifest_and_selection_fail(self):
        self.manifest.write_text(json.dumps({"poems": []}), encoding="utf8")
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "manifest changed"):
            RECORDS(self.directory)
        self.write_manifest([])
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "selection"):
            RECORDS(self.directory)

    def test_repinned_html_cannot_change_reviewed_verse(self):
        document = self.document.replace("A middle", "A different")
        self.inputs["gutenberg-442.html"] = document.encode()
        (self.directory / "gutenberg-442.html").write_bytes(self.inputs["gutenberg-442.html"])
        self.write_manifest([self.row])
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "reading changed"):
            RECORDS(self.directory)

    def test_missing_or_duplicated_boundaries_and_bad_stanzas_fail(self):
        cases = (
            (self.document, {**self.row, "heading": "id99999"}, "boundaries"),
            (self.document, {**self.row, "title": "Other"}, "heading"),
            (self.document, {**self.row, "stanzas": [2, 1]}, "stanza boundaries"),
            (self.document + '<p id="id00025">Sample</p>', self.row, "boundaries"),
        )
        for document, row, error in cases:
            with self.subTest(error=error), self.assertRaisesRegex(ValueError, error):
                EXTRACT(document, row)

    def test_unmarked_or_unexpected_paragraph_and_break_fail(self):
        cases = (
            (self.document.replace('<h2 id="id00029">', '<p>Standalone line</p><h2 id="id00029">'),
             "non-verse"),
            (self.document.replace("A middle", "<br>A middle"), "empty or unterminated"),
            (self.document.replace("Last line.<br>", "Last line."), "empty or unterminated"),
        )
        for document, error in cases:
            with self.subTest(error=error), self.assertRaisesRegex(ValueError, error):
                EXTRACT(document, self.row)

    def test_repinned_ocr_cannot_hide_missing_or_extra_verse(self):
        for altered in (
            ["FRONT", "SAMPLE", "First & fine", "(S) A middle-", "Intruding line", "[3]"],
            ["FRONT", "SAMPLE", "First & fine", "[3]"],
            ["FRONT", "New verse before heading", "SAMPLE", "First & fine", "(S) A middle-", "[3]"],
        ):
            pages = [list(page) for page in self.pages]
            pages[21] = altered
            self.inputs["teasdale-michigan-ocr.xml"] = make_xml(pages)
            (self.directory / "teasdale-michigan-ocr.xml").write_bytes(self.inputs["teasdale-michigan-ocr.xml"])
            self.write_manifest([self.row])
            with (self.subTest(altered=altered), patch.dict(RECORDS.__globals__, self.settings),
                  self.assertRaisesRegex(ValueError, "Unexpected OCR")):
                RECORDS(self.directory)

    def test_unexpected_heading_correction_page_or_noise_fail(self):
        objects = ET.fromstring(make_xml(self.pages)).findall(".//OBJECT")
        cases = (
            ({**self.row, "pages": [2, 3]}, "page range"),
            ({**self.row, "continuationHeading": "Missing"}, "OCR heading"),
            ({**self.row, "ocrCorrections": []}, "OCR text or noise"),
            ({**self.row, "ocrNoise": []}, "OCR text or noise"),
            ({**self.row, "ocrPrefixNoise": []}, "before heading"),
        )
        for row, error in cases:
            with self.subTest(error=error), self.assertRaisesRegex(ValueError, error):
                COMPARE(objects, row, self.verse)


if __name__ == "__main__":
    unittest.main()

"""Offline guards for Rossetti's preformatted text and print comparison."""

import hashlib
import json
import runpy
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
MODULE = runpy.run_path(str(ROOT / "scripts/import-rossetti-1906.py"))
SOURCE = MODULE["Source"]
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


def parse(document):
    source = SOURCE()
    source.feed(document)
    source.close()
    return source.elements


class RossettiImporterTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.verse = "First & fine\nA middle line\n\nLast line."
        self.document = (
            '<h4><a href="#one">SAMPLE.</a></h4><h5>SONNET.</h5>'
            '<pre>First &amp; fine\nA middle <a id="p2"><span class="pagenum">[2]</span></a>line</pre>'
            '<pre>Last line.</pre><h4><a href="#two">NEXT.</a></h4>'
        )
        self.row = {
            "slug": "sample", "title": "Sample", "heading": "#one", "sourceHeading": "SAMPLE.",
            "nextHeading": "#two", "pages": [1, 2], "stanzas": [2, 1], "joins": ["stanza"],
            "labels": ["SONNET."], "textSha256": digest(self.verse.encode()),
            "ocrStart": [1, 1], "ocrEnd": [2, 1], "ocrNoise": ["RUNNING"],
            "ocrCorrections": [["A middIe line", "A middle line"]],
        }
        self.pages = [["TITLE", "First & fine", "A middIe line"], ["RUNNING", "Last line.", "NEXT"]]
        self.manifest = self.directory / "manifest.json"
        self.inputs = {
            "gutenberg-19188.html": self.document.encode(),
            "rossetti-1888-boston.pdf": b"sample scan",
            "rossetti-1888-boston-ocr.xml": make_xml(self.pages),
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

    def test_extract_and_ordered_comparison_preserve_page_and_block_boundaries(self):
        self.assertEqual(EXTRACT(parse(self.document), self.row), self.verse)
        COMPARE(ET.fromstring(make_xml(self.pages)).findall(".//OBJECT"), self.row, self.verse)
        with patch.dict(RECORDS.__globals__, self.settings):
            poem, = RECORDS(self.directory)
        self.assertEqual(poem["text"], self.verse)
        self.assertEqual(poem["source"], "https://www.gutenberg.org/ebooks/19188")
        self.assertTrue(poem["contextSource"].endswith("/page/n0/mode/1up"))
        self.assertIn("not established as the same copy", poem["context"])
        self.assertIn("not exhaustive punctuation", poem["context"])
        self.assertIn("public domain in the United States", poem["rights"])
        self.assertEqual(poem["translations"], [])
        self.assertEqual(poem["themes"], [])

    def test_may_regression_preserves_thirteen_lines_across_adjacent_pre_blocks(self):
        first = (
            "I cannot tell you how it was;\nBut this I know: it came to pass\n"
            "Upon a bright and breezy day\nWhen May was young; ah, pleasant May!\n"
            "As yet the poppies were not born\nBetween the blades of tender corn;\n"
            "The last eggs had not hatched as yet,\nNor any bird foregone its mate."
        )
        second = (
            "I cannot tell you what it was;\nBut this I know: it did but pass.\n"
            "It passed away with sunny May,\nWith all sweet things it passed away,\n"
            "And left me old, and cold, and gray."
        )
        document = (
            '<h4><a href="#may">MAY.</a></h4><pre>' + first + '</pre><pre>'
            '<a id="p58"><span class="pagenum">[58]</span></a>  ' + second + '</pre>'
            '<h4><a href="#next">NEXT.</a></h4>'
        )
        expected = first + "\n\n" + second
        row = {
            "slug": "may", "heading": "#may", "sourceHeading": "MAY.", "nextHeading": "#next",
            "joins": ["stanza"], "stanzas": [8, 5], "textSha256": digest(expected.encode()),
        }
        text = EXTRACT(parse(document), row)
        self.assertEqual(text, expected)
        self.assertEqual(len([line for line in text.splitlines() if line]), 13)
        self.assertIn("Nor any bird foregone its mate.\n\nI cannot tell you what it was;", text)
        with self.assertRaisesRegex(ValueError, "stanza boundaries"):
            EXTRACT(parse(document), {**row, "joins": ["line"]})

    def test_missing_or_changed_sources_and_manifest_fail(self):
        scan = self.directory / "rossetti-1888-boston.pdf"
        scan.unlink()
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaises(FileNotFoundError):
            RECORDS(self.directory)
        scan.write_bytes(b"changed")
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "evidence changed"):
            RECORDS(self.directory)
        scan.write_bytes(self.inputs["rossetti-1888-boston.pdf"])
        self.manifest.write_text('{"poems":[]}', encoding="utf8")
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "manifest changed"):
            RECORDS(self.directory)
        self.write_manifest([])
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "selection"):
            RECORDS(self.directory)

    def test_repinned_source_cannot_change_reviewed_reading(self):
        self.inputs["gutenberg-19188.html"] = self.document.replace("middle", "different").encode()
        (self.directory / "gutenberg-19188.html").write_bytes(self.inputs["gutenberg-19188.html"])
        self.write_manifest([self.row])
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "reading changed"):
            RECORDS(self.directory)

    def test_unexpected_boundaries_headings_labels_and_markup_fail(self):
        cases = (
            (self.document, {**self.row, "heading": "#missing"}, "boundaries"),
            (self.document, {**self.row, "sourceHeading": "OTHER."}, "heading"),
            (self.document, {**self.row, "labels": []}, "labels"),
            (self.document, {**self.row, "stanzas": [3]}, "stanza"),
            (self.document + '<h4><a href="#one">SAMPLE.</a></h4>', self.row, "boundaries"),
            (self.document.replace('<pre>Last', '<p>Unexpected</p><pre>Last'), self.row, "source element"),
            (self.document.replace('<pre>Last', 'Unexpected text<pre>Last'), self.row, "source element"),
            (self.document.replace('First &amp; fine', 'First<br> &amp; fine'), self.row, "verse markup"),
        )
        for document, row, error in cases:
            with self.subTest(error=error), self.assertRaisesRegex(ValueError, error):
                EXTRACT(parse(document), row)

    def test_ocr_requires_whole_lines_and_explicit_corrections(self):
        objects = ET.fromstring(make_xml(self.pages)).findall(".//OBJECT")
        with self.assertRaisesRegex(ValueError, "OCR"):
            COMPARE(objects, {**self.row, "ocrCorrections": []}, self.verse)
        pages = [["TITLE", "First & fine", "A middle lin"], self.pages[1]]
        with self.assertRaisesRegex(ValueError, "OCR"):
            COMPARE(ET.fromstring(make_xml(pages)).findall(".//OBJECT"),
                    {**self.row, "ocrCorrections": []}, self.verse)
        house = [["To seek the much-frequented hous^"]]
        row = {"slug": "house", "ocrStart": [1, 0], "ocrEnd": [1, 0]}
        objects = ET.fromstring(make_xml(house)).findall(".//OBJECT")
        with self.assertRaisesRegex(ValueError, "OCR"):
            COMPARE(objects, row, "To seek the much-frequented house")
        row["ocrCorrections"] = [[house[0][0], "To seek the much-frequented house"]]
        COMPARE(objects, row, "To seek the much-frequented house")

    def test_comparison_differences_must_be_explicit_and_used(self):
        pages = [["First line", "A variant line"]]
        objects = ET.fromstring(make_xml(pages)).findall(".//OBJECT")
        row = {"slug": "variant", "ocrStart": [1, 0], "ocrEnd": [1, 1]}
        reading = "First line\nA reading line"
        with self.assertRaisesRegex(ValueError, "OCR"):
            COMPARE(objects, row, reading)
        row["comparisonDifferences"] = [["A variant line", "A reading line"]]
        COMPARE(objects, row, reading)
        row["comparisonDifferences"].append(["Unused line", "A reading line"])
        with self.assertRaisesRegex(ValueError, "OCR"):
            COMPARE(objects, row, reading)

    def test_accent_loss_requires_a_reviewed_ocr_correction(self):
        objects = ET.fromstring(make_xml([["She sleeps a charmed sleep"]])).findall(".//OBJECT")
        row = {"slug": "accent", "ocrStart": [1, 0], "ocrEnd": [1, 0]}
        with self.assertRaisesRegex(ValueError, "OCR"):
            COMPARE(objects, row, "She sleeps a charmèd sleep")
        row["ocrCorrections"] = [["She sleeps a charmed sleep", "She sleeps a charmèd sleep"]]
        COMPARE(objects, row, "She sleeps a charmèd sleep")

    def test_ocr_missing_extra_reordered_noise_and_bad_range_fail(self):
        cases = (
            [["TITLE", "First & fine", "Extra", "A middIe line"], self.pages[1]],
            [["TITLE", "A middIe line", "First & fine"], self.pages[1]],
            [["TITLE", "First & fine"], self.pages[1]],
            [self.pages[0], ["UNEXPECTED", "Last line.", "NEXT"]],
        )
        for pages in cases:
            with self.subTest(pages=pages), self.assertRaisesRegex(ValueError, "OCR|line range"):
                COMPARE(ET.fromstring(make_xml(pages)).findall(".//OBJECT"), self.row, self.verse)
        with self.assertRaisesRegex(ValueError, "page range"):
            COMPARE(ET.fromstring(make_xml(self.pages)).findall(".//OBJECT"),
                    {**self.row, "ocrStart": [0, 0]}, self.verse)


if __name__ == "__main__":
    unittest.main()

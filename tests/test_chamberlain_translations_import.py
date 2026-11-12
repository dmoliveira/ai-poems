"""Offline source, boundary and tamper tests for the Chamberlain readings."""

import hashlib
import runpy
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
MODULE = runpy.run_path(str(ROOT / "scripts/import-chamberlain-translations.py"))
RECORDS = MODULE["records"]
READING = MODULE["reading"]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def xml_pages(pages):
    root = ET.Element("DjVuXML")
    for lines in pages:
        page = ET.SubElement(root, "OBJECT")
        for line in lines:
            ET.SubElement(ET.SubElement(page, "LINE"), "WORD").text = line
    return ET.tostring(root)


class ChamberlainTranslationsImporterTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.rows = []
        pages = []
        for index, original in enumerate(MODULE["SELECTION"], 1):
            row = {**original, "page": index}
            self.rows.append(row)
            after = [] if row["after"] == row["end"] else [row["after"]]
            pages.append(["Earlier material", row["start"], row["marker"], *row["ocr"], *after, row["end"], "Later material"])
        self.rows = tuple(self.rows)
        self.files = {
            "chamberlain-1902-transaction-vol30.pdf": b"reviewed 1902 volume",
            "chamberlain-1902-transaction-vol30-ocr.xml": xml_pages(pages),
            "chamberlain-1902-haiku-public-copy.pdf": b"separately digitized copy of same edition",
        }
        for name, data in self.files.items():
            (self.directory / name).write_bytes(data)
        self.settings = {"EVIDENCE": {name: digest(data) for name, data in self.files.items()}, "SELECTION": self.rows}

    def test_complete_versions_retain_individual_sources_credits_and_caveats(self):
        with patch.dict(RECORDS.__globals__, self.settings):
            result = RECORDS(self.directory)
        self.assertEqual(set(result), {row["id"] for row in self.rows})
        for row in self.rows:
            item = result[row["id"]][0]
            self.assertEqual(item["language"], "English")
            self.assertEqual(item["text"], "\n".join(row["lines"]))
            self.assertEqual(item["translator"], "Basil Hall Chamberlain · 1902")
            self.assertTrue(item["source"].endswith(f'#page={row["page"]}'))
            self.assertIn("public domain in the United States", item["rights"])
            self.assertIn("Japanese working edition is not established", item["rights"])
            self.assertIn(row["note"], item["rights"])

    def test_entry_number_marker_and_consecutive_ocr_lines_are_required(self):
        row = self.rows[0]
        good = [row["start"], row["marker"], *row["ocr"], row["end"]]
        def check(lines, message):
            pages = ET.fromstring(xml_pages([lines])).findall(".//OBJECT")
            with self.assertRaisesRegex(ValueError, message):
                READING(pages, row)
        self.assertEqual(READING(ET.fromstring(xml_pages([good])).findall(".//OBJECT"), row), "\n".join(row["lines"]))
        for lines, message in [
            ([*good, row["start"]], "entry boundaries"),
            ([row["end"], *good[:-1]], "entry boundaries"),
            ([row["start"], *row["ocr"], row["end"]], "romanization or byline"),
            ([row["start"], row["marker"], row["ocr"][0], "extra", row["ocr"][1], row["end"]], "verse boundaries"),
            ([row["start"], row["marker"], *row["ocr"], "extra verse", row["end"]], "verse boundaries"),
            ([row["start"], row["marker"], row["ocr"][0], "changed", row["end"]], "OCR reading"),
            ([row["start"], row["marker"], *row["ocr"], row["ocr"][1], row["end"]], "OCR reading"),
            ([row["start"], *row["ocr"], row["marker"], row["end"]], "verse boundaries"),
        ]:
            with self.subTest(message=message):
                check(lines, message)
        with self.assertRaisesRegex(ValueError, "OCR page"):
            READING([], row)

    def test_changed_transcription_or_hash_fails(self):
        row = self.rows[0]
        pages = ET.fromstring(xml_pages([[row["start"], row["marker"], *row["ocr"], row["end"]]])).findall(".//OBJECT")
        for changed in [{**row, "lines": ("Altered", row["lines"][1])}, {**row, "sha256": "0" * 64}]:
            with self.assertRaisesRegex(ValueError, "translation changed"):
                READING(pages, changed)

    def test_missing_or_modified_evidence_is_rejected(self):
        path = self.directory / "chamberlain-1902-haiku-public-copy.pdf"
        path.unlink()
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaises(FileNotFoundError):
            RECORDS(self.directory)
        path.write_bytes(b"changed")
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "evidence changed"):
            RECORDS(self.directory)

    def test_repinned_ocr_cannot_silently_change_an_entry(self):
        name = "chamberlain-1902-transaction-vol30-ocr.xml"
        path = self.directory / name
        before = self.rows[0]["ocr"][0].encode()
        data = self.files[name].replace(before, b"altered OCR line", 1)
        self.assertNotEqual(data, self.files[name])
        path.write_bytes(data)
        evidence = {**self.settings["EVIDENCE"], name: digest(data)}
        with patch.dict(RECORDS.__globals__, {**self.settings, "EVIDENCE": evidence}), \
                self.assertRaisesRegex(ValueError, "OCR reading"):
            RECORDS(self.directory)

    def test_duplicate_selected_id_fails(self):
        with patch.dict(RECORDS.__globals__, {**self.settings, "SELECTION": (*self.rows, self.rows[0])}), \
                self.assertRaisesRegex(ValueError, "Duplicate selected poem"):
            RECORDS(self.directory)


if __name__ == "__main__":
    unittest.main()

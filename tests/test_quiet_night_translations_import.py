"""Offline source-boundary, reading and tamper checks for Quiet Night versions."""

import hashlib
import runpy
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
MODULE = runpy.run_path(str(ROOT / "scripts/import-quiet-night-translations.py"))
RECORDS = MODULE["records"]
READING = MODULE["reading"]
BETWEEN = MODULE["between"]
OCR_PAGES = MODULE["ocr_pages"]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def xml_pages(pages):
    root = ET.Element("DjVuXML")
    for text in pages:
        page = ET.SubElement(root, "OBJECT")
        for line in text.splitlines():
            ET.SubElement(ET.SubElement(page, "LINE"), "WORD").text = line
    return ET.tostring(root)


class QuietNightTranslationsImporterTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        rows = [dict(row) for row in MODULE["SELECTION"]]
        rows[0]["pages"] = (1, 2)
        rows[1]["pages"] = (1,)
        self.rows = tuple(rows)
        cranmer, obata = ("\n".join(row["lines"]) for row in rows)
        cranmer_ocr = cranmer.replace("      That for a space", "62 LI PO\nThat for a space")
        first, second = cranmer_ocr.split("62 LI PO", 1)
        obata_ocr = obata.replace("ground.", "ground, jfc?").replace("moon;", "moon; ^J^")
        self.files = {
            "lutejade-1909-london.pdf": b"1909 scan",
            "lutejade-1909-london-ocr.xml": xml_pages([
                f"{rows[0]['start']}\n{first}", f"62 LI PO{second}\n{rows[0]['end']}",
            ]),
            "gutenberg-390.txt": cranmer.encode(),
            "obata-li-po-1923-london.pdf": b"1923 scan",
            "obata-li-po-1923-ocr.xml": xml_pages([f"{rows[1]['start']}\n{obata_ocr}\n{rows[1]['end']}"]),
        }
        for name, data in self.files.items():
            (self.directory / name).write_bytes(data)
        self.settings = {"EVIDENCE": {name: digest(data) for name, data in self.files.items()}, "SELECTION": self.rows}

    def test_both_complete_versions_preserve_order_credits_and_caveats(self):
        with patch.dict(RECORDS.__globals__, self.settings):
            result = RECORDS(self.directory)
        self.assertEqual(list(result), ["quiet-night-thought-li-bai"])
        translations = result["quiet-night-thought-li-bai"]
        self.assertEqual(len(translations), 2)
        for row, item in zip(self.rows, translations, strict=True):
            self.assertEqual(item["text"], "\n".join(row["lines"]))
            self.assertEqual(item["language"], "English")
            self.assertEqual(item["title"], row["title"])
            self.assertEqual(item["translator"], row["translator"])
            self.assertEqual(item["source"], row["source"])
            self.assertIn("public domain in the United States; check local law", item["rights"])
            self.assertIn("not established", item["rights"])
        self.assertIn("earlier translations", translations[0]["rights"])
        self.assertIn("山月 variant", translations[1]["rights"])

    def test_boundaries_must_be_unique_and_ordered(self):
        self.assertEqual(BETWEEN("START verse END", "START", "END"), " verse ")
        for text in ["START missing", "END before START", "START START END", "START END END"]:
            with self.subTest(text=text), self.assertRaisesRegex(ValueError, "boundaries"):
                BETWEEN(text, "START", "END")

    def test_ocr_page_ranges_and_corrections_are_guarded(self):
        data = xml_pages(["One\nTwo", "Three"])
        self.assertEqual(OCR_PAGES(data, (1, 2)), "One\nTwo\nThree")
        for pages in [(), (0,), (3,), (2, 1), (1, 1)]:
            with self.subTest(pages=pages), self.assertRaisesRegex(ValueError, "page range"):
                OCR_PAGES(data, pages)
        row = self.rows[1]
        source = OCR_PAGES(self.files[row["ocr"]], (1,))
        self.assertEqual(READING(source, row), "\n".join(row["lines"]))
        with self.assertRaisesRegex(ValueError, "OCR correction"):
            READING(source.replace(" jfc?", ""), row)
        with self.assertRaisesRegex(ValueError, "OCR comparison differs"):
            READING(source.replace("my couch", "the couch"), row)
        with self.assertRaisesRegex(ValueError, "OCR comparison differs"):
            READING(source.replace(row["end"], "extra verse\n" + row["end"]), row)
        changed = {**row, "lines": (*row["lines"][:-1], "different ending")}
        with self.assertRaisesRegex(ValueError, "reading changed"):
            READING(source, changed)

    def test_missing_or_modified_evidence_is_rejected(self):
        for name in self.files:
            path = self.directory / name
            path.unlink()
            with self.subTest(missing=name), patch.dict(RECORDS.__globals__, self.settings), self.assertRaises(FileNotFoundError):
                RECORDS(self.directory)
            path.write_bytes(self.files[name] + b"changed")
            with self.subTest(changed=name), patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "evidence changed"):
                RECORDS(self.directory)
            path.write_bytes(self.files[name])

    def test_repinned_ocr_and_gutenberg_changes_cannot_change_reviewed_words(self):
        for name, before, after, message in [
            ("lutejade-1909-london-ocr.xml", b"moonbeams", b"starlight", "OCR comparison differs"),
            ("obata-li-po-1923-ocr.xml", b"mountain moon", b"morning moon", "OCR comparison differs"),
            ("gutenberg-390.txt", b"moonbeams", b"starlight", "Gutenberg comparison differs"),
        ]:
            path = self.directory / name
            changed = self.files[name].replace(before, after)
            self.assertNotEqual(changed, self.files[name])
            path.write_bytes(changed)
            evidence = {**self.settings["EVIDENCE"], name: digest(changed)}
            with self.subTest(name=name), patch.dict(RECORDS.__globals__, {**self.settings, "EVIDENCE": evidence}), self.assertRaisesRegex(ValueError, message):
                RECORDS(self.directory)
            path.write_bytes(self.files[name])

    def test_duplicate_selection_is_rejected(self):
        with patch.dict(RECORDS.__globals__, {**self.settings, "SELECTION": (self.rows[0], self.rows[0])}), self.assertRaisesRegex(ValueError, "Duplicate"):
            RECORDS(self.directory)


if __name__ == "__main__":
    unittest.main()

"""Offline boundary, transcription and tamper tests for historical translations."""

import hashlib
import runpy
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
MODULE = runpy.run_path(str(ROOT / "scripts/import-early-tang-translations.py"))
RECORDS = MODULE["records"]
READING_SECTIONS = MODULE["reading_sections"]
EXCERPT = MODULE["excerpt"]
COMPARE = MODULE["compare_ocr"]
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


class EarlyTangTranslationsImporterTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        readings = MODULE["READINGS"].read_bytes()
        self.texts = dict(READING_SECTIONS(readings))
        rows = [dict(row) for row in MODULE["SELECTION"]]
        french_friend = self.texts["tang-020-fr"].replace("Le soleil a franchi", "Le soleil-a franchi")
        french_friend = french_friend.replace("immobilité", "immo-\nbilité")
        english_friend = self.texts["tang-020-en"].replace("giant peaks\n", "giant peaks.\n")
        english_friend = english_friend.replace("Haunt me with their refrain.\n", "Haunt me with their refrain.\nA. FRIEND EXPECTED 45\n")
        french_visit = self.texts["tang-128-fr"]
        for old, new in (
            ("Un ancien ami m’offre", "La ancien ami m’oilïe"), ("Il m’invite", "11 m’invite"),
            ("verte ceinture ;", "verte ceinture f"), ("l’automne,", "l’automne (a>,"),
            ("parcourt", "par-\ncourt"), ("fleurissent", "fleu-\nrissent"), ("vous.", "vous*"),
        ):
            french_visit = french_visit.replace(old, new)
        rows[0]["pages"] = (1,)
        rows[1]["pages"] = (1,)
        rows[2]["pages"] = (2,)
        rows[3]["pages"] = (1,)
        self.rows = tuple(rows)
        self.files = {
            "hervey-thang-1862.pdf": b"1862 scan",
            "hervey-thang-1862-ocr.xml": xml_pages([french_friend, french_visit]),
            "giles-gems-1884.pdf": b"1884 scan",
            "giles-gems-1884-ocr.xml": xml_pages([self.texts["tang-041-en"]]),
            "lutejade-1909-london.pdf": b"1909 scan",
            "lutejade-1909-london-ocr.xml": xml_pages([english_friend]),
            "gutenberg-390.txt": self.texts["tang-020-en"].encode(),
        }
        for name, data in self.files.items():
            (self.directory / name).write_bytes(data)
        self.settings = {"EVIDENCE": {name: digest(data) for name, data in self.files.items()}, "SELECTION": self.rows}

    def test_all_four_complete_translations_keep_distinct_credits(self):
        with patch.dict(RECORDS.__globals__, self.settings):
            result = RECORDS(self.directory)
        self.assertEqual(set(result), {"tang-020", "tang-128", "tang-041"})
        self.assertEqual([item["language"] for item in result["tang-020"]], ["French", "English"])
        for row in self.rows:
            item = next(item for item in result[row["id"]] if item["language"] == row["language"])
            self.assertEqual(item["text"], self.texts[row["key"]])
            self.assertEqual(item["source"], row["source"])
            self.assertEqual(item["translator"], row["translator"])
            self.assertIn("public domain in the United States", item["rights"])
            self.assertIn("not established", item["rights"])
        self.assertIn("earlier English and French translations", result["tang-020"][1]["rights"])
        self.assertIn("rice", result["tang-128"][0]["rights"])
        self.assertIn("not endorsed", result["tang-041"][0]["rights"])

    def test_reading_order_stanzas_and_text_hash_are_guarded(self):
        readings = MODULE["READINGS"].read_bytes()
        self.assertEqual(len(READING_SECTIONS(readings)), 4)
        for changed in [readings.replace(b"tang-020-fr", b"tang-999-fr", 1), readings + b"extra"]:
            with self.subTest(changed=changed[-20:]), self.assertRaises(ValueError):
                READING_SECTIONS(changed)
        changed = readings.replace(b"Le soleil", b"Un soleil", 1)
        with self.assertRaisesRegex(ValueError, "reading changed"):
            READING_SECTIONS(changed)
        changed = readings.replace(b"\n\nLe b", b"\nLe b", 1)
        with self.assertRaisesRegex(ValueError, "reading boundaries"):
            READING_SECTIONS(changed)

    def test_boundaries_must_be_unique_and_ordered(self):
        self.assertEqual(EXCERPT("title FIRST verse LAST footer", "FIRST", "LAST"), "FIRST verse LAST")
        for text in ["FIRST missing", "LAST then FIRST", "FIRST FIRST LAST", "FIRST LAST LAST"]:
            with self.subTest(text=text), self.assertRaisesRegex(ValueError, "boundaries"):
                EXCERPT(text, "FIRST", "LAST")

    def test_ocr_page_ranges_corrections_and_extra_words_are_guarded(self):
        data = xml_pages(["One\nTwo", "Three"])
        self.assertEqual(OCR_PAGES(data, (1, 2)), "One\nTwo\nThree")
        for pages in [(), (0,), (3,), (2, 1), (1, 1)]:
            with self.subTest(pages=pages), self.assertRaisesRegex(ValueError, "page range"):
                OCR_PAGES(data, pages)
        row = {"key": "example", "first": "Start", "last": "end.", "corrections": (("m1d", "mid"),), "joins": 1}
        COMPARE("title\nStart m1d-\ndle end.\nfooter", "Start middle end.", row)
        with self.assertRaisesRegex(ValueError, "OCR correction"):
            COMPARE("Start mid-\ndle end.", "Start middle end.", row)
        with self.assertRaisesRegex(ValueError, "line wraps"):
            COMPARE("Start m1ddle end.", "Start middle end.", row)
        with self.assertRaisesRegex(ValueError, "comparison differs"):
            COMPARE("Start m1d-\ndle extra end.", "Start middle end.", row)

    def test_missing_or_changed_evidence_fails(self):
        scan = self.directory / "giles-gems-1884.pdf"
        scan.unlink()
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaises(FileNotFoundError):
            RECORDS(self.directory)
        scan.write_bytes(b"changed")
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "evidence changed"):
            RECORDS(self.directory)

    def test_repinned_ocr_or_comparison_cannot_change_the_reading(self):
        for name, before, after, message in [
            ("giles-gems-1884-ocr.xml", b"crescent", b"different", "OCR comparison differs"),
            ("gutenberg-390.txt", b"tired woodman", b"silent woodman", "Gutenberg comparison differs"),
        ]:
            path = self.directory / name
            changed = self.files[name].replace(before, after)
            self.assertNotEqual(changed, self.files[name])
            path.write_bytes(changed)
            evidence = {**self.settings["EVIDENCE"], name: digest(changed)}
            with self.subTest(name=name), patch.dict(RECORDS.__globals__, {**self.settings, "EVIDENCE": evidence}), \
                    self.assertRaisesRegex(ValueError, message):
                RECORDS(self.directory)
            path.write_bytes(self.files[name])

    def test_duplicate_language_for_one_poem_is_rejected(self):
        rows = list(self.rows)
        rows[1] = {**rows[1], "language": "French"}
        with patch.dict(RECORDS.__globals__, {**self.settings, "SELECTION": tuple(rows)}), \
                self.assertRaisesRegex(ValueError, "Duplicate selected language"):
            RECORDS(self.directory)


if __name__ == "__main__":
    unittest.main()

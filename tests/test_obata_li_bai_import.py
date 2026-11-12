"""Offline source, reading, boundary and tamper tests for Obata versions."""

import hashlib
import runpy
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
MODULE = runpy.run_path(str(ROOT / "scripts/import-obata-li-bai.py"))
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


def entry(row):
    return [row["start"], *row.get("prefix", ()), *row["ocr"], *row.get("suffix", ()), row["end"]]


class ObataLiBaiImporterTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.rows = tuple({**row, "page": index} for index, row in enumerate(MODULE["SELECTION"], 1))
        primary = xml_pages([["Earlier", *entry(row), "Later"] for row in self.rows])
        comparison = xml_pages([[] for _ in range(102)] + [["And came down stream in a day"]])
        self.files = {
            "obata-li-po-1923-london.pdf": b"reviewed 1923 scan",
            "obata-li-po-1923-ocr.xml": primary,
            "obata-li-po-1922-new-york.pdf": b"comparison 1922 scan",
            "obata-li-po-1922-new-york-ocr.xml": comparison,
        }
        for name, data in self.files.items():
            (self.directory / name).write_bytes(data)
        self.settings = {
            "EVIDENCE": {name: digest(data) for name, data in self.files.items()},
            "SELECTION": self.rows,
            "EXPECTED_SELECTION": tuple((row["id"], row["number"], row["page"]) for row in self.rows),
        }

    def test_seven_complete_versions_keep_order_sources_and_disclosures(self):
        with patch.dict(RECORDS.__globals__, self.settings):
            result = RECORDS(self.directory)
        self.assertEqual(list(result), [row["id"] for row in self.rows])
        for row in self.rows:
            item = result[row["id"]][0]
            self.assertEqual(item["language"], "English")
            self.assertEqual(item["title"], row["title"])
            self.assertEqual(item["text"], "\n".join(row["lines"]))
            self.assertEqual(item["translator"], "Shigeyoshi Obata · London and Toronto 1923")
            self.assertTrue(item["source"].endswith(f'#page={row["page"]}'))
            self.assertIn("public domain in the United States", item["rights"])
            self.assertIn("life-plus-70 jurisdictions", item["rights"])
            self.assertIn("working edition is not established", item["rights"])
            self.assertIn(row["note"], item["rights"])
        self.assertIn("historical occasion is not established", result["tang-316"][0]["rights"])
        self.assertIn("stockings or socks", result["tang-255"][0]["rights"])
        self.assertIn("1922 New York printing reads", result["tang-269"][0]["rights"])
        self.assertIn("does not identify a separate addressee", result["tang-101"][0]["rights"])

    def test_headings_complete_ocr_and_boundaries_are_required(self):
        row = self.rows[0]
        good = entry(row)
        def read(lines):
            pages = ET.fromstring(xml_pages([lines])).findall(".//OBJECT")
            return READING(pages, row)
        self.assertEqual(read(good), "\n".join(row["lines"]))
        for lines, message in [
            ([*good, row["start"]], "entry boundaries"),
            ([row["end"], *good[:-1]], "entry boundaries"),
            ([good[0], *good[2:]], "OCR verse or boundaries"),
            ([*good[:-1], "extra verse", good[-1]], "OCR verse or boundaries"),
            ([*good[:3], "changed", *good[4:]], "OCR verse or boundaries"),
            ([*good[:-1], good[-2], good[-1]], "OCR verse or boundaries"),
        ]:
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                read(lines)
        with self.assertRaisesRegex(ValueError, "OCR page"):
            READING([], row)

    def test_reviewed_hash_and_documented_ocr_corrections_are_guarded(self):
        row = self.rows[0]
        pages = ET.fromstring(xml_pages([entry(row)])).findall(".//OBJECT")
        for changed in [{**row, "lines": ("Altered", *row["lines"][1:])}, {**row, "sha256": "0" * 64}]:
            with self.assertRaisesRegex(ValueError, "translation changed"):
                READING(pages, changed)
        with self.assertRaisesRegex(ValueError, "OCR correction"):
            READING(pages, {**row, "corrections": ((*row["corrections"], ("not present", "")))})
        altered_ocr = tuple(line.replace("glisten", "twinkle") for line in row["ocr"])
        changed = {**row, "ocr": altered_ocr}
        changed_pages = ET.fromstring(xml_pages([entry(changed)])).findall(".//OBJECT")
        with self.assertRaisesRegex(ValueError, "OCR comparison differs"):
            READING(changed_pages, changed)

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

    def test_repinned_ocr_and_comparison_changes_are_rejected(self):
        for name, before, after, message in [
            ("obata-li-po-1923-ocr.xml", b"trailing clouds", b"passing clouds", "OCR verse or boundaries"),
            ("obata-li-po-1922-new-york-ocr.xml", b"down stream", b"up stream", "1922 stream comparison"),
        ]:
            path = self.directory / name
            changed = self.files[name].replace(before, after)
            self.assertNotEqual(changed, self.files[name])
            path.write_bytes(changed)
            evidence = {**self.settings["EVIDENCE"], name: digest(changed)}
            with self.subTest(name=name), patch.dict(RECORDS.__globals__, {**self.settings, "EVIDENCE": evidence}), self.assertRaisesRegex(ValueError, message):
                RECORDS(self.directory)
            path.write_bytes(self.files[name])

    def test_selection_order_page_number_and_duplicates_are_guarded(self):
        variants = [
            (tuple(reversed(self.rows)), "selection order"),
            (({**self.rows[0], "number": 99}, *self.rows[1:]), "selection order"),
            (({**self.rows[0], "page": 2}, *self.rows[1:]), "selection order"),
            ((*self.rows, self.rows[0]), "Duplicate selected poem"),
        ]
        for rows, message in variants:
            with self.subTest(message=message), patch.dict(RECORDS.__globals__, {**self.settings, "SELECTION": rows}), self.assertRaisesRegex(ValueError, message):
                RECORDS(self.directory)


if __name__ == "__main__":
    unittest.main()

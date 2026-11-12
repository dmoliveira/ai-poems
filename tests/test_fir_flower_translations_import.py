"""Offline boundary, source and tamper tests for the 1921 translations."""

import hashlib
import runpy
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
MODULE = runpy.run_path(str(ROOT / "scripts/import-fir-flower-translations.py"))
RECORDS = MODULE["records"]
VERSE = MODULE["verse"]
COMPARE_OCR = MODULE["compare_ocr"]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def block(row, lines):
    heading = f'<h2 id="{row["anchor"]}">{row["heading"]}</h2>'
    subtitle = f'<p class="ph4">{row["subtitle"]}</p>' if "subtitle" in row else ""
    author = f'<p class="ph3">{row["author"]}</p>'
    verse = "\n".join(f'<div class="verse">{line}</div>' for line in lines)
    return (heading + subtitle + author + '<div class="poetry-container"><div class="poetry"><div class="stanza">'
            + verse + '</div></div></div><hr class="chap">')


def xml_pages(texts):
    root = ET.Element("DjVuXML")
    for text in texts:
        page = ET.SubElement(root, "OBJECT")
        for line in text.splitlines():
            ET.SubElement(ET.SubElement(page, "LINE"), "WORD").text = line
    return ET.tostring(root)


class FirFlowerTranslationsImporterTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.texts = {}
        self.rows = []
        chapters = []
        ocr_pages = []
        for index, original in enumerate(MODULE["SELECTION"], 1):
            lines = [f"First line {index} with _li_ share.", f"Last line {index}."]
            text = "\n".join(line.replace("_li_", "li") for line in lines)
            row = {**original, "page": index, "lines": 2, "stanzas": (2,), "indents": (),
                   "italics": 1, "sha256": digest(text.encode()),
                   "first": f"First line {index}", "last": f"Last line {index}.", "corrections": ()}
            self.rows.append(row)
            self.texts[row["id"]] = text
            chapters.append(block(row, lines))
            ocr_pages.append(text)
        self.rows = tuple(self.rows)
        self.files = {
            "gutenberg-48222.html": "\n".join(chapters).encode(),
            "firflower-1921-michigan.pdf": b"reviewed 1921 title page and scan",
            "firflower-1921-michigan-ocr.xml": xml_pages(ocr_pages),
        }
        for name, data in self.files.items():
            (self.directory / name).write_bytes(data)
        self.settings = {"EVIDENCE": {name: digest(data) for name, data in self.files.items()}, "SELECTION": self.rows}

    def test_complete_readings_keep_individual_sources_and_credits(self):
        with patch.dict(RECORDS.__globals__, self.settings):
            result = RECORDS(self.directory)
        self.assertEqual(set(result), set(self.texts))
        for row in self.rows:
            item = result[row["id"]][0]
            self.assertEqual(item["language"], "English")
            self.assertEqual(item["text"], self.texts[row["id"]])
            self.assertIn("Florence Ayscough · Chinese translation", item["translator"])
            self.assertIn("Amy Lowell · English version", item["translator"])
            self.assertTrue(item["source"].endswith("#" + row["anchor"]))
            self.assertIn("public domain in the United States", item["rights"])
            self.assertIn("Chinese source edition is not established", item["rights"])
            self.assertIn(row["note"], item["rights"])
            self.assertNotIn("_", item["text"])

    def test_heading_author_complete_boundaries_and_markup_are_guarded(self):
        row = self.rows[0]
        source = self.files["gutenberg-48222.html"].decode()
        self.assertEqual(VERSE(source, row), self.texts[row["id"]])
        cases = [
            (source + block(row, ["First line 1 with _li_ share.", "Last line 1."]), "heading"),
            (source.replace(row["heading"], "OTHER HEADING", 1), "heading"),
            (source.replace(row["author"], "BY SOMEONE ELSE", 1), "author"),
            (source.replace("Last line 1.", "", 1), "translation changed"),
            (source.replace('<div class="verse">Last line 1.</div>', "", 1), "verse boundaries"),
            (source.replace("First line 1", "<em>First line 1</em>", 1), "verse boundaries"),
            (source.replace("First line 1 with _li_", "First line 1 with li", 1), "italic markers"),
            (source.replace("First line 1 with", "Changed line 1 with", 1), "translation changed"),
            (source.replace('</div></div></div><hr class="chap">', '</div></div></div><p>extra</p><hr class="chap">', 1),
             "poem block"),
        ]
        for changed, message in cases:
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                VERSE(changed, row)

    def test_subtitle_stanzas_and_deliberate_indentation_are_guarded(self):
        text = "One.\nTwo.\n\nThree.\n  Four."
        row = {**self.rows[0], "subtitle": "A LONG SUBTITLE", "lines": 4, "stanzas": (2, 2),
               "indents": ((1, 1),), "italics": 0, "sha256": digest(text.encode())}
        source = (
            f'<h2 id="{row["anchor"]}">{row["heading"]}</h2>'
            '<p class="ph4">A LONG\nSUBTITLE</p>'
            f'<p class="ph3">{row["author"]}</p>'
            '<div class="poetry-container"><div class="poetry"><div class="stanza">'
            '<div class="verse">One.</div><div class="verse">Two.</div>'
            '</div><div class="stanza">'
            '<div class="verse">Three.</div><div class="verse indent2">Four.</div>'
            '</div></div></div><hr class="chap">'
        )
        self.assertEqual(VERSE(source, row), text)
        cases = [
            (source.replace('<p class="ph4">A LONG\nSUBTITLE</p>', ''), "subtitle"),
            (source.replace("A LONG\nSUBTITLE", "ANOTHER SUBTITLE"), "subtitle"),
            (source.replace('class="verse indent2"', 'class="verse"'), "verse boundaries"),
            (source.replace('</div><div class="stanza">', ''), "verse boundaries"),
            (source.replace('class="verse">One', 'class="verse indent2">One'), "verse boundaries"),
        ]
        for changed, message in cases:
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                VERSE(changed, row)

    def test_ocr_requires_ordered_unique_boundaries_exact_corrections_and_words(self):
        row = {**self.rows[0], "page": 1, "first": "First", "last": "end.", "corrections": (("m1ddle", "middle"),)}
        COMPARE_OCR(xml_pages(["First m1ddle end."]), "First middle end.", row)
        for text, message in [
            ("First m1ddle end. end.", "boundaries"), ("end. First m1ddle", "boundaries"),
            ("First middle end.", "correction"), ("First m1ddle added end.", "comparison differs"),
        ]:
            with self.subTest(text=text), self.assertRaisesRegex(ValueError, message):
                COMPARE_OCR(xml_pages([text]), "First middle end.", row)
        with self.assertRaisesRegex(ValueError, "page"):
            COMPARE_OCR(xml_pages(["First m1ddle end."]), "First middle end.", {**row, "page": 2})

    def test_missing_or_modified_evidence_is_rejected(self):
        scan = self.directory / "firflower-1921-michigan.pdf"
        scan.unlink()
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaises(FileNotFoundError):
            RECORDS(self.directory)
        scan.write_bytes(b"changed")
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "evidence changed"):
            RECORDS(self.directory)

    def test_repinned_source_or_ocr_cannot_silently_change_a_reading(self):
        for name, before, after, message in [
            ("gutenberg-48222.html", b"First line 1 with", b"Other line 1 with", "translation changed"),
            ("firflower-1921-michigan-ocr.xml", b"with li share", b"with li different", "OCR comparison differs"),
        ]:
            path = self.directory / name
            changed = self.files[name].replace(before, after, 1)
            self.assertNotEqual(changed, self.files[name])
            path.write_bytes(changed)
            evidence = {**self.settings["EVIDENCE"], name: digest(changed)}
            with self.subTest(name=name), patch.dict(RECORDS.__globals__, {**self.settings, "EVIDENCE": evidence}), \
                    self.assertRaisesRegex(ValueError, message):
                RECORDS(self.directory)
            path.write_bytes(self.files[name])

    def test_duplicate_selected_id_fails(self):
        rows = (*self.rows, self.rows[0])
        with patch.dict(RECORDS.__globals__, {**self.settings, "SELECTION": rows}), \
                self.assertRaisesRegex(ValueError, "Duplicate selected poem"):
            RECORDS(self.directory)


if __name__ == "__main__":
    unittest.main()

"""Offline guards for Whitman source pinning and verse boundaries."""

import hashlib
import json
import runpy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
MODULE = runpy.run_path(str(ROOT / "scripts/import-whitman-1918.py"))
EXTRACT = MODULE["extract"]
RECORDS = MODULE["records"]
VERSE_PARSER = MODULE["VerseParser"]


def digest(data):
    return hashlib.sha256(data).hexdigest()


class WhitmanImporterTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.verse = "First & fine\nA middle line\nLast line."
        self.document = (
            '<h2><a id="Page_1"></a>FIXTURE</h2>'
            '<div class="poem"><div class="stanza">'
            '<span class="i0">First &amp; fine<br /></span>'
            '<span class="i0">A middle\n line<br /></span>'
            '<span class="i0">Last line.</span></div></div>'
            '<h2><a id="Page_2"></a>NEXT</h2>'
        )
        self.item = {
            "slug": "fixture", "title": "Fixture", "heading": "FIXTURE", "pages": [1, 1],
            "comparisonPdfPages": [3, 3], "stanzas": [3], "first": "First & fine", "last": "Last line.",
            "textSha256": digest(self.verse.encode()),
        }
        self.manifest = self.directory / "manifest.json"
        self.manifest.write_text(json.dumps({"poems": [self.item]}), encoding="utf8")
        self.inputs = {"pg27494-h.htm": self.document.encode(), "scan.pdf": b"1918", "earlier.pdf": b"1892"}
        for name, content in self.inputs.items():
            (self.directory / name).write_bytes(content)
        self.settings = {
            "EVIDENCE": {name: digest(content) for name, content in self.inputs.items()},
            "MANIFEST": self.manifest,
            "SELECTED": ("fixture",),
        }

    def test_extract_preserves_verse_and_normalizes_html_wraps(self):
        self.assertEqual(EXTRACT(self.document, self.item), self.verse)

    def test_records_keep_source_rights_and_no_translations(self):
        with patch.dict(RECORDS.__globals__, self.settings):
            poem, = RECORDS(self.directory)
        self.assertEqual(poem["text"], self.verse)
        self.assertEqual(poem["authorId"], "walt-whitman")
        self.assertTrue(poem["contextSource"].endswith("#page=15"))
        self.assertIn("not a diplomatic transcription", poem["context"])
        self.assertIn("public domain in the United States", poem["rights"])
        self.assertEqual(poem["translations"], [])

    def test_missing_and_changed_evidence_are_rejected(self):
        path = self.directory / "scan.pdf"
        path.unlink()
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaises(FileNotFoundError):
            RECORDS(self.directory)
        path.write_bytes(b"changed")
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "evidence changed"):
            RECORDS(self.directory)

    def test_changed_text_is_rejected_even_if_input_is_repinned(self):
        document = self.document.replace("A middle", "A different")
        evidence = {**self.settings["EVIDENCE"], "pg27494-h.htm": digest(document.encode())}
        (self.directory / "pg27494-h.htm").write_text(document, encoding="utf8")
        with patch.dict(RECORDS.__globals__, {**self.settings, "EVIDENCE": evidence}), self.assertRaisesRegex(
            ValueError, "Reviewed reading changed"
        ):
            RECORDS(self.directory)

    def test_bad_heading_page_and_stanza_are_rejected(self):
        cases = (
            ({**self.item, "heading": "MISSING"}, "heading or page range"),
            ({**self.item, "pages": [0, 1]}, "heading or page range"),
            ({**self.item, "pages": [2, 2]}, "heading boundary"),
            ({**self.item, "stanzas": [2, 1]}, "stanza boundaries"),
            ({**self.item, "last": "Not last"}, "first or last line"),
        )
        for item, error in cases:
            with self.subTest(error=error), self.assertRaisesRegex(ValueError, error):
                EXTRACT(self.document, item)

    def test_unreviewed_internal_break_and_repeated_anchor_are_rejected(self):
        document = self.document.replace("A middle\n line", "A middle<br />line")
        with self.assertRaisesRegex(ValueError, "internal line break"):
            EXTRACT(document, self.item)
        document = self.document.replace('<h2><a id="Page_2">', '<h2><a id="Page_1">')
        with self.assertRaisesRegex(ValueError, "Repeated page anchor"):
            EXTRACT(document, self.item)

    def test_reviewed_join_and_split_exceptions(self):
        cases = (
            ("drums", "No bargainers' bargains by day—no brokers or speculators—would they<br />continue?", 1),
            ("weave", ("For great campaigns of peace the same the wiry threads to weave,<br />"
                       "We know not why or what, yet weave, forever weave."), 2),
        )
        for slug, source, count in cases:
            parser = VERSE_PARSER(slug)
            parser.feed(f'<div class="poem"><div class="stanza"><span class="i0">{source}</span></div></div>')
            parser.close()
            self.assertEqual(parser.exception_count, 1)
            self.assertEqual(len(parser.stanzas[0]), count)


if __name__ == "__main__":
    unittest.main()

"""Offline boundary and tamper tests for the Waley translation importer."""

import hashlib
import runpy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
MODULE = runpy.run_path(str(ROOT / "scripts/import-waley-translations.py"))
RECORDS = MODULE["records"]
BETWEEN = MODULE["between"]
VERSE = MODULE["verse"]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def block(lines, footnote=False):
    spans = []
    for index, line in enumerate(lines):
        note = ('<a id="FNanchor_1_4"></a><a class="fnanchor pginternal" href="#Footnote_1_4">[1]</a>'
                if footnote and index == len(lines) - 1 else "")
        spans.append(f'<span class="i0">{line}{note}<br></span>')
    return '<div class="poem"><div class="stanza">\n' + "\n".join(spans) + "\n</div></div>"


class WaleyTranslationsImporterTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.texts = {
            "tao-yuanming-drinking-ming-05": ["First hut line.", "Second hut line."],
            "tao-yuanming-drinking-ming-09": ["First visitor line.", "Second visitor line."],
            "tang-006": ["First moon line.", "Second moon line."],
        }
        self.rows = tuple({**row, "lines": len(self.texts[row["id"]]),
                           "sha256": digest("\n".join(self.texts[row["id"]]).encode())}
                          for row in MODULE["SELECTION"])
        tao = (
            MODULE["TAO_START"]
            + self.rows[1]["start"] + block(self.texts[self.rows[1]["id"]]) + self.rows[1]["end"]
            + self.rows[0]["start"] + block(self.texts[self.rows[0]["id"]]) + self.rows[0]["end"]
            + MODULE["TAO_END"]
        )
        li = (MODULE["LI_START"] + '<h4>[<i>Three Poems</i>]</h4>' + self.rows[2]["start"]
              + block(self.texts[self.rows[2]["id"]], footnote=True) + self.rows[2]["end"])
        self.files = {
            "gutenberg-42290.html": tao.encode(), "gutenberg-16500.html": li.encode(),
            "waley-1918-london.pdf": b"reviewed 1918 scan", "waley-1919-ny.pdf": b"reviewed 1919 scan",
        }
        for name, data in self.files.items():
            (self.directory / name).write_bytes(data)
        self.settings = {"EVIDENCE": {name: digest(data) for name, data in self.files.items()}, "SELECTION": self.rows}

    def test_complete_poems_preserve_credits_and_disclose_interpretation(self):
        with patch.dict(RECORDS.__globals__, self.settings):
            result = RECORDS(self.directory)
        self.assertEqual(set(result), set(self.texts))
        for poem_id, lines in self.texts.items():
            self.assertEqual(len(result[poem_id]), 1)
            translation = result[poem_id][0]
            self.assertEqual(translation["language"], "English")
            self.assertEqual(translation["text"], "\n".join(lines))
            self.assertIn("Arthur Waley", translation["translator"])
            self.assertIn("public domain in the United States", translation["rights"])
            self.assertIn("Chinese source edition is not established", translation["rights"])
        self.assertEqual(result[self.rows[0]["id"]][0]["source"], "https://www.gutenberg.org/ebooks/42290")
        self.assertIn("summer hills", result[self.rows[0]["id"]][0]["rights"])
        self.assertIn("not a title", result[self.rows[1]["id"]][0]["rights"])
        self.assertEqual(result[self.rows[2]["id"]][0]["source"], "https://www.gutenberg.org/ebooks/16500")
        self.assertIn("shadow as slave", result[self.rows[2]["id"]][0]["rights"])
        self.assertNotIn("[1]", result[self.rows[2]["id"]][0]["text"])

    def test_unique_ordered_boundaries_are_required(self):
        self.assertEqual(BETWEEN("before START middle END after", "START", "END"), " middle ")
        for text in ["START missing", "END before START", "START START END", "START END END"]:
            with self.subTest(text=text), self.assertRaisesRegex(ValueError, "boundaries"):
                BETWEEN(text, "START", "END")

    def test_extra_poem_incomplete_verse_and_unexpected_markup_fail(self):
        row = self.rows[0]
        good = block(self.texts[row["id"]])
        self.assertEqual(VERSE(good, row), "\n".join(self.texts[row["id"]]))
        with self.assertRaisesRegex(ValueError, "poem block"):
            VERSE(good + good, row)
        with self.assertRaisesRegex(ValueError, "outside verse"):
            VERSE(good + "<p>Unexpected extra verse</p>", row)
        with self.assertRaisesRegex(ValueError, "verse boundaries"):
            VERSE(block(self.texts[row["id"]][:1]), row)
        with self.assertRaisesRegex(ValueError, "verse markup"):
            VERSE(good.replace("First hut line.", "<em>First hut line.</em>"), row)
        with self.assertRaisesRegex(ValueError, "verse anchor"):
            VERSE(good.replace("First hut line.", '<a href="elsewhere">First hut line.</a>'), row)
        with self.assertRaisesRegex(ValueError, "translation changed"):
            VERSE(good.replace("First hut", "Other hut"), row)

    def test_missing_or_modified_evidence_fails(self):
        scan = self.directory / "waley-1918-london.pdf"
        scan.unlink()
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaises(FileNotFoundError):
            RECORDS(self.directory)
        scan.write_bytes(b"different")
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "evidence changed"):
            RECORDS(self.directory)

    def test_repinned_source_cannot_silently_change_a_reviewed_line(self):
        path = self.directory / "gutenberg-42290.html"
        path.write_text(path.read_text().replace("First hut", "Other hut"), encoding="utf8")
        evidence = {**self.settings["EVIDENCE"], path.name: digest(path.read_bytes())}
        with patch.dict(RECORDS.__globals__, {**self.settings, "EVIDENCE": evidence}), \
                self.assertRaisesRegex(ValueError, "translation changed"):
            RECORDS(self.directory)

    def test_missing_next_poem_or_group_marker_fails_after_repinning(self):
        path = self.directory / "gutenberg-16500.html"
        for before, after in [(self.rows[2]["end"], ""), ("Three Poems", "Two Poems")]:
            path.write_text(self.files[path.name].decode().replace(before, after), encoding="utf8")
            evidence = {**self.settings["EVIDENCE"], path.name: digest(path.read_bytes())}
            with patch.dict(RECORDS.__globals__, {**self.settings, "EVIDENCE": evidence}), self.assertRaises(ValueError):
                RECORDS(self.directory)


if __name__ == "__main__":
    unittest.main()

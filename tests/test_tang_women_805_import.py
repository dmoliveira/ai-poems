"""Offline boundary, attribution and source guards for Siku volume 805."""

import hashlib
import runpy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
MODULE = runpy.run_path(str(ROOT / "scripts/import-tang-women-805.py"))
RECORDS = MODULE["records"]
SECTIONS = MODULE["source_sections"]
REMOVE_NOTES = MODULE["remove_notes"]
COMPARE = MODULE["compare_source"]
HEADINGS = MODULE["HEADINGS"]
LONG_TITLE = MODULE["LONG_TITLE"]
DISPUTED = MODULE["DISPUTED"]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def make_book(verses):
    book = "李冶字季蘭女冠也吳興人存詩十六首\n"
    for title in HEADINGS:
        marker = title if title == LONG_TITLE else "{{SK anchor|" + title + "}}"
        body = verses.get(title, "甲乙丙丁戊")
        if title == "元淳":
            body = "元淳女道士洛中人存詩二首"
        elif title == "海印":
            body = "海印蜀慈光寺尼唐末人才思清峻存詩一首"
        book += f"　　{marker}\n　　{body}{{{{SK notes|comment {{{{nested|not verse}}}} ends}}}}\n"
    return book + "{{SK anchor|御定全唐詩巻八百五}}"


class TangWomen805ImporterTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.long = "\n".join(["甲乙丙丁戊己庚，"] * 15 + ["辛壬癸子丑寅絃。"])
        self.six = "\n".join(["甲乙丙丁戊己，", "庚辛壬癸子丑。"] * 2)
        self.five = "\n".join(["甲乙丙丁戊，", "己庚辛壬癸。"] * 4)
        verse = lambda text: "".join(line[:-1] for line in text.splitlines())
        self.verses = {
            LONG_TITLE: verse(self.long).replace("絃", "{{SKchar|3500}}"),
            "八至": verse(self.six),
            "寄洛中諸姊": verse(self.five),
            "舟夜一章": verse(self.five),
        }
        self.book = make_book(self.verses)
        self.files = {"wikisource-qt-805-669710.wikitext": self.book.encode(), "siku.pdf": b"facsimile"}
        for name, data in self.files.items():
            (self.directory / name).write_bytes(data)
        self.readings = self.directory / "readings.txt"
        self.readings.write_text(
            f"=== ly-springs ===\n{self.long}\n\n=== ly-eight ===\n{self.six}"
            f"\n\n=== yc-sisters ===\n{self.five}\n\n=== hy-boat ===\n{self.five}\n", encoding="utf8"
        )
        self.rows = (
            {"slug": "ly-springs", "heading": LONG_TITLE, "pages": (153, 154), "width": 7, "lines": 16,
             "hash": digest(self.long.encode()), "changes": (("{{SKchar|3500}}", "絃", 1),)},
            {"slug": "ly-eight", "heading": "八至", "pages": (156, 156), "width": 6, "lines": 4,
             "hash": digest(self.six.encode()), "changes": ()},
            {"slug": "yc-sisters", "heading": "寄洛中諸姊", "pages": (159, 159), "width": 5, "lines": 8,
             "hash": digest(self.five.encode()), "changes": ()},
            {"slug": "hy-boat", "heading": "舟夜一章", "pages": (160, 161), "width": 5, "lines": 8,
             "hash": digest(self.five.encode()), "changes": ()},
        )
        self.settings = {
            "EVIDENCE": {name: digest(data) for name, data in self.files.items()},
            "READINGS": self.readings,
            "READINGS_SHA256": digest(self.readings.read_bytes()),
            "SELECTION": self.rows,
        }

    def test_complete_readings_authors_and_credits(self):
        with patch.dict(RECORDS.__globals__, self.settings):
            long, six, yuan, haiyin = RECORDS(self.directory)
        self.assertEqual(long["text"], self.long)
        self.assertEqual(long["author"], "Li Ye")
        self.assertEqual(six["form"], "Six-character poem")
        self.assertEqual(yuan["authorOriginal"], "元淳")
        self.assertEqual(haiyin["authorOriginal"], "海印")
        self.assertTrue(long["source"].endswith("#page=153"))
        self.assertTrue(long["contextSource"].endswith("&oldid=669710"))
        self.assertIn("relationship to this scanned copy is not established", long["context"])
        self.assertIn("reproduction date is not identified", long["context"])
        self.assertIn("not a diplomatic transcription", long["context"])
        self.assertIn("CC BY-SA 4.0", long["rights"])
        self.assertIn("維基小霸王", long["rights"])
        self.assertEqual(long["translations"], [])
        self.assertEqual(long["themes"], [])

    def test_fragments_disputed_attribution_and_notes_are_excluded(self):
        sections = SECTIONS(self.book)
        self.assertNotIn("句", sections)
        self.assertNotIn(DISPUTED, sections)
        self.assertEqual(sections[LONG_TITLE], self.verses[LONG_TITLE])
        self.assertEqual(REMOVE_NOTES("a{{SK notes|b{{nested|c}}d}}e"), "ae")
        with self.assertRaisesRegex(ValueError, "Unclosed"):
            REMOVE_NOTES("a{{SK notes|b{{nested|c}}")

    def test_title_author_and_following_boundaries_are_required(self):
        cases = (
            self.book.replace("李冶字季蘭", "missing"),
            self.book.replace("{{SK anchor|八至}}", "missing"),
            self.book.replace("{{SK anchor|元淳}}", "{{SK anchor|海印}}"),
            self.book.replace("元淳女道士洛中人存詩二首", "unknown attribution"),
            self.book.replace("{{SK anchor|御定全唐詩巻八百五}}", "missing"),
        )
        for source in cases:
            with self.subTest(source=source[:80]), self.assertRaises(ValueError):
                SECTIONS(source)

    def test_only_explicit_counted_placeholder_resolution_is_allowed(self):
        source = self.verses[LONG_TITLE]
        COMPARE(source, self.rows[0], self.long)
        with self.assertRaisesRegex(ValueError, "source change"):
            COMPARE(source, {**self.rows[0], "changes": (("{{SKchar|3500}}", "絃", 2),)}, self.long)
        with self.assertRaisesRegex(ValueError, "verse markup"):
            COMPARE(source, {**self.rows[0], "changes": ()}, self.long)
        with self.assertRaisesRegex(ValueError, "verse markup"):
            COMPARE(source.replace("3500", "9999"), {**self.rows[0], "changes": ()}, self.long)

    def test_missing_or_modified_evidence_and_readings_fail(self):
        scan = self.directory / "siku.pdf"
        scan.unlink()
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaises(FileNotFoundError):
            RECORDS(self.directory)
        scan.write_bytes(b"different")
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "evidence changed"):
            RECORDS(self.directory)
        scan.write_bytes(self.files["siku.pdf"])
        self.readings.write_text("changed", encoding="utf8")
        with patch.dict(RECORDS.__globals__, self.settings), self.assertRaisesRegex(ValueError, "readings changed"):
            RECORDS(self.directory)

    def test_repinned_source_or_reading_cannot_change_reviewed_poem(self):
        path = self.directory / "wikisource-qt-805-669710.wikitext"
        altered = self.book.replace(self.verses["八至"], "異" + self.verses["八至"][1:], 1)
        path.write_text(altered, encoding="utf8")
        evidence = {**self.settings["EVIDENCE"], path.name: digest(path.read_bytes())}
        with patch.dict(RECORDS.__globals__, {**self.settings, "EVIDENCE": evidence}), \
                self.assertRaisesRegex(ValueError, "source reading"):
            RECORDS(self.directory)
        path.write_bytes(self.files[path.name])
        self.readings.write_text(self.readings.read_text().replace("甲乙", "異乙", 1), encoding="utf8")
        settings = {**self.settings, "READINGS_SHA256": digest(self.readings.read_bytes())}
        with patch.dict(RECORDS.__globals__, settings), self.assertRaisesRegex(ValueError, "poem changed"):
            RECORDS(self.directory)

    def test_incomplete_verse_fails_even_if_hashes_are_repinned(self):
        incomplete = "\n".join(self.long.splitlines()[:-1])
        self.readings.write_text(self.readings.read_text().replace(self.long, incomplete), encoding="utf8")
        rows = ({**self.rows[0], "hash": digest(incomplete.encode())}, *self.rows[1:])
        settings = {**self.settings, "READINGS_SHA256": digest(self.readings.read_bytes()), "SELECTION": rows}
        with patch.dict(RECORDS.__globals__, settings), self.assertRaisesRegex(ValueError, "line boundaries"):
            RECORDS(self.directory)


if __name__ == "__main__":
    unittest.main()

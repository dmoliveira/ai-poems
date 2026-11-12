"""Offline evidence and reviewed-selection guards for Ogura waka 41–65."""

import copy
import hashlib
import io
import json
import runpy
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
MODULE = runpy.run_path(str(ROOT / "scripts/import-ogura-1900-sequel.py"))
RECORDS = MODULE["make_records"]
COMMON = MODULE["COMMON"]


def digest(data):
    return hashlib.sha256(data).hexdigest()


class OguraSequelImporterTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.manifest = json.loads(MODULE["MANIFEST"].read_text(encoding="utf8"))
        self.manifest_path = self.directory / "manifest.json"
        self.scan = self.directory / COMMON["PDF"]
        self.scan.write_bytes(b"fixture scan, not a facsimile")
        self.comparison_path = self.directory / COMMON["COMPARISON"]
        rows = []
        for number in range(1, 101):
            label = COMMON["japanese_number"](number)
            name = self.manifest["poems"][number - 41]["authorOriginal"] if 41 <= number <= 65 else f"未収録{number}"
            rows.append(
                f'!style="vertical-align:top"|<span id="{label}">{label}</span>\n'
                '|style="vertical-align:top"|上の句<br />下の句<br />（よみ<br />よみ）\n'
                f'|style="vertical-align:top"|[[w:{name}|表示]]<br />'
            )
        self.comparison = {"parse": {"title": "小倉百人一首", "revid": 240235, "wikitext": {"*": "\n".join(rows)}}}
        self.manifest["scanSha256"] = digest(self.scan.read_bytes())
        self.write_fixture()

    def write_fixture(self):
        data = json.dumps(self.comparison, ensure_ascii=False).encode()
        self.comparison_path.write_bytes(data)
        self.manifest["comparisonSha256"] = digest(data)
        self.manifest_path.write_text(json.dumps(self.manifest, ensure_ascii=False), encoding="utf8")

    def records(self):
        with patch.dict(RECORDS.__globals__, {"MANIFEST": self.manifest_path}):
            return RECORDS(self.directory)

    def test_records_keep_complete_texts_individual_pages_and_caveats(self):
        records = self.records()
        self.assertEqual(len(records), 25)
        for item, poem in zip(self.manifest["poems"], records, strict=True):
            self.assertEqual(poem["id"], f'ogura-1900-{item["number"]:03}')
            self.assertEqual(poem["text"], item["text"])
            self.assertEqual(len(poem["text"].splitlines()), 5)
            self.assertEqual(poem["authorOriginal"], item["authorOriginal"])
            self.assertTrue(poem["source"].endswith(f'#page={item["page"]}'))
            self.assertIn("oldid=240235", poem["contextSource"])
            self.assertIn("not the modern card-text comparison", poem["context"])
            self.assertIn("public domain in the United States", poem["rights"])
            self.assertEqual(poem["translations"], [])
            self.assertIsNone(poem["year"])

    def test_missing_and_tampered_evidence_is_rejected(self):
        for path, message in ((self.scan, "Historical scan changed"), (self.comparison_path, "Comparison snapshot changed")):
            with self.subTest(path=path.name):
                original = path.read_bytes()
                path.unlink()
                with self.assertRaises(FileNotFoundError):
                    self.records()
                path.write_bytes(original + b"changed")
                with self.assertRaisesRegex(ValueError, message):
                    self.records()
                path.write_bytes(original)

    def test_check_mode_refuses_drift_without_overwriting(self):
        output = self.directory / "output.json"
        output.write_text(json.dumps(self.records(), ensure_ascii=False, indent=2) + "\n", encoding="utf8")
        with (
            patch.dict(MODULE["main"].__globals__, {"MANIFEST": self.manifest_path, "OUTPUT": output, "ROOT": self.directory}),
            patch("sys.argv", ["import-ogura-1900-sequel.py", str(self.directory), "--check"]),
            redirect_stdout(io.StringIO()),
        ):
            MODULE["main"]()
            output.write_text("changed", encoding="utf8")
            with self.assertRaisesRegex(ValueError, "records differ"):
                MODULE["main"]()
        self.assertEqual(output.read_text(encoding="utf8"), "changed")

    def test_selection_page_duplicates_and_boundaries_are_guarded(self):
        original = copy.deepcopy(self.manifest)
        for change, error in (
            (lambda p: p.reverse(), "selection, page or order"),
            (lambda p: p[0].update(page=90), "selection, page or order"),
            (lambda p: p.pop(), "selection, page or order"),
            (lambda p: p[1].update(text=p[0]["text"]), "Duplicate reviewed poem or poet"),
            (lambda p: p[1].update(authorId=p[0]["authorId"]), "Duplicate reviewed poem or poet"),
            (lambda p: p[0].update(text="one\ntwo\nthree\nfour"), "Incomplete waka: 41"),
            (lambda p: p[0].update(text="one\ntwo\n\nfour\nfive"), "Incomplete waka: 41"),
            (lambda p: p[0].update(text=" one\ntwo\nthree\nfour\nfive"), "Incomplete waka: 41"),
            (lambda p: p[16].update(authorOriginal="架空"), "Comparison attribution changed: 57"),
        ):
            with self.subTest(error=error):
                self.manifest = copy.deepcopy(original)
                change(self.manifest["poems"])
                self.write_fixture()
                with self.assertRaisesRegex(ValueError, error):
                    self.records()

    def test_repinned_comparison_still_requires_revision_order_and_attribution(self):
        original = copy.deepcopy(self.comparison)
        for change, error in (
            (lambda p: p.update(revid=1), "comparison revision"),
            (lambda p: p["wikitext"].update({"*": p["wikitext"]["*"].replace('id="五十七"', 'id="五十六"', 1)}), "poem boundaries"),
            (lambda p: p["wikitext"].update({"*": p["wikitext"]["*"].replace("[[w:紫式部|", "[[w:別人|", 1)}), "Comparison attribution changed: 57"),
            (lambda p: p["wikitext"].update({"*": p["wikitext"]["*"].replace("[[w:紫式部|表示]]", "不明", 1)}), "Missing comparison attribution: 57"),
        ):
            with self.subTest(error=error):
                self.comparison = copy.deepcopy(original)
                change(self.comparison["parse"])
                self.write_fixture()
                with self.assertRaisesRegex(ValueError, error):
                    self.records()


if __name__ == "__main__":
    unittest.main()

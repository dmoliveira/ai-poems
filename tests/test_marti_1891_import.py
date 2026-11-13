"""Offline evidence, selection and transcription guards for Martí's 1891 poems."""

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
MODULE = runpy.run_path(str(ROOT / "scripts/import-marti-1891.py"))
RECORDS = MODULE["make_records"]


def digest(data):
    return hashlib.sha256(data).hexdigest()


class MartiImporterTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.manifest = json.loads(MODULE["MANIFEST"].read_text(encoding="utf8"))
        self.manifest_path = self.directory / "manifest.json"
        self.comparison_path = self.directory / "comparison.json"
        for number in MODULE["IMAGE_NUMBERS"]:
            data = f"fixture image {number}; not a facsimile".encode()
            (self.directory / f"page-{number:02}.jpg").write_bytes(data)
            self.manifest["imageSha256"][str(number)] = digest(data)
        by_roman = {item["roman"]: item for item in self.manifest["poems"]}
        self.comparison = {"query": {"pages": []}}
        for label in MODULE["ROMANS"]:
            item = by_roman.get(label)
            revision = item["comparisonRevision"] if item else 1
            text = item["text"] if item else "Cultivo una rosa blanca"
            self.comparison["query"]["pages"].append({
                "title": f"Versos sencillos/{label}",
                "revisions": [{"revid": revision, "slots": {"main": {
                    "content": f"|autor=José Martí\n<poem>\n{text}\n</poem>",
                }}}],
            })
        self.write_fixture()

    def write_fixture(self):
        data = json.dumps(self.comparison, ensure_ascii=False).encode()
        self.comparison_path.write_bytes(data)
        self.manifest["comparisonSha256"] = digest(data)
        self.manifest_path.write_text(json.dumps(self.manifest, ensure_ascii=False), encoding="utf8")

    def records(self):
        with patch.dict(RECORDS.__globals__, {"MANIFEST": self.manifest_path, "COMPARISON": self.comparison_path}):
            return RECORDS(self.directory)

    def test_complete_works_have_distinct_sources_and_licensed_comparison(self):
        records = self.records()
        self.assertEqual(len(records), 45)
        self.assertNotIn("marti-versos-sencillos-039", [item["id"] for item in records])
        for item, poem in zip(self.manifest["poems"], records, strict=True):
            self.assertEqual(poem["id"], f'marti-versos-sencillos-{item["number"]:03}')
            self.assertEqual(poem["text"], item["text"])
            self.assertTrue(poem["source"].endswith(f'-{item["firstImage"]:02}foto.htm'))
            self.assertIn(f'oldid={item["comparisonRevision"]}', poem["contextSource"])
            self.assertIn("Wikisource contributors", poem["contextSourceTitle"])
            self.assertIn("CC BY-SA 4.0", poem["rights"])
            self.assertIn("creativecommons.org/licenses/by-sa/4.0/", poem["rights"])
            self.assertIn("altered against the 1891 printing", poem["rights"])
            self.assertEqual(poem["translations"], [])
            self.assertEqual(poem["themes"], [])

    def test_missing_and_tampered_evidence_is_rejected(self):
        for number in (9, 17, 20, 84):
            with self.subTest(number=number):
                path = self.directory / f"page-{number:02}.jpg"
                original = path.read_bytes()
                path.unlink()
                with self.assertRaises(FileNotFoundError):
                    self.records()
                path.write_bytes(original + b"changed")
                with self.assertRaisesRegex(ValueError, f"Historical image changed: {number}"):
                    self.records()
                path.write_bytes(original)
        original = self.comparison_path.read_bytes()
        self.comparison_path.write_bytes(original + b"changed")
        with self.assertRaisesRegex(ValueError, "Comparison snapshot changed"):
            self.records()

    def test_selection_boundaries_and_duplicate_works_are_guarded(self):
        original = copy.deepcopy(self.manifest)
        for change, error in (
            (lambda p: p.reverse(), "selection, image span or order"),
            (lambda p: p.pop(), "selection, image span or order"),
            (lambda p: p[0].update(firstImage=18), "selection, image span or order"),
            (lambda p: p[0].update(lastImage=19), "selection, image span or order"),
            (lambda p: p[1].update(text=p[0]["text"]), "Duplicate reviewed poem"),
            (lambda p: p[0].update(text="one\ntwo"), "Incomplete or malformed poem: I"),
            (lambda p: p[0].update(text=p[0]["text"].replace("Yo soy", "An invented opening", 1)),
             "Unexpected opening: I"),
            (lambda p: p[0].update(comparisonRevision=1), "Comparison revision changed: I"),
        ):
            with self.subTest(error=error):
                self.manifest = copy.deepcopy(original)
                change(self.manifest["poems"])
                self.write_fixture()
                with self.assertRaisesRegex(ValueError, error):
                    self.records()

    def test_repinned_comparison_still_requires_poem_attribution_and_boundaries(self):
        original = copy.deepcopy(self.comparison)
        for change, error in (
            (lambda pages: pages.pop(), "page count"),
            (lambda pages: pages[0].update(title="Different title"), "comparison title"),
            (lambda pages: pages[0].update(title=pages[1]["title"]), "comparison selection"),
            (lambda pages: pages[0]["revisions"][0]["slots"]["main"].update(content="<poem>text</poem>"),
             "attribution or poem"),
            (lambda pages: pages[0]["revisions"][0]["slots"]["main"].update(content="|autor=José Martí"),
             "attribution or poem"),
        ):
            with self.subTest(error=error):
                self.comparison = copy.deepcopy(original)
                change(self.comparison["query"]["pages"])
                self.write_fixture()
                with self.assertRaisesRegex(ValueError, error):
                    self.records()

    def test_check_mode_refuses_drift_without_overwriting(self):
        output = self.directory / "output.json"
        output.write_text(json.dumps(self.records(), ensure_ascii=False, indent=2) + "\n", encoding="utf8")
        with (
            patch.dict(MODULE["main"].__globals__, {
                "MANIFEST": self.manifest_path, "COMPARISON": self.comparison_path,
                "OUTPUT": output, "ROOT": self.directory,
            }),
            patch("sys.argv", ["import-marti-1891.py", str(self.directory), "--check"]),
            redirect_stdout(io.StringIO()),
        ):
            MODULE["main"]()
            output.write_text("changed", encoding="utf8")
            with self.assertRaisesRegex(ValueError, "records differ"):
                MODULE["main"]()
        self.assertEqual(output.read_text(encoding="utf8"), "changed")


if __name__ == "__main__":
    unittest.main()

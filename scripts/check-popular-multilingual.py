"""Check the reviewed readings and the specific historical scan files."""

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EVIDENCE = {
    "frost-1916.pdf": "6d1ce680dcd20fda16f3024aed3878678dd2ffc9d062b7b0be9e0de4ae61d0e1",
    "rimbaud-1895-p84.jpg": "b6759022d8fd3d2637118ed52a34fcb87ffbcc93b83481b9e0eaff73756e7491",
    "rimbaud-1895-p07.jpg": "41138132201d2da4e7d3e0eb0bd340f0acb2bf6708b23ef6d7530450676f9a3b",
    "machado-1917.pdf": "6e476cf58c158d8067f9d01f63f5a7cc690d0d631c24f98dea066e612a201828",
    "pessoa-1926.pdf": "3805cb438e0a6232ce8a2c6b531b7ec308d210b51d256f0e1f9c7c5214c208d1",
    "shiki-1902-p57.jpg": "f62f030fe5c59bd130652d0b879579a58b0afb0d0a452ac065045e8ead8eb9aa",
}
READINGS = {
    "frost-1916-the-road-not-taken": (20, "6858dcd0eea1a6699e2089a6dc727052116bdfe36b3f22a57e6a767173dbac08"),
    "rimbaud-1895-le-dormeur-du-val": (14, "de4efeefda9816522ab88f56fd55ed6c29ca0b801b04125ae137c91cd5045ef7"),
    "rimbaud-1895-voyelles": (14, "30e69abf8b4bd44aa3f5a71dd36dcc9afe8f16702aba1bd0844cf3f6443dd1d8"),
    "machado-1917-a-un-olmo-seco": (30, "eb9bbe70b788e5956952cbfb8436740873b4ace09f2c2c8e6b44126c20524d82"),
    "pessoa-1926-o-menino-da-sua-mae": (30, "5f9e025f0de5ec8422aa035ae7be5ebb6f727da7516d9aa4dfb4ecffe97db05a"),
    "shiki-1902-kaki-kueba": (3, "8f2abddb34cea2d75af6846bc7ef0cafc32b2c7751bb1b1db61b108ab29e1e3f"),
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="directory containing the six documented evidence files")
    args = parser.parse_args()
    for name, expected in EVIDENCE.items():
        if sha((args.directory / name).read_bytes()) != expected:
            raise ValueError(f"Historical evidence changed: {name}")
    records = json.loads((ROOT / "content/poems/popular-multilingual-reviewed.json").read_text(encoding="utf8"))
    if [record["id"] for record in records] != list(READINGS):
        raise ValueError("Reviewed selection or ordering changed")
    for record in records:
        lines, expected = READINGS[record["id"]]
        if len([line for line in record["text"].splitlines() if line.strip()]) != lines:
            raise ValueError(f"Line count changed: {record['id']}")
        if sha(record["text"].encode("utf8")) != expected:
            raise ValueError(f"Reviewed reading changed: {record['id']}")
    print(f"Verified {len(EVIDENCE)} historical files and {len(records)} reviewed readings")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Import the numbered Gutenberg transcription, without downloading it.

Usage: python3 scripts/import-tang.py /path/to/pg52323.txt
The checksum deliberately makes changes to the source an editorial decision.
"""

import hashlib
import json
import re
import sys
from pathlib import Path

SOURCE_SHA256 = "cd30fdc57ec8ba55949b69badf56bcd66472c10efb4729cbf4230ba3e3025c85"
AUTHORS = {
    "元稹": "Yuan Zhen", "元結": "Yuan Jie", "劉方平": "Liu Fangping",
    "劉春虛": "Liu Shenxu", "劉禹錫": "Liu Yuxi", "劉長卿": "Liu Changqing",
    "司空曙": "Sikong Shu", "唐玄宗": "Emperor Xuanzong of Tang", "孟浩然": "Meng Haoran",
    "孟郊": "Meng Jiao", "宋之問": "Song Zhiwen", "岑參": "Cen Shen",
    "崔塗": "Cui Tu", "崔曙": "Cui Shu", "崔顥": "Cui Hao", "常建": "Chang Jian",
    "張九齡": "Zhang Jiuling", "張喬": "Zhang Qiao", "張旭": "Zhang Xu",
    "張泌": "Zhang Bi", "張祜": "Zhang Hu", "張籍": "Zhang Ji of Jiangnan",
    "張繼": "Zhang Ji of Hubei", "戴叔倫": "Dai Shulun", "朱慶餘": "Zhu Qingyu",
    "李商隱": "Li Shangyin", "李白": "Li Bai", "李益": "Li Yi", "李端": "Li Duan",
    "李頎": "Li Qi", "李頻": "Li Pin", "杜審言": "Du Shenyan", "杜牧": "Du Mu",
    "杜甫": "Du Fu", "杜秋娘": "Du Qiuniang", "杜荀鶴": "Du Xunhe",
    "柳中庸": "Liu Zhongyong", "柳宗元": "Liu Zongyuan", "權德輿": "Quan Deyu",
    "沈佺期": "Shen Quanqi", "溫庭筠": "Wen Tingyun", "無名氏": "Anonymous (Tang anthology)",
    "王之渙": "Wang Zhihuan", "王勃": "Wang Bo", "王建": "Wang Jian",
    "王昌齡": "Wang Changling", "王灣": "Wang Wan", "王維": "Wang Wei", "王翰": "Wang Han",
    "白居易": "Bai Juyi", "皇甫冉": "Huangfu Ran", "皎然": "Jiaoran", "盧綸": "Lu Lun",
    "祖詠": "Zu Yong", "秦韜玉": "Qin Taoyu", "綦毋潛": "Qiwu Qian", "薛逢": "Xue Feng",
    "裴迪": "Pei Di", "西鄙人": "Anonymous (Xi Biren)", "許渾": "Xu Hun",
    "賀知章": "He Zhizhang", "賈島": "Jia Dao", "邱為": "Qiu Wei", "鄭畋": "Zheng Tian",
    "金昌緒": "Jin Changxu", "錢起": "Qian Qi", "陳子昂": "Chen Zi'ang", "陳陶": "Chen Tao",
    "韋應物": "Wei Yingwu", "韋莊": "Wei Zhuang", "韓偓": "Han Wo", "韓愈": "Han Yu",
    "韓翃": "Han Hong", "顧況": "Gu Kuang", "馬戴": "Ma Dai", "駱賓王": "Luo Binwang",
    "高適": "Gao Shi",
}


def main(path):
    raw = Path(path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != SOURCE_SHA256:
        raise ValueError("Source checksum changed; review the edition before importing")
    source = raw.decode("utf-8").replace("\r\n", "\n")
    source = source.split("*** START OF THE PROJECT GUTENBERG EBOOK 唐诗三百首 ***", 1)[1]
    source = source.split("*** END OF THE PROJECT GUTENBERG EBOOK", 1)[0]
    blocks = re.split(r"(?m)^(\d{3})\s*\n", source)
    if [int(n) for n in blocks[1::2]] != list(range(1, 321)):
        raise ValueError("Unexpected anthology numbering")
    records = []
    for number, block in zip(blocks[1::2], blocks[2::2], strict=True):
        title, content = block.split("作者：", 1)
        original_name, _, text = content.partition("\n")
        title = "".join(title.splitlines()).strip()
        original_name = original_name.strip()
        author = AUTHORS[original_name]
        text = "\n".join(line.strip() for line in text.strip().splitlines())
        if not title or not 4 <= len(text.splitlines()) <= 150:
            raise ValueError(f"Unexpected entry: {number}")
        if number == "233":  # Already represented by quiet-night-thought-li-bai.
            if original_name != "李白" or not text.startswith("床前明月光"):
                raise ValueError("Expected duplicate changed")
            continue
        author_id = re.sub(r"[^a-z0-9]+", "-", author.lower()).strip("-")
        context = f"Entry {int(number)} in Project Gutenberg's transcription of Three Hundred Tang Poems. The source names the poet {original_name}; the exact composition date is not established here."
        if original_name == "劉春虛":
            context += " This source spelling is also associated with Liu Shenxu (劉眘虛 / 劉慎虛)."
        if original_name == "西鄙人":
            context += " Xi Biren is a source designation, not an identified personal name."
        records.append({
            "id": f"tang-{number}", "title": title, "author": author,
            "authorId": author_id, "authorOriginal": original_name,
            "anonymous": original_name in {"無名氏", "西鄙人"},
            "authorYears": "Tang dynasty", "country": "China", "language": "Chinese",
            "lang": "zh-Hant", "direction": "ltr", "year": None,
            "yearLabel": "Tang dynasty · exact year unknown", "era": "Tang dynasty",
            "form": "Tang poetry", "collection": "Three Hundred Tang Poems",
            "themes": [], "mood": "paper", "context": context,
            "sourceTitle": f"Project Gutenberg · Three Hundred Tang Poems, no. {int(number)} (eBook 52323)",
            "source": "https://www.gutenberg.org/ebooks/52323",
            "rights": "Historical Chinese original; Gutenberg identifies this eBook as public domain in the United States. Its transcription does not identify a specific print edition. Check local law before reuse.",
            "text": text, "translations": [],
        })
    target = Path(__file__).resolve().parent.parent / "content/poems/tang.json"
    target.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(records)} records to {target}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])

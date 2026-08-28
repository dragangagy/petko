#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Remove Ijekavian (ijekavica) words from app.js and postgres words table."""
import re
import subprocess
from pathlib import Path

import psycopg2

APP = Path(r"D:\projekti\petko\github\app.js")
REPO = APP.parent
PG = dict(host="192.168.1.6", port=5432, user="postgres", password="homeassistant", dbname="petko_sr")
ROW_RE = re.compile(r'"([^"\\]*(?:\\.[^"\\]*)*)":\s*"([^"\\]*(?:\\.[^"\\]*)*)"')

KEEP = {"петко", "није", "ниједан", "ниједна", "ниједно", "ниједни", "ниједне"}
IJEKAV_LABEL = re.compile(r"ијекавск", re.I)


def unesc(s: str) -> str:
    return s.replace("\\n", "\n").replace('\\"', '"').replace("\\\\", "\\")


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def is_ijekavian(word: str, raw: str) -> bool:
    if word.lower() in KEEP:
        return False
    return bool(IJEKAV_LABEL.search(unesc(raw)))


def collect_delete_set(info: dict[str, str]) -> set[str]:
    return {w for w, raw in info.items() if is_ijekavian(w, raw)}


def patch_app(delete: set[str]) -> None:
    text = APP.read_text(encoding="utf-8")
    words_m = re.search(r"let WORDS = \[(.*?)\n\];", text, re.S)
    words = [unesc(w) for w in re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', words_m.group(1)) if unesc(w) not in delete]
    new_words_block = "\n".join(f'  "{esc(w)}",' for w in words)

    info_m = re.search(r"const WORD_INFO = \{(.*?)\n\};", text, re.S)
    info = {unesc(w): unesc(m) for w, m in ROW_RE.findall(info_m.group(1))}
    for w in delete:
        info.pop(w, None)
    new_info_block = "\n".join(f'  "{esc(w)}": "{esc(m)}",' for w, m in info.items())

    text = text[: words_m.start(1)] + "\n" + new_words_block + "\n" + text[words_m.end(1) :]
    info_m2 = re.search(r"const WORD_INFO = \{(.*?)\n\};", text, re.S)
    text = text[: info_m2.start(1)] + "\n" + new_info_block + "\n" + text[info_m2.end(1) :]
    APP.write_text(text, encoding="utf-8")


def collect_db_ijekavian(extra: set[str]) -> set[str]:
    found: set[str] = set()
    with psycopg2.connect(**PG) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT word FROM words
            WHERE meaning ILIKE %s
               OR lower(btrim(word)) = ANY(%s)
            """,
            ("%ијекавск%", list(extra)),
        )
        found.update(row[0] for row in cur.fetchall())
    return found


def apply_db(delete: set[str]) -> tuple[int, int]:
    words = list(delete)
    with psycopg2.connect(**PG) as conn, conn.cursor() as cur:
        cur.execute(
            "DELETE FROM word_reports WHERE lower(btrim(word)) = ANY(%s)",
            (words,),
        )
        reports = cur.rowcount
        cur.execute(
            "DELETE FROM words WHERE lower(btrim(word)) = ANY(%s)",
            (words,),
        )
        deleted = cur.rowcount
        conn.commit()
    return deleted, reports


def main(dry_run: bool = False) -> None:
    text = APP.read_text(encoding="utf-8")
    info_m = re.search(r"const WORD_INFO = \{(.*?)\n\};", text, re.S)
    info = {unesc(w): unesc(m) for w, m in ROW_RE.findall(info_m.group(1))}
    delete = collect_delete_set(info)
    sorted_delete = sorted(delete)
    out = Path(__file__).with_name("_deleted_ijekavian_words.txt")
    out.write_text("\n".join(sorted_delete), encoding="utf-8")
    print(f"app.js delete count: {len(sorted_delete)}")
    print(f"full list: {out}")

    if dry_run:
        try:
            db_extra = collect_db_ijekavian(sorted_delete)
            only_db = sorted(db_extra - delete)
            if only_db:
                print(f"db-only ijekavian extras: {len(only_db)}")
        except Exception as exc:
            print(f"db scan skipped: {exc}")
        return

    patch_app(delete)
    subprocess.run(["node", "--check", str(APP)], check=True)

    try:
        delete |= collect_db_ijekavian(sorted(delete))
    except Exception as exc:
        print(f"db scan skipped: {exc}")

    db_words, db_reports = apply_db(delete)
    print(f"db words deleted: {db_words}, word_reports deleted: {db_reports}")


if __name__ == "__main__":
    import sys

    main(dry_run="--dry-run" in sys.argv)

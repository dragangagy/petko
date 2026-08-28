#!/usr/bin/env python3
"""Rebuild HA challenge_stats from cloud baseline + post-cloud played challenges."""
from __future__ import annotations

import json
import urllib.request
from datetime import datetime, timezone

import psycopg2


def as_dt(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    return datetime.fromisoformat(text)

CLOUD_URL = "https://kfpyrajlxrucmrlhyvgr.supabase.co"
CLOUD_KEY = "sb_publishable_bVzXHMsSYKPO2eJRPZ6a8g___kRhow0"
PG = dict(host="192.168.1.6", port=5432, dbname="petko_sr", user="postgres", password="homeassistant")


def pair_key(a: str, b: str) -> tuple[str, str]:
    la, lb = a.lower().strip(), b.lower().strip()
    return (la, lb) if la <= lb else (lb, la)


def canon_names(a: str, b: str) -> tuple[str, str]:
    ka, kb = pair_key(a, b)
    if a.lower().strip() == ka:
        return a.strip(), b.strip()
    return b.strip(), a.strip()


def fetch_cloud() -> list[dict]:
    h = {"apikey": CLOUD_KEY, "Authorization": f"Bearer {CLOUD_KEY}"}
    req = urllib.request.Request(
        f"{CLOUD_URL}/rest/v1/challenge_stats?select=*&limit=1000",
        headers=h,
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


def merge_max(rows: list[dict]) -> dict[tuple, dict]:
    merged: dict[tuple, dict] = {}
    for row in rows:
        a, b = row["player_a"].strip(), row["player_b"].strip()
        key = pair_key(a, b)
        ka = key[0]
        first_is_a = a.lower() == ka
        norm = {
            "player_a": a if first_is_a else b,
            "player_b": b if first_is_a else a,
            "player_a_wins": int(row["player_a_wins"] if first_is_a else row["player_b_wins"]),
            "player_b_wins": int(row["player_b_wins"] if first_is_a else row["player_a_wins"]),
            "draws": int(row["draws"] or 0),
            "player_a_sent": int(row["player_a_sent"] if first_is_a else row["player_b_sent"]),
            "player_b_sent": int(row["player_b_sent"] if first_is_a else row["player_a_sent"]),
            "total_games": int(row["total_games"] or 0),
            "last_played_at": as_dt(row.get("last_played_at")),
        }
        cur = merged.get(key)
        if not cur or norm["total_games"] > cur["total_games"]:
            merged[key] = norm
    return merged


def apply_game(stats: dict[tuple, dict], creator: str, opponent: str, c_score: int, o_score: int, played_at) -> None:
    pa, pb = canon_names(creator, opponent)
    key = pair_key(pa, pb)
    row = stats.get(key)
    if not row:
        row = {
            "player_a": pa,
            "player_b": pb,
            "player_a_wins": 0,
            "player_b_wins": 0,
            "draws": 0,
            "player_a_sent": 0,
            "player_b_sent": 0,
            "total_games": 0,
            "last_played_at": None,
        }
        stats[key] = row
    if creator.lower().strip() == row["player_a"].lower():
        row["player_a_sent"] += 1
    else:
        row["player_b_sent"] += 1
    row["total_games"] += 1
    if c_score == o_score:
        row["draws"] += 1
    elif c_score > o_score:
        if creator.lower().strip() == row["player_a"].lower():
            row["player_a_wins"] += 1
        else:
            row["player_b_wins"] += 1
    else:
        if opponent.lower().strip() == row["player_a"].lower():
            row["player_a_wins"] += 1
        else:
            row["player_b_wins"] += 1
    if not row["last_played_at"] or as_dt(played_at) > as_dt(row["last_played_at"]):
        row["last_played_at"] = played_at


def main() -> None:
    conn = psycopg2.connect(**PG)
    cur = conn.cursor()
    cur.execute(
        "SELECT player_a, player_b, player_a_wins, player_b_wins, draws, player_a_sent, player_b_sent, total_games, last_played_at FROM challenge_stats"
    )
    cols = ["player_a", "player_b", "player_a_wins", "player_b_wins", "draws", "player_a_sent", "player_b_sent", "total_games", "last_played_at"]
    ha_before = merge_max([dict(zip(cols, r)) for r in cur.fetchall()])

    cloud = merge_max(fetch_cloud())
    stats = {k: dict(v) for k, v in cloud.items()}

    cur.execute(
        """
        SELECT creator, opponent, creator_score, opponent_score, creator_played_at, opponent_played_at
        FROM challenges
        WHERE creator_played_at IS NOT NULL AND opponent_played_at IS NOT NULL
          AND btrim(coalesce(creator,'')) <> ''
          AND btrim(coalesce(opponent,'')) <> ''
          AND lower(btrim(opponent)) NOT IN (lower('Нови корисник'), lower('Чека се'))
          AND lower(btrim(creator)) <> lower(btrim(opponent))
        ORDER BY greatest(creator_played_at, opponent_played_at)
        """
    )
    for creator, opponent, c_score, o_score, c_at, o_at in cur.fetchall():
        played_at = max(c_at, o_at)
        key = pair_key(creator, opponent)
        base = cloud.get(key)
        base_last = as_dt(base.get("last_played_at")) if base else None
        if base_last and as_dt(played_at) <= base_last:
            continue
        apply_game(stats, creator, opponent, int(c_score or 0), int(o_score or 0), played_at)

    cur.execute("DELETE FROM challenge_stats")
    for row in stats.values():
        cur.execute(
            """
            INSERT INTO challenge_stats (
              player_a, player_b, player_a_wins, player_b_wins, draws,
              player_a_sent, player_b_sent, total_games, last_played_at, updated_at
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,now())
            """,
            (
                row["player_a"],
                row["player_b"],
                row["player_a_wins"],
                row["player_b_wins"],
                row["draws"],
                row["player_a_sent"],
                row["player_b_sent"],
                row["total_games"],
                row["last_played_at"],
            ),
        )
    conn.commit()

    dg = stats.get(("dragana", "gagy"))
    print("Dragana vs Gagy AFTER:", dg)
    print("Dragana vs Gagy BEFORE:", ha_before.get(("dragana", "gagy")))
    fixed = 0
    for key, new in stats.items():
        old = ha_before.get(key)
        if not old:
            continue
        if (
            new["total_games"] != old["total_games"]
            or new["player_a_wins"] != old["player_a_wins"]
            or new["player_b_wins"] != old["player_b_wins"]
        ):
            fixed += 1
            print(
                f"  {new['player_a']} vs {new['player_b']}: "
                f"{old['player_a_wins']}:{old['player_b_wins']}/{old['total_games']} -> "
                f"{new['player_a_wins']}:{new['player_b_wins']}/{new['total_games']}"
            )
    print(f"changed pairs: {fixed}")
    conn.close()


if __name__ == "__main__":
    main()

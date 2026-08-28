#!/usr/bin/env python3
"""Compare HA challenge_stats vs cloud Supabase."""
from __future__ import annotations

import json
import urllib.request
from collections import defaultdict

import psycopg2

CLOUD_URL = "https://kfpyrajlxrucmrlhyvgr.supabase.co"
CLOUD_KEY = "sb_publishable_bVzXHMsSYKPO2eJRPZ6a8g___kRhow0"

PG = dict(host="192.168.1.6", port=5432, dbname="petko_sr", user="postgres", password="homeassistant")


def pair_key(a: str, b: str) -> tuple[str, str]:
    la, lb = a.lower().strip(), b.lower().strip()
    return (la, lb) if la <= lb else (lb, la)


def normalize_row(row: dict) -> dict:
    ka, kb = pair_key(row["player_a"], row["player_b"])
    first_is_a = ka == row["player_a"].lower().strip()
    return {
        "key": (ka, kb),
        "player_a": row["player_a"].strip(),
        "player_b": row["player_b"].strip(),
        "player_a_wins": int(row["player_a_wins"] or 0),
        "player_b_wins": int(row["player_b_wins"] or 0),
        "draws": int(row["draws"] or 0),
        "player_a_sent": int(row.get("player_a_sent") or 0),
        "player_b_sent": int(row.get("player_b_sent") or 0),
        "total_games": int(row["total_games"] or 0),
        "last_played_at": str(row.get("last_played_at") or ""),
    }


def fetch_cloud() -> list[dict]:
    h = {"apikey": CLOUD_KEY, "Authorization": f"Bearer {CLOUD_KEY}"}
    req = urllib.request.Request(
        f"{CLOUD_URL}/rest/v1/challenge_stats?select=player_a,player_b,player_a_wins,player_b_wins,draws,player_a_sent,player_b_sent,total_games,last_played_at&limit=1000",
        headers=h,
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


def fetch_ha() -> list[dict]:
    conn = psycopg2.connect(**PG)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT player_a, player_b, player_a_wins, player_b_wins, draws,
               player_a_sent, player_b_sent, total_games, last_played_at
        FROM challenge_stats
        ORDER BY total_games DESC
        """
    )
    cols = ["player_a", "player_b", "player_a_wins", "player_b_wins", "draws",
            "player_a_sent", "player_b_sent", "total_games", "last_played_at"]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    conn.close()
    return rows


def merge_case_rows(rows: list[dict], mode: str) -> dict[tuple, dict]:
    """mode: 'sum' (buggy) or 'max' (correct)"""
    merged: dict[tuple, dict] = {}
    for row in rows:
        n = normalize_row(row)
        key = n["key"]
        ka, kb = key
        first_is_a = ka == n["player_a"].lower()
        norm = {
            "player_a": n["player_a"] if first_is_a else n["player_b"],
            "player_b": n["player_b"] if first_is_a else n["player_a"],
            "player_a_wins": n["player_a_wins"] if first_is_a else n["player_b_wins"],
            "player_b_wins": n["player_b_wins"] if first_is_a else n["player_a_wins"],
            "draws": n["draws"],
            "player_a_sent": n["player_a_sent"] if first_is_a else n["player_b_sent"],
            "player_b_sent": n["player_b_sent"] if first_is_a else n["player_a_sent"],
            "total_games": n["total_games"],
            "last_played_at": n["last_played_at"],
        }
        cur = merged.get(key)
        if not cur:
            merged[key] = norm
            continue
        if mode == "sum":
            merged[key] = {
                **cur,
                "player_a_wins": cur["player_a_wins"] + norm["player_a_wins"],
                "player_b_wins": cur["player_b_wins"] + norm["player_b_wins"],
                "draws": cur["draws"] + norm["draws"],
                "player_a_sent": cur["player_a_sent"] + norm["player_a_sent"],
                "player_b_sent": cur["player_b_sent"] + norm["player_b_sent"],
                "total_games": cur["total_games"] + norm["total_games"],
                "last_played_at": max(cur["last_played_at"], norm["last_played_at"]),
            }
        else:
            if norm["total_games"] > cur["total_games"]:
                merged[key] = {**norm, "player_a": norm["player_a"], "player_b": norm["player_b"]}
            elif norm["total_games"] == cur["total_games"] and norm["last_played_at"] > cur["last_played_at"]:
                merged[key] = {**norm, "player_a": norm["player_a"], "player_b": norm["player_b"]}
    return merged


def player_totals(pairs: dict[tuple, dict]) -> dict[str, dict]:
    totals: dict[str, dict] = defaultdict(lambda: {"games": 0, "wins": 0})
    for row in pairs.values():
        a, b = row["player_a"], row["player_b"]
        totals[a.lower()]["games"] += row["total_games"]
        totals[a.lower()]["wins"] += row["player_a_wins"]
        totals[b.lower()]["games"] += row["total_games"]
        totals[b.lower()]["wins"] += row["player_b_wins"]
    return totals


def main() -> None:
    cloud_raw = fetch_cloud()
    ha_raw = fetch_ha()

    cloud = merge_case_rows(cloud_raw, "max")
    # cloud baseline + recent game for Dragana/Gagy handled separately
    ha = merge_case_rows(ha_raw, "max")

    print(f"cloud raw rows: {len(cloud_raw)}")
    print(f"ha raw rows: {len(ha_raw)}")
    print(f"cloud unique pairs: {len(cloud)}")
    print(f"ha unique pairs: {len(ha)}")

    mismatches = []
    all_keys = sorted(set(cloud) | set(ha))
    for key in all_keys:
        c = cloud.get(key)
        h = ha.get(key)
        if not c and h:
            mismatches.append(("HA_ONLY", key, None, h))
            continue
        if c and not h:
            mismatches.append(("CLOUD_ONLY", key, c, None))
            continue
        fields = ["player_a_wins", "player_b_wins", "draws", "total_games"]
        diff = {f: (c[f], h[f]) for f in fields if c[f] != h[f]}
        if diff:
            mismatches.append(("DIFF", key, c, h, diff))

    print(f"\n=== PAIR MISMATCHES: {len(mismatches)} ===")
    for m in mismatches:
        if m[0] == "DIFF":
            _, key, c, h, diff = m
            print(f"  {c['player_a']} vs {c['player_b']}: cloud={ {k:c[k] for k in diff} } ha={ {k:h[k] for k in diff} }")
        elif m[0] == "HA_ONLY":
            _, key, _, h = m
            print(f"  HA_ONLY: {h['player_a']} vs {h['player_b']} games={h['total_games']}")
        else:
            _, key, c, _ = m
            print(f"  CLOUD_ONLY: {c['player_a']} vs {c['player_b']} games={c['total_games']}")

    # Check if HA looks like 2x cloud
    doubled = 0
    for key in cloud:
        if key not in ha:
            continue
        c, h = cloud[key], ha[key]
        if h["total_games"] == c["total_games"] * 2 and c["total_games"] > 0:
            doubled += 1
    print(f"\nPairs where HA games == 2x cloud: {doubled}")

    ct = player_totals(cloud)
    ht = player_totals(ha)
    print("\n=== TOP PLAYER TOTAL MISMATCHES ===")
    for name in sorted(set(ct) | set(ht), key=lambda x: ht.get(x, ct.get(x, {"games": 0}))["games"], reverse=True)[:15]:
        cg, hg = ct.get(name, {"games": 0, "wins": 0}), ht.get(name, {"games": 0, "wins": 0})
        if cg["games"] != hg["games"] or cg["wins"] != hg["wins"]:
            print(f"  {name}: cloud {cg['wins']}W/{cg['games']}G  ha {hg['wins']}W/{hg['games']}G")


if __name__ == "__main__":
    main()

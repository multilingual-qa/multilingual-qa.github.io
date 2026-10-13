"""
Fetch the public BLP-2027 Task 2 leaderboards from EvalAI and write them to
docs/data/leaderboard.json for the website.

Why a script instead of fetching in the browser: EvalAI's API only accepts
cross-site browser requests from its own domains, so a page on github.io cannot
call it directly. A scheduled GitHub Action runs this script and commits the result.

Only leaderboards that are PUBLIC on EvalAI are visible here. While the Test phase
leaderboard is hidden, the site shows a "results not yet published" message for it.

Usage:
    python scripts/fetch_leaderboard.py                     # challenge 2738
    python scripts/fetch_leaderboard.py --challenge 2738 --out docs/data/leaderboard.json

Standard library only.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

API = "https://eval.ai/api"
TRACK_ORDER = ["2A-bn", "2A-en", "2A-as", "2A-hi", "2B-bn", "2B-en", "2B-as", "2B-hi", "2B-all"]
LANG_WORDS = {
    "bn": ["bangla", "bengali", "_bn", "-bn", " bn"],
    "en": ["english", "_en", "-en", " en"],
    "as": ["assamese", "_as", "-as", " as"],
    "hi": ["hindi", "_hi", "-hi", " hi"],
    "all": ["all"],
}


def get_json(url, retries=4):
    """GET a JSON document; returns (status_code, data). Retries on network errors and 5xx/429."""
    req = urllib.request.Request(url, headers={"User-Agent": "blp27-task2-site/1.0", "Accept": "application/json"})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
                continue
            try:
                body = json.loads(e.read().decode("utf-8"))
            except Exception:
                body = None
            return e.code, body
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
                continue
            raise RuntimeError(f"Network error for {url}: {e}") from e


def results_list(data):
    """EvalAI endpoints return either a list or a paginated {'results': [...]} object."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("results", [])
    return []


def track_key(split_name):
    """Map a dataset split name such as '2A Bangla (Monolingual)' or '2B_all' to '2A-bn' / '2B-all'."""
    name = " " + split_name.lower().replace("_", " _").replace("-", " -") + " "
    m = re.search(r"2\s*([ab])", name)
    if not m:
        return None
    sub = "2" + m.group(1).upper()
    for code, words in LANG_WORDS.items():
        if any(w in name for w in words):
            return f"{sub}-{code}"
    return None


def phase_key(phase, index, total):
    """'dev', 'test' or 'post' from the phase name; anything else (e.g. unused legacy phases) is ignored."""
    name = (phase.get("name") or "").lower()
    if "legacy" in name or "unused" in name:
        return None
    if "post" in name:                      # check before "eval": "Post-Evaluation Phase"
        return "post"
    if "dev" in name:
        return "dev"
    if any(w in name for w in ("test", "eval", "final")):
        return "test"
    return None


def fetch_entries(split_id, schema):
    labels = schema.get("labels", [])
    order_by = schema.get("default_order_by", labels[0] if labels else None)
    meta = (schema.get("metadata") or {}).get(order_by) or {}
    ascending = bool(meta.get("sort_ascending", False))

    url = f"{API}/jobs/challenge_phase_split/{split_id}/leaderboard/?page_size=1000"
    rows = []
    while url:
        status, data = get_json(url)
        if status != 200:
            return None  # not public (EvalAI returns 400) or other error
        rows.extend(results_list(data))
        url = data.get("next") if isinstance(data, dict) else None

    entries = []
    for item in rows:
        raw = item.get("result") or []
        scores = {}
        for label, value in zip(labels, raw):
            try:
                scores[label] = float(value)
            except (TypeError, ValueError):
                scores[label] = None
        entries.append({
            "team": item.get("submission__participant_team__team_name") or "Unknown team",
            "method": item.get("submission__method_name") or "",
            "baseline": bool(item.get("submission__is_baseline")),
            "submittedAt": item.get("submission__submitted_at"),
            "scores": scores,
        })

    # EvalAI does not sort "latest submission" leaderboards by score; sort here.
    def sort_value(e):
        v = e["scores"].get(order_by)
        return (v is None, v if ascending else -(v or 0))
    entries.sort(key=sort_value)

    rank = 0
    for e in entries:
        if e["baseline"]:
            e["rank"] = None
        else:
            rank += 1
            e["rank"] = rank
    return {"labels": labels, "orderBy": order_by, "entries": entries}


def build(challenge_id):
    status, phases_data = get_json(f"{API}/challenges/challenge/{challenge_id}/challenge_phase")
    phases = sorted(results_list(phases_data) if status == 200 else [],
                    key=lambda p: (p.get("start_date") or "", p.get("id", 0)))

    status, splits_data = get_json(f"{API}/challenges/{challenge_id}/challenge_phase_split")
    if status != 200:
        raise RuntimeError(f"Could not list leaderboards for challenge {challenge_id} (HTTP {status}).")
    splits = results_list(splits_data)

    # Phases that only appear through their splits (if the phase list was unavailable)
    known_ids = {p["id"] for p in phases}
    for s in splits:
        if s["challenge_phase"] not in known_ids:
            phases.append({"id": s["challenge_phase"], "name": s.get("challenge_phase_name", ""), "start_date": None})
            known_ids.add(s["challenge_phase"])

    out_phases = []
    for i, p in enumerate(phases):
        key = phase_key(p, i, len(phases))
        if key is None:
            print(f"  skipping phase '{p.get('name')}'", file=sys.stderr)
            continue
        tracks = {}
        for s in splits:
            if s["challenge_phase"] != p["id"]:
                continue
            track = track_key(s.get("dataset_split_name", ""))
            if not track:
                print(f"  skipping unrecognised split '{s.get('dataset_split_name')}'", file=sys.stderr)
                continue
            board = fetch_entries(s["id"], s.get("leaderboard_schema") or {})
            if board is not None:
                tracks[track] = board
                print(f"  {p.get('name')} / {track}: {len(board['entries'])} entries")
        out_phases.append({
            "key": key,
            "name": p.get("name") or f"Phase {i + 1}",
            "startDate": p.get("start_date"),
            "endDate": p.get("end_date"),
            "public": bool(tracks),
            "tracks": {k: tracks[k] for k in TRACK_ORDER if k in tracks},
        })
    # If two phases map to the same key, keep the public one.
    by_key = {}
    for ph in out_phases:
        if ph["key"] not in by_key or (ph["public"] and not by_key[ph["key"]]["public"]):
            by_key[ph["key"]] = ph
    return {"challenge": challenge_id, "phases": [ph for ph in out_phases if by_key[ph["key"]] is ph]}


def main():
    global API
    ap = argparse.ArgumentParser()
    ap.add_argument("--challenge", type=int, default=2738)
    ap.add_argument("--out", default=os.path.join("docs", "data", "leaderboard.json"))
    ap.add_argument("--api", default=API, help="EvalAI API base URL (for testing).")
    args = ap.parse_args()
    API = args.api.rstrip("/")

    try:
        data = build(args.challenge)
    except RuntimeError as e:
        # Keep the previous file so the website keeps working; fail the run so it is visible.
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    # Only rewrite the file when the leaderboard content changed, so the hourly job
    # does not create a commit every hour. "updated" is the time of the last change.
    old = None
    if os.path.exists(args.out):
        with open(args.out, encoding="utf-8") as f:
            try:
                old = json.load(f)
            except json.JSONDecodeError:
                old = None
    if old and {k: v for k, v in old.items() if k != "updated"} == data:
        print("Leaderboard unchanged.")
        return

    data["updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
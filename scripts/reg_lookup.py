#!/usr/bin/env python3
"""
reg_lookup.py — Bulk registration lookup for Airtable-scraped rows.

Groups scraped rows by state, submits one bulk job per state to
mn-dvs-plates.fly.dev, polls until complete, then annotates each row
with `match_status` and `reg_*` fields.

`match_status` mapping (mirrors import_engine.py VALID_MATCH):
  "Y"  — plate found AND make/model consistent with observed vehicle
  "N"  — plate not found in registry
  ""   — lookup failed / state not supported (leave blank, don't block ingest)

Output: annotated JSON written to --output (or stdout).

Usage:
    uv run scripts/reg_lookup.py --input /tmp/airtable_rows.json \\
                                 --output /tmp/airtable_rows_reg.json

    # Dry-run: show what would be submitted without calling the API
    uv run scripts/reg_lookup.py --input /tmp/airtable_rows.json --dry-run

Env vars:
    DVS_PASSWORD   Override the bulk-lookup password (default: for-we-are-many)
"""
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx"]
# ///

import argparse
import json
import os
import sys
import time
from collections import defaultdict

import httpx

# ── Config ─────────────────────────────────────────────────────────────────────

DVS_BASE = "https://mn-dvs-plates.fly.dev"
DVS_PW   = os.environ.get("DVS_PASSWORD", "for-we-are-many")

POLL_INTERVAL_SEC = 15   # match the UI polling cadence
MAX_POLL_ATTEMPTS = 40   # 40 × 15s = 10 min ceiling per batch
BATCH_PAUSE_SEC   = 2    # pause between state batches

# How we decide if reg matches the observed vehicle
# We compare make strings — both are uppercased and we check if one contains the other.
MAKE_ALIASES: dict[str, list[str]] = {
    "CHEVROLET": ["CHEVY", "CHEVROLET"],
    "CHEVY":     ["CHEVY", "CHEVROLET"],
    "CHRYSLER":  ["CHRYSLER"],
    "DODGE":     ["DODGE"],
    "FORD":      ["FORD"],
    "HONDA":     ["HONDA"],
    "HYUNDAI":   ["HYUNDAI"],
    "JEEP":      ["JEEP"],
    "KIA":       ["KIA"],
    "NISSAN":    ["NISSAN"],
    "RAM":       ["RAM", "DODGE"],
    "SUBARU":    ["SUBARU"],
    "TOYOTA":    ["TOYOTA"],
    "VOLKSWAGEN":["VW", "VOLKSWAGEN"],
    "VW":        ["VW", "VOLKSWAGEN"],
}


# ── Match logic ─────────────────────────────────────────────────────────────────

def makes_match(observed_make: str, reg_make: str) -> bool:
    """Return True if the observed and registered makes are consistent."""
    if not observed_make or not reg_make:
        return True   # can't determine — don't penalise
    obs = observed_make.upper().strip()
    reg = reg_make.upper().strip()
    if obs == reg:
        return True
    # Alias expansion
    obs_aliases = MAKE_ALIASES.get(obs, [obs])
    reg_aliases = MAKE_ALIASES.get(reg, [reg])
    return bool(set(obs_aliases) & set(reg_aliases))


def determine_match_status(row: dict, identity_data: dict | None) -> tuple[str, dict]:
    """
    Returns (match_status, reg_info_dict).
    match_status: "Y", "N", or "" (unknown)
    reg_info: extra fields to annotate the row with
    """
    if identity_data is None:
        return "", {}

    if not identity_data.get("found", False):
        return "N", {}

    veh = identity_data.get("vehicle") or {}
    reg_info = {
        "reg_year":  veh.get("year"),
        "reg_make":  veh.get("make", ""),
        "reg_model": veh.get("model", ""),
        "reg_color": veh.get("exteriorColor", ""),
    }

    match = makes_match(row.get("make", ""), reg_info["reg_make"])
    return "Y" if match else "N", reg_info


# ── API helpers ─────────────────────────────────────────────────────────────────

def submit_batch(client: httpx.Client, plates_by_state: list[tuple[str, str]]) -> str | None:
    """
    plates_by_state: list of (plate, state) tuples.
    Builds the newline-delimited plate string the API expects:
      "EKL017\nTX XMD3777\nIA PON516"   (MN is defaultState)
    Returns job_id or None on error.
    """
    # Find the most-common state to use as defaultState
    from collections import Counter
    state_counts = Counter(st for _, st in plates_by_state)
    default_state = state_counts.most_common(1)[0][0] or "MN"

    lines = []
    for plate, state in plates_by_state:
        if state and state != default_state:
            lines.append(f"{state} {plate}")
        else:
            lines.append(plate)
    plate_text = "\n".join(lines)

    try:
        resp = client.post(
            f"{DVS_BASE}/api/bulk",
            params={"pw": DVS_PW},
            json={"plates": plate_text, "defaultState": default_state, "includeMnDvs": True},
            timeout=30,
        )
        resp.raise_for_status()
        job_id = resp.json().get("jobId")
        if not job_id:
            print(f"  ⚠️  No jobId in response: {resp.text[:200]}", file=sys.stderr)
        return job_id
    except Exception as e:
        print(f"  ⚠️  Batch submit failed: {e}", file=sys.stderr)
        return None


def poll_until_done(client: httpx.Client, job_id: str) -> list[dict] | None:
    """Poll a bulk job until all plates are done. Returns list of plate result dicts."""
    for attempt in range(1, MAX_POLL_ATTEMPTS + 1):
        try:
            resp = client.get(
                f"{DVS_BASE}/api/bulk/{job_id}",
                params={"pw": DVS_PW},
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"  ⚠️  Poll attempt {attempt} failed: {e}", file=sys.stderr)
            time.sleep(POLL_INTERVAL_SEC)
            continue

        plates = data.get("plates", [])
        # We only need identityStatus — mnDvsStatus is a slower secondary
        # MN DVS check that we don't use for match_status.
        done = all(
            p.get("identityStatus") not in ("pending", None)
            for p in plates
        )

        completed = sum(1 for p in plates if p.get("identityStatus") not in ("pending", None))
        print(f"  ⏳  [{attempt:>2}/{MAX_POLL_ATTEMPTS}] {completed}/{len(plates)} done…",
              file=sys.stderr, end="\r")

        if done:
            print(f"  ✅  All {len(plates)} plates resolved.                    ", file=sys.stderr)
            return plates

        time.sleep(POLL_INTERVAL_SEC)

    print(f"\n  ⚠️  Timed out waiting for job {job_id}", file=sys.stderr)
    return None


# ── Main ────────────────────────────────────────────────────────────────────────

def lookup_registrations(rows: list[dict], dry_run: bool = False) -> list[dict]:
    """
    Annotate each row in-place with match_status and reg_* fields.
    Submits one bulk job covering all plates (mixed states).
    Returns the annotated rows.
    """
    # Build (plate, state) index — deduplicate plates
    all_plates: list[tuple[str, str]] = []
    seen: set[str] = set()
    for row in rows:
        plate = row["plate"]
        state = row.get("state", "")
        if plate not in seen:
            all_plates.append((plate, state))
            seen.add(plate)

    print(f"[reg] {len(all_plates)} unique plates across "
          f"{len(set(st for _, st in all_plates))} states", file=sys.stderr)

    if not all_plates:
        print("[reg] ⚠️  0 plates — skipping DVS lookup", file=sys.stderr)
        for row in rows:
            row["match_status"] = ""
        return rows

    if dry_run:
        print("[reg] Dry-run — skipping API calls", file=sys.stderr)
        for row in rows:
            row.setdefault("match_status", "")
        return rows

    # Submit single bulk job (API handles mixed states via "STATE PLATE" prefix format)
    with httpx.Client() as client:
        print(f"[reg] Submitting {len(all_plates)} plates to DVS bulk API…", file=sys.stderr)
        job_id = submit_batch(client, all_plates)
        if not job_id:
            print("[reg] ⚠️  Could not start job — match_status will be blank for all rows",
                  file=sys.stderr)
            for row in rows:
                row["match_status"] = ""
            return rows

        print(f"[reg] Job ID: {job_id} — polling every {POLL_INTERVAL_SEC}s…", file=sys.stderr)
        results = poll_until_done(client, job_id)

    if results is None:
        print("[reg] ⚠️  Lookup timed out — match_status will be blank", file=sys.stderr)
        for row in rows:
            row["match_status"] = ""
        return rows

    # Build plate → result dict
    plate_results: dict[str, dict] = {}
    for r in results:
        plate_results[r["plate"].upper()] = r

    # Annotate each original row
    matched = not_found = unknown = 0
    for row in rows:
        plate = row["plate"]
        result = plate_results.get(plate)
        if result is None:
            row["match_status"] = ""
            unknown += 1
            continue

        status = result.get("identityStatus", "")
        if status in ("error", "timeout") or not status:
            row["match_status"] = ""
            unknown += 1
            continue

        identity_data = result.get("identityData")
        match_status, reg_info = determine_match_status(row, identity_data)
        row["match_status"] = match_status
        row.update(reg_info)

        if match_status == "Y":
            matched += 1
        elif match_status == "N":
            not_found += 1
        else:
            unknown += 1

    print(f"[reg] ✅ Results: {matched} match, {not_found} not found, {unknown} unknown",
          file=sys.stderr)
    return rows


def main():
    parser = argparse.ArgumentParser(description="Bulk registration lookup for scraped Airtable rows.")
    parser.add_argument("--input",  "-i", metavar="FILE", required=True,
                        help="JSON file from scrape_airtable.py")
    parser.add_argument("--output", "-o", metavar="FILE",
                        help="Write annotated JSON to FILE (default: stdout)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Skip API calls — leave match_status blank")
    args = parser.parse_args()

    with open(args.input) as f:
        rows = json.load(f)

    print(f"\n{'='*55}", file=sys.stderr)
    print(f"  Fluke — Registration Lookup", file=sys.stderr)
    print(f"  Input rows: {len(rows)}", file=sys.stderr)
    print(f"{'='*55}\n", file=sys.stderr)

    rows = lookup_registrations(rows, dry_run=args.dry_run)

    payload = json.dumps(rows, indent=2)
    if args.output:
        with open(args.output, "w") as f:
            f.write(payload)
        print(f"\n[reg] Wrote {len(rows)} annotated rows → {args.output}", file=sys.stderr)
    else:
        print(payload)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
airtable_ingest.py — Ingest scraped Airtable rows into Fluke PocketBase.

Reads JSON from --input <file> (or stdin), then for each row:
  1. Upsert vehicle (find-or-create by plate + state)
  2. Check for a same-day sighting duplicate
  3. Insert sighting (vehicle, date, location, ice)

Uses the same 3-tier PocketBase schema as import_engine.py.

Usage:
    uv run scripts/airtable_ingest.py --input /tmp/airtable_rows.json
    uv run scripts/airtable_ingest.py --input /tmp/airtable_rows.json --dry-run

Env vars:
    POCKETBASE_URL    PocketBase pod URL (no trailing slash)
    PB_ADMIN_EMAIL    Superuser email
    PB_ADMIN_PASS     Superuser password
"""
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx"]
# ///

import argparse
import json
import os
import sys
from datetime import date

import httpx

# ── Config ─────────────────────────────────────────────────────────────────────

PB_URL    = os.environ.get("POCKETBASE_URL",  "http://127.0.0.1:8090")
PB_EMAIL  = os.environ.get("PB_ADMIN_EMAIL",  "admin@local.dev")
PB_PASS   = os.environ.get("PB_ADMIN_PASS",   "admin123456")

IMPORT_SOURCE = "airtable-hot-dishes"


def _esc(val: str) -> str:
    """Escape a value for use inside a PocketBase filter string."""
    return val.replace('\\', '\\\\').replace('"', '\\"')


# ── PocketBase auth ─────────────────────────────────────────────────────────────

def pb_auth(client: httpx.Client) -> str:
    resp = client.post(
        f"{PB_URL}/api/collections/_superusers/auth-with-password",
        json={"identity": PB_EMAIL, "password": PB_PASS},
    )
    resp.raise_for_status()
    token = resp.json()["token"]
    print(f"✅  Authenticated as superuser ({PB_URL})")
    return token


# ── Vehicle upsert ──────────────────────────────────────────────────────────────

def upsert_vehicle(client: httpx.Client, headers: dict, row: dict,
                   cache: dict[str, str]) -> str | None:
    """Find or create a vehicle by plate. Returns vehicle id or None on error."""
    plate = row["plate"]

    if plate in cache:
        return cache[plate]

    # --- lookup ---
    try:
        resp = client.get(
            f"{PB_URL}/api/collections/vehicles/records",
            params={"filter": f'plate = "{_esc(plate)}"', "perPage": 1},
            headers=headers,
        )
        resp.raise_for_status()
        items = resp.json().get("items", [])
    except Exception as e:
        print(f"  ⚠️  Vehicle lookup failed for {plate}: {e}")
        return None

    if items:
        vehicle_id = items[0]["id"]
        cache[plate] = vehicle_id
        return vehicle_id

    # --- create ---
    # Derive searchable: HS = searchable, C = not (mirrors import_engine logic)
    searchable = row.get("ice", "") in ("Y", "HS")
    veh_data = {
        "plate":     plate,
        "state":     row.get("state", ""),
        "make":      row.get("make", ""),
        "model":     row.get("model", ""),
        "color":     row.get("color", ""),
        "searchable": searchable,
    }
    try:
        resp = client.post(
            f"{PB_URL}/api/collections/vehicles/records",
            json=veh_data,
            headers=headers,
        )
        resp.raise_for_status()
        vehicle_id = resp.json()["id"]
        cache[plate] = vehicle_id
        return vehicle_id
    except Exception as e:
        print(f"  ⚠️  Vehicle create failed for {plate}: {e}")
        return None


# ── Duplicate check ─────────────────────────────────────────────────────────────

def is_duplicate_sighting(client: httpx.Client, headers: dict,
                           vehicle_id: str, dt: str, location: str) -> bool:
    """True if a sighting for this vehicle+date+location already exists."""
    date_prefix = dt[:10]  # "YYYY-MM-DD"
    filter_str  = f'vehicle = "{vehicle_id}" && location = "{_esc(location)}"'
    try:
        resp = client.get(
            f"{PB_URL}/api/collections/sightings/records",
            params={"filter": filter_str, "perPage": 50, "skipTotal": 1},
            headers=headers,
        )
        resp.raise_for_status()
        for item in resp.json().get("items", []):
            if item.get("date", "")[:10] == date_prefix:
                return True
    except Exception as e:
        print(f"  ⚠️  Duplicate check error: {e}")
    return False


# ── Sighting insert ─────────────────────────────────────────────────────────────

def insert_sighting(client: httpx.Client, headers: dict,
                    vehicle_id: str, row: dict) -> bool:
    data = {
        "vehicle":  vehicle_id,
        "location": row.get("location", ""),
        "date":     row.get("date"),
        "ice":      row.get("ice", ""),
        "notes":    f"[{IMPORT_SOURCE}]",
    }
    try:
        resp = client.post(
            f"{PB_URL}/api/collections/sightings/records",
            json=data,
            headers=headers,
        )
        resp.raise_for_status()
        return True
    except Exception as e:
        print(f"  ⚠️  Sighting insert failed: {e}")
        return False


# ── Main ────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Ingest scraped Airtable rows into Fluke PocketBase.")
    parser.add_argument("--input", "-i", metavar="FILE",
                        help="JSON file from scrape_airtable.py (default: stdin).")
    parser.add_argument("--dry-run", action="store_true",
                        help="Parse and validate rows without writing to PocketBase.")
    args = parser.parse_args()

    # ── Load rows ──────────────────────────────────────────────────────────────
    if args.input:
        with open(args.input) as f:
            rows = json.load(f)
    else:
        rows = json.load(sys.stdin)

    print(f"\n{'='*55}")
    print(f"  Fluke — Airtable Ingest  ({date.today().isoformat()})")
    print(f"  {'DRY-RUN — no writes' if args.dry_run else f'Target: {PB_URL}'}")
    print(f"  Rows to process: {len(rows)}")
    print(f"{'='*55}\n")

    # Filter out rows with no recognisable ICE status (could be header rows or
    # other record types we don't care about)
    valid_rows = [r for r in rows if r.get("ice") in ("C", "HS", "Y", "N")]
    skipped_no_ice = len(rows) - len(valid_rows)
    if skipped_no_ice:
        print(f"⚠️   Skipped {skipped_no_ice} rows with unrecognised ICE status")

    if args.dry_run:
        for r in valid_rows:
            print(f"  [dry] {r['plate']:<10} {r['state']:<3} {r['ice']:<4}  "
                  f"{r.get('location',''):<12}  {r.get('date','')[:10]}")
        print(f"\n✅  Dry-run complete. {len(valid_rows)} rows would be ingested.")
        return

    # ── Live ingest ────────────────────────────────────────────────────────────
    with httpx.Client(timeout=30) as client:
        token   = pb_auth(client)
        headers = {"Authorization": token}
        cache: dict[str, str] = {}

        inserted   = 0
        duplicates = 0
        skipped    = 0
        errors     = 0

        # Location auto-normalization: fetch mappings once
        location_map: dict[str, str] = {}  # raw_value → canonical name
        try:
            pg = 1
            while True:
                resp = client.get(
                    f"{PB_URL}/api/collections/location_mappings/records",
                    params={"perPage": 200, "page": pg, "expand": "managed_location"},
                    headers=headers,
                )
                if resp.is_success:
                    data = resp.json()
                    for item in data.get("items", []):
                        raw = item.get("raw_value", "")
                        canonical = item.get("expand", {}).get("managed_location", {}).get("name", "")
                        if raw and canonical:
                            location_map[raw] = canonical
                    if pg >= data.get("totalPages", 1):
                        break
                    pg += 1
                else:
                    break
        except Exception:
            pass  # location normalization is best-effort
        if location_map:
            print(f"📍  Loaded {len(location_map)} location mappings for auto-normalization")

        for i, row in enumerate(valid_rows, 1):
            plate = row["plate"]

            vehicle_id = upsert_vehicle(client, headers, row, cache)
            if not vehicle_id:
                errors += 1
                continue

            # Auto-normalize location before duplicate check
            raw_loc = row.get("location", "")
            if raw_loc and raw_loc in location_map:
                row["location"] = location_map[raw_loc]

            if is_duplicate_sighting(client, headers, vehicle_id,
                                     row.get("date", ""), row.get("location", "")):
                print(f"  ⏭️   [{i:>3}] {plate} — duplicate, skipping")
                duplicates += 1
                continue

            ok = insert_sighting(client, headers, vehicle_id, row)
            if ok:
                ice_label = {"C": "Confirmed ICE", "HS": "Highly Suspected", "Y": "ICE", "N": "Not ICE"}.get(row["ice"], row["ice"])
                print(f"  ✅  [{i:>3}] {plate:<10} ({row.get('state','')}) — {ice_label} @ {row.get('location','')}")
                inserted += 1
            else:
                errors += 1

    print(f"\n{'='*55}")
    print(f"  ✅  Airtable ingest complete")
    print(f"     Inserted:   {inserted}")
    print(f"     Duplicates: {duplicates}")
    print(f"     No-ICE skip:{skipped_no_ice}")
    print(f"     Errors:     {errors}")
    print(f"{'='*55}\n")

    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()

#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.9"
# dependencies = ["httpx"]
# ///
"""
patch_views_latest_upload.py
----------------------------
Patches enhanced_plate_stats and enhanced_vin_stats to add
MAX(s.created) as latest_upload so the Records Manager can sort
by upload date.

Usage:
  uv run scripts/patch_views_latest_upload.py
"""

import sys
import os
import httpx

PB_URL = os.environ.get("PB_URL", "http://127.0.0.1:8090")
PB_EMAIL = os.environ.get("PB_EMAIL", "swan.lake.loon@proton.me")
PB_PASSWORD = os.environ.get("PB_PASSWORD", "")

PLATE_STATS_QUERY = (
    "SELECT v.id as id, v.plate as plate, COUNT(s.id) as sighting_count, "
    "MAX(s.date) as latest_sighting, MAX(s.created) as latest_upload, "
    "MAX(v.state) as state_list, GROUP_CONCAT(s.ice) as ice_list, "
    "MAX(vi.vin) as vin_list, MAX(pvi.vin) as physical_vin_list, "
    "GROUP_CONCAT(s.location) as location_list, "
    "GROUP_CONCAT(s.match_status) as match_status_list, "
    "MAX(v.searchable) as searchable, "
    "MAX(v.physical_vin_relation) as physical_vin_relation "
    "FROM vehicles v "
    "LEFT JOIN sightings s ON s.vehicle = v.id "
    "LEFT JOIN vins vi ON v.vin_relation = vi.id "
    "LEFT JOIN vins pvi ON v.physical_vin_relation = pvi.id "
    "GROUP BY v.id"
)

VIN_STATS_QUERY = (
    "SELECT vi.id as id, vi.vin as vin, vi.title_issues as title_issues, "
    "COUNT(s.id) as sighting_count, MAX(s.date) as latest_sighting, "
    "MAX(s.created) as latest_upload, "
    "GROUP_CONCAT(DISTINCT v.plate) as plate_list, "
    "MAX(v.searchable) as searchable, "
    "MAX(CASE WHEN v.physical_vin_relation = vi.id THEN 1 ELSE 0 END) as is_physical_vin "
    "FROM vins vi "
    "LEFT JOIN vehicles v ON v.vin_relation = vi.id OR v.physical_vin_relation = vi.id "
    "LEFT JOIN sightings s ON s.vehicle = v.id "
    "GROUP BY vi.id"
)


def main():
    if not PB_PASSWORD:
        print("❌  Set PB_PASSWORD env var before running.")
        sys.exit(1)

    print(f"Connecting to {PB_URL} as {PB_EMAIL}…")

    with httpx.Client(base_url=PB_URL, timeout=15) as c:
        # PocketBase 0.23+ uses /api/collections/_superusers/auth-with-password
        token = None
        for endpoint in (
            "/api/collections/_superusers/auth-with-password",
            "/api/superusers/auth-with-password",
            "/api/admins/auth-with-password",
        ):
            resp = c.post(endpoint, json={"identity": PB_EMAIL, "password": PB_PASSWORD})
            if resp.is_success:
                token = resp.json()["token"]
                print(f"✅  Authenticated via {endpoint}")
                break
            elif resp.status_code != 404:
                print(f"❌  Auth failed at {endpoint}: {resp.status_code} {resp.text[:200]}")
                sys.exit(1)

        if not token:
            print("❌  Could not find a working auth endpoint.")
            sys.exit(1)

        headers = {"Authorization": token}

        # Fetch collection list to resolve IDs
        cols = c.get("/api/collections", params={"perPage": 200}, headers=headers)
        cols.raise_for_status()
        col_map = {col["name"]: col["id"] for col in cols.json()["items"]}

        patches = [
            ("enhanced_plate_stats", "pbcplatestatsen", PLATE_STATS_QUERY),
            ("enhanced_vin_stats",   "pbcvinstatsenh",  VIN_STATS_QUERY),
        ]

        for name, fallback_id, query in patches:
            col_id = col_map.get(name, fallback_id)

            # Fetch the current collection definition so we preserve all rules/fields
            get_resp = c.get(f"/api/collections/{col_id}", headers=headers)
            if not get_resp.is_success:
                print(f"❌  Could not fetch {name}: {get_resp.status_code}")
                continue
            current = get_resp.json()

            # Merge: only change the viewQuery
            current["viewQuery"] = query

            put_resp = c.put(f"/api/collections/{col_id}",
                             json=current, headers=headers)
            if put_resp.is_success:
                print(f"✅  {name} updated (id={col_id})")
            else:
                print(f"❌  {name} failed: {put_resp.status_code} {put_resp.text[:400]}")

    print("\nDone. The 'latest_upload' column is now available in both stats views.")


if __name__ == "__main__":
    main()

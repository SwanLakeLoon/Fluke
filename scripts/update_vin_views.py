#!/usr/bin/env python3
"""
Migration: Update SQL views to support physical_vin_relation (Option B).

Changes:
  1. enhanced_plate_stats — exposes physical_vin_relation so the
     "Vehicle VINs only" filter works in Plate View.
  2. enhanced_vin_stats — joins via BOTH vin_relation and physical_vin_relation
     so VINs that only exist as physical VINs are visible. Adds is_physical_vin
     flag for filtering.

Usage:
    uv run scripts/update_vin_views.py

For production:
    POCKETBASE_URL=https://eccentric-bumblebee.pikapod.net \
    PB_ADMIN_EMAIL=your@email.com \
    PB_ADMIN_PASS=yourpassword \
    uv run scripts/update_vin_views.py
"""
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx"]
# ///

import os
import httpx
import sys

PB_URL   = os.environ.get("POCKETBASE_URL", "http://127.0.0.1:8090")
EMAIL    = os.environ.get("PB_ADMIN_EMAIL",  "admin@local.dev")
PASSWORD = os.environ.get("PB_ADMIN_PASS",   "admin123456")

# Updated view queries
ENHANCED_PLATE_STATS_QUERY = (
    "SELECT v.id as id, v.plate as plate, COUNT(s.id) as sighting_count, "
    "MAX(s.date) as latest_sighting, MAX(v.state) as state_list, "
    "GROUP_CONCAT(s.ice) as ice_list, MAX(vi.vin) as vin_list, "
    "MAX(pvi.vin) as physical_vin_list, "
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

ENHANCED_VIN_STATS_QUERY = (
    "SELECT vi.id as id, vi.vin as vin, vi.title_issues as title_issues, "
    "COUNT(s.id) as sighting_count, MAX(s.date) as latest_sighting, "
    "GROUP_CONCAT(DISTINCT v.plate) as plate_list, "
    "MAX(v.searchable) as searchable, "
    "MAX(CASE WHEN v.physical_vin_relation = vi.id THEN 1 ELSE 0 END) as is_physical_vin "
    "FROM vins vi "
    "LEFT JOIN vehicles v ON v.vin_relation = vi.id OR v.physical_vin_relation = vi.id "
    "LEFT JOIN sightings s ON s.vehicle = v.id "
    "GROUP BY vi.id"
)


def main():
    with httpx.Client(timeout=30) as client:
        print(f"Connecting to {PB_URL}...")
        resp = client.post(
            f"{PB_URL}/api/collections/_superusers/auth-with-password",
            json={"identity": EMAIL, "password": PASSWORD},
        )
        resp.raise_for_status()
        token = resp.json()["token"]
        print("  ✓ Authenticated")

        headers = {"Authorization": token}

        # 1. Update enhanced_plate_stats
        print("\nUpdating enhanced_plate_stats view...")
        resp = client.get(f"{PB_URL}/api/collections/enhanced_plate_stats", headers=headers)
        resp.raise_for_status()
        col = resp.json()

        resp = client.patch(
            f"{PB_URL}/api/collections/{col['id']}",
            json={"viewQuery": ENHANCED_PLATE_STATS_QUERY},
            headers=headers,
        )
        if resp.is_success:
            print("  ✓ enhanced_plate_stats updated (added physical_vin_relation)")
        else:
            print(f"  ✗ Failed: {resp.status_code} — {resp.text}")
            sys.exit(1)

        # 2. Update enhanced_vin_stats
        print("\nUpdating enhanced_vin_stats view...")
        resp = client.get(f"{PB_URL}/api/collections/enhanced_vin_stats", headers=headers)
        resp.raise_for_status()
        col = resp.json()

        resp = client.patch(
            f"{PB_URL}/api/collections/{col['id']}",
            json={"viewQuery": ENHANCED_VIN_STATS_QUERY},
            headers=headers,
        )
        if resp.is_success:
            print("  ✓ enhanced_vin_stats updated (joins both VIN relations, added is_physical_vin)")
        else:
            print(f"  ✗ Failed: {resp.status_code} — {resp.text}")
            sys.exit(1)

        print("\n🎉 Views updated successfully.")


if __name__ == "__main__":
    main()

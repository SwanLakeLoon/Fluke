#!/usr/bin/env python3
"""
Migration: Add physical_vin_relation field to vehicles collection.

This supports Option B of the VIN Source architecture:
  - vin_relation          → existing field, stores the "Plate VIN" (from PlateToVin lookup)
  - physical_vin_relation → new field,      stores the "Vehicle VIN" (from physical dash inspection)

Usage:
    uv run scripts/add_physical_vin.py
"""
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx"]
# ///

import httpx
import os
import sys

PB_URL   = os.environ.get("POCKETBASE_URL", "http://127.0.0.1:8090")
EMAIL    = os.environ.get("PB_ADMIN_EMAIL",  "admin@local.dev")
PASSWORD = os.environ.get("PB_ADMIN_PASS",   "admin123456")


def get_token(client: httpx.Client) -> str:
    resp = client.post(
        f"{PB_URL}/api/collections/_superusers/auth-with-password",
        json={"identity": EMAIL, "password": PASSWORD},
    )
    resp.raise_for_status()
    return resp.json()["token"]


def get_collection(client: httpx.Client, token: str, name: str) -> dict:
    resp = client.get(
        f"{PB_URL}/api/collections/{name}",
        headers={"Authorization": token},
    )
    resp.raise_for_status()
    return resp.json()


def main():
    with httpx.Client(timeout=30) as client:
        # 1. Auth
        print("Authenticating...")
        token = get_token(client)
        print("  ✓ Authenticated")

        # 2. Fetch current vehicles schema
        print("Fetching vehicles collection schema...")
        coll = get_collection(client, token, "vehicles")
        fields = coll.get("fields", [])

        # 3. Check if physical_vin_relation already exists
        existing_names = {f["name"] for f in fields}
        if "physical_vin_relation" in existing_names:
            print("  ✓ physical_vin_relation already exists — nothing to do.")
            sys.exit(0)

        print("  Adding physical_vin_relation field...")

        # 4. Resolve the vins collection ID (needed for the relation field)
        vins_coll = get_collection(client, token, "vins")
        vins_id = vins_coll["id"]

        # 5. Add the new field using PocketBase v0.25 flat schema format
        #    (collectionId is top-level, not nested under options)
        new_field = {
            "type": "relation",
            "name": "physical_vin_relation",
            "required": False,
            "collectionId": vins_id,
            "cascadeDelete": False,
            "maxSelect": 1,
        }
        updated_fields = fields + [new_field]

        resp = client.patch(
            f"{PB_URL}/api/collections/{coll['id']}",
            json={"fields": updated_fields},
            headers={"Authorization": token},
        )

        if resp.is_success:
            print("  ✓ physical_vin_relation field added to vehicles.")
        else:
            print(f"  ✗ Failed: {resp.status_code} — {resp.text}")
            sys.exit(1)

        print("\nMigration complete.")
        print("  Existing vehicle records have physical_vin_relation = '' (unset), which is correct.")
        print("  No backfill required.")


if __name__ == "__main__":
    main()

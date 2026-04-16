#!/usr/bin/env python3
"""
fix_managed_locations.py — Creates managed_locations and location_mappings
collections in production PocketBase if they don't already exist.

Usage:
    POCKETBASE_URL=https://... PB_ADMIN_EMAIL=... PB_ADMIN_PASS=... \
    uv run scripts/fix_managed_locations.py
"""
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx"]
# ///

import os
import sys
import httpx

PB_URL      = os.environ.get("POCKETBASE_URL", "").rstrip("/")
ADMIN_EMAIL = os.environ.get("PB_ADMIN_EMAIL", "")
ADMIN_PASS  = os.environ.get("PB_ADMIN_PASS", "")


def authenticate(client: httpx.Client) -> str:
    resp = client.post(
        f"{PB_URL}/api/collections/_superusers/auth-with-password",
        json={"identity": ADMIN_EMAIL, "password": ADMIN_PASS},
    )
    if not resp.is_success:
        print(f"❌ Auth failed: {resp.status_code} {resp.text}")
        sys.exit(1)
    print("✅ Authenticated as superuser")
    return resp.json()["token"]


def collection_exists(client: httpx.Client, token: str, name: str) -> bool:
    resp = client.get(
        f"{PB_URL}/api/collections/{name}",
        headers={"Authorization": token},
    )
    return resp.is_success


def create_managed_locations(client: httpx.Client, token: str):
    resp = client.post(
        f"{PB_URL}/api/collections",
        headers={"Authorization": token},
        json={
            "name": "managed_locations",
            "type": "base",
            "listRule":   '@request.auth.id != ""',
            "viewRule":   '@request.auth.id != ""',
            "createRule": '@request.auth.role = "admin"',
            "updateRule": '@request.auth.role = "admin"',
            "deleteRule": '@request.auth.role = "admin"',
            "fields": [
                {"name": "name", "type": "text", "required": True, "min": 1, "max": 500, "presentable": True},
            ],
            "indexes": [
                "CREATE UNIQUE INDEX idx_managed_locations_name ON managed_locations (name)",
            ],
        },
    )
    if resp.is_success:
        col_id = resp.json().get("id", "?")
        print(f"✅ Created managed_locations (id={col_id})")
        return col_id
    else:
        print(f"❌ Failed to create managed_locations: {resp.status_code}\n{resp.text}")
        sys.exit(1)


def create_location_mappings(client: httpx.Client, token: str, managed_col_id: str):
    resp = client.post(
        f"{PB_URL}/api/collections",
        headers={"Authorization": token},
        json={
            "name": "location_mappings",
            "type": "base",
            "listRule":   '@request.auth.role = "admin"',
            "viewRule":   '@request.auth.role = "admin"',
            "createRule": '@request.auth.role = "admin"',
            "updateRule": '@request.auth.role = "admin"',
            "deleteRule": '@request.auth.role = "admin"',
            "fields": [
                {"name": "raw_value",         "type": "text",     "required": True, "min": 1, "max": 500, "presentable": True},
                {"name": "managed_location",  "type": "relation", "required": True, "collectionId": managed_col_id, "maxSelect": 1},
            ],
            "indexes": [
                "CREATE UNIQUE INDEX idx_location_mappings_raw ON location_mappings (raw_value)",
            ],
        },
    )
    if resp.is_success:
        print(f"✅ Created location_mappings (id={resp.json().get('id', '?')})")
    else:
        print(f"❌ Failed to create location_mappings: {resp.status_code}\n{resp.text}")
        sys.exit(1)


def main():
    if not PB_URL or not ADMIN_EMAIL or not ADMIN_PASS:
        print("❌ Set POCKETBASE_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASS env vars")
        sys.exit(1)

    print(f"\n🔧  Creating location management collections on {PB_URL}\n")

    with httpx.Client(timeout=30) as client:
        token = authenticate(client)

        # managed_locations
        if collection_exists(client, token, "managed_locations"):
            print("ℹ️  managed_locations already exists — skipping")
            # fetch its id for the relation
            resp = client.get(f"{PB_URL}/api/collections/managed_locations", headers={"Authorization": token})
            managed_col_id = resp.json()["id"]
        else:
            managed_col_id = create_managed_locations(client, token)

        # location_mappings
        if collection_exists(client, token, "location_mappings"):
            print("ℹ️  location_mappings already exists — skipping")
        else:
            create_location_mappings(client, token, managed_col_id)

        print("\n🎉 Done!")


if __name__ == "__main__":
    main()

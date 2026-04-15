#!/usr/bin/env python3
"""
fix_location_stats.py — Creates the location_stats view collection in production
PocketBase if it doesn't already exist.

Usage:
    uv run scripts/fix_location_stats.py

Environment variables (or pass via CLI):
    POCKETBASE_URL   e.g. https://your-pb.example.com
    PB_ADMIN_EMAIL
    PB_ADMIN_PASS
"""
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx"]
# ///

import os
import sys
import httpx

PB_URL        = os.environ.get("POCKETBASE_URL", "").rstrip("/")
ADMIN_EMAIL   = os.environ.get("PB_ADMIN_EMAIL", "")
ADMIN_PASS    = os.environ.get("PB_ADMIN_PASS", "")

COLLECTION_ID   = "pbc_2629429820"       # same id as local dev — keeps migrations in sync
COLLECTION_NAME = "location_stats"

VIEW_QUERY = (
    "SELECT (ROW_NUMBER() OVER()) as id, location, COUNT(*) as sighting_count "
    "FROM sightings WHERE location != '' GROUP BY location"
)

COLLECTION_PAYLOAD = {
    "name":        COLLECTION_NAME,
    "type":        "view",
    "system":      False,
    "listRule":    '@request.auth.role = "admin"',
    "viewRule":    '@request.auth.role = "admin"',
    "createRule":  None,
    "updateRule":  None,
    "deleteRule":  None,
    "viewQuery":   VIEW_QUERY,
    "fields": [
        {
            "name":                "location",
            "type":                "text",
            "required":            False,
            "max":                 500,
        },
        {
            "name":        "sighting_count",
            "type":        "number",
            "required":    False,
        },
    ],
    "indexes": [],
}


def authenticate(client: httpx.Client) -> str:
    resp = client.post(
        f"{PB_URL}/api/collections/_superusers/auth-with-password",
        json={"identity": ADMIN_EMAIL, "password": ADMIN_PASS},
    )
    if not resp.is_success:
        print(f"❌ Auth failed: {resp.status_code} {resp.text}")
        sys.exit(1)
    token = resp.json()["token"]
    print(f"✅ Authenticated as superuser")
    return token


def collection_exists(client: httpx.Client, token: str) -> bool:
    resp = client.get(
        f"{PB_URL}/api/collections/{COLLECTION_NAME}",
        headers={"Authorization": token},
    )
    return resp.is_success


def create_collection(client: httpx.Client, token: str):
    resp = client.post(
        f"{PB_URL}/api/collections",
        headers={"Authorization": token},
        json=COLLECTION_PAYLOAD,
    )
    if resp.is_success:
        print(f"✅ Created collection '{COLLECTION_NAME}' (id={COLLECTION_ID})")
    else:
        print(f"❌ Failed to create collection: {resp.status_code}")
        print(resp.text)
        sys.exit(1)


def update_rules(client: httpx.Client, token: str):
    """If collection already exists, just make sure the rules are correct (= not ?=)."""
    resp = client.patch(
        f"{PB_URL}/api/collections/{COLLECTION_NAME}",
        headers={"Authorization": token},
        json={
            "listRule": '@request.auth.role = "admin"',
            "viewRule": '@request.auth.role = "admin"',
        },
    )
    if resp.is_success:
        print(f"✅ Updated access rules on '{COLLECTION_NAME}'")
    else:
        print(f"❌ Failed to update rules: {resp.status_code} {resp.text}")
        sys.exit(1)


def verify(client: httpx.Client, token: str):
    resp = client.get(
        f"{PB_URL}/api/collections/{COLLECTION_NAME}/records?perPage=5",
        headers={"Authorization": token},
    )
    if resp.is_success:
        data = resp.json()
        total = data.get("totalItems", "?")
        print(f"✅ Verified — location_stats has {total} rows")
        for item in data.get("items", [])[:5]:
            print(f"   {item.get('location'):<50} {item.get('sighting_count')} sightings")
    else:
        print(f"⚠️  Verify failed: {resp.status_code} {resp.text}")


def main():
    if not PB_URL or not ADMIN_EMAIL or not ADMIN_PASS:
        print("❌ Set POCKETBASE_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASS environment variables")
        sys.exit(1)

    print(f"\n🔧  Fixing location_stats on {PB_URL}\n")

    with httpx.Client(timeout=30) as client:
        token = authenticate(client)

        if collection_exists(client, token):
            print(f"ℹ️  Collection '{COLLECTION_NAME}' already exists — updating rules only")
            update_rules(client, token)
        else:
            print(f"ℹ️  Collection '{COLLECTION_NAME}' not found — creating it")
            create_collection(client, token)

        print()
        verify(client, token)


if __name__ == "__main__":
    main()

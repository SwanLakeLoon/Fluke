#!/usr/bin/env python3
"""
3-Tier Schema Setup: vins → vehicles → sightings

Creates (or recreates) the normalized 3-tier schema:
  - vins:       unique VIN records with title_issues
  - vehicles:   plates linked to a vin via relation
  - sightings:  individual sighting events linked to a vehicle

Also creates the aggregation views:
  - plate_stats
  - enhanced_plate_stats
  - enhanced_vin_stats

Usage:
    POCKETBASE_URL=http://127.0.0.1:8090 \
    PB_ADMIN_EMAIL=admin@local.dev \
    PB_ADMIN_PASS=admin123456 \
    uv run scripts/setup_3tier_schema.py
"""
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx"]
# ///

import os
import httpx

PB_URL = os.environ.get("POCKETBASE_URL", "http://127.0.0.1:8090")
ADMIN_EMAIL = os.environ.get("PB_ADMIN_EMAIL", "admin@local.dev")
ADMIN_PASS = os.environ.get("PB_ADMIN_PASS", "admin123456")

# Collections to delete in dependency order (views first, then base tables)
COLLECTIONS_TO_DROP = [
    "enhanced_vin_stats",
    "enhanced_plate_stats",
    "plate_stats",
    "sightings",
    "vehicles",
    "vins",
]


def api(client, path, method="GET", json_data=None, token=None):
    headers = {"Authorization": token} if token else {}
    resp = client.request(method, f"{PB_URL}{path}", json=json_data, headers=headers)
    try:
        data = resp.json()
    except Exception:
        data = resp.text
    if not resp.is_success:
        raise Exception(f"{method} {path} → {resp.status_code}: {data}")
    return data


def collection_exists(client, token, name):
    try:
        api(client, f"/api/collections/{name}", token=token)
        return True
    except Exception:
        return False


def drop_collection(client, token, name):
    if not collection_exists(client, token, name):
        return
    try:
        col = api(client, f"/api/collections/{name}", token=token)
        api(client, f"/api/collections/{col['id']}", "DELETE", token=token)
        print(f"  🗑  Dropped {name}")
    except Exception as e:
        print(f"  ⚠️  Could not drop {name}: {e}")


def main():
    with httpx.Client(timeout=30) as client:
        # Authenticate
        auth = api(client, "/api/collections/_superusers/auth-with-password", "POST",
                   {"identity": ADMIN_EMAIL, "password": ADMIN_PASS})
        token = auth["token"]
        print("✅ Authenticated as superuser\n")

        # ── Drop existing collections ──────────────────────────────────────
        print("Dropping old collections...")
        for name in COLLECTIONS_TO_DROP:
            drop_collection(client, token, name)
        print()

        # ── 1. vins ────────────────────────────────────────────────────────
        api(client, "/api/collections", "POST", {
            "id": "pbc_vins00000001",
            "name": "vins",
            "type": "base",
            "listRule": "@request.auth.id != \"\"",
            "viewRule": "@request.auth.id != \"\"",
            "createRule": "@request.auth.id != \"\"",
            "updateRule": "@request.auth.id != \"\"",
            "deleteRule": None,
            "indexes": [
                "CREATE UNIQUE INDEX idx_vins_vin ON vins (vin)"
            ],
            "fields": [
                {"id": "textvin000vin",     "name": "vin",          "type": "text",  "required": True,  "max": 25, "min": 0, "presentable": True},
                {"id": "textvin000title",   "name": "title_issues", "type": "text",  "required": False},
            ],
        }, token)
        print("✅ Created vins collection")

        # ── 2. vehicles ───────────────────────────────────────────────────
        api(client, "/api/collections", "POST", {
            "id": "pbc_vehicles0001",
            "name": "vehicles",
            "type": "base",
            "listRule": "@request.auth.id != \"\"",
            "viewRule": "@request.auth.id != \"\"",
            "createRule": "@request.auth.id != \"\"",
            "updateRule": "@request.auth.id != \"\"",
            "deleteRule": None,
            "indexes": [
                "CREATE UNIQUE INDEX idx_vehicles_plate ON vehicles (plate)"
            ],
            "fields": [
                {"id": "textvehicleplate",  "name": "plate",         "type": "text",     "required": True,  "max": 20, "min": 0, "presentable": True},
                {"id": "textvehiclestate",  "name": "state",         "type": "text",     "required": False, "max": 2,  "min": 0},
                {"id": "textvehiclemake",   "name": "make",          "type": "text",     "required": False, "max": 50, "min": 0},
                {"id": "textvehiclemodel",  "name": "model",         "type": "text",     "required": False, "max": 50, "min": 0},
                {"id": "textvehiclecolor",  "name": "color",         "type": "text",     "required": False, "max": 10, "min": 0},
                {"id": "textvehiclereg",    "name": "registration",  "type": "text",     "required": False},
                {
                    "id": "relvehiclevin",  "name": "vin_relation",  "type": "relation",
                    "required": False, "collectionId": "pbc_vins00000001",
                    "cascadeDelete": False, "maxSelect": 1, "minSelect": 0,
                },
                {"id": "boolvehiclesearch", "name": "searchable",    "type": "bool",     "required": False},
            ],
        }, token)
        print("✅ Created vehicles collection")

        # ── 3. sightings ──────────────────────────────────────────────────
        api(client, "/api/collections", "POST", {
            "id": "pbc_sightings001",
            "name": "sightings",
            "type": "base",
            "listRule": "@request.auth.id != \"\"",
            "viewRule": "@request.auth.id != \"\"",
            "createRule": "@request.auth.id != \"\"",
            "updateRule": "@request.auth.id != \"\"",
            "deleteRule": None,
            "indexes": [
                "CREATE INDEX idx_sightings_vehicle ON sightings (vehicle)"
            ],
            "fields": [
                {
                    "id": "relsightingveh", "name": "vehicle", "type": "relation",
                    "required": True, "collectionId": "pbc_vehicles0001",
                    "cascadeDelete": True, "maxSelect": 1, "minSelect": 0,
                },
                {"id": "textsightingloc",   "name": "location",         "type": "text",   "required": False},
                {"id": "datesightingdate",  "name": "date",             "type": "date",   "required": False},
                {"id": "textsightingice",   "name": "ice",              "type": "text",   "required": False, "max": 5, "min": 0},
                {"id": "textsightingmatch", "name": "match_status",     "type": "text",   "required": False, "max": 5, "min": 0},
                {"id": "numsightingconf",   "name": "plate_confidence", "type": "number", "required": False},
                {"id": "textsightingnotes", "name": "notes",            "type": "text",   "required": False},
            ],
        }, token)
        print("✅ Created sightings collection")

        # ── 4. plate_stats view ────────────────────────────────────────────
        api(client, "/api/collections", "POST", {
            "id": "pbcplatestats00",
            "name": "plate_stats",
            "type": "view",
            "listRule": "@request.auth.id != \"\"",
            "viewRule": "@request.auth.id != \"\"",
            "viewQuery": (
                "SELECT v.id as id, v.plate as plate, "
                "COUNT(s.id) as sighting_count, MAX(s.date) as latest_sighting "
                "FROM vehicles v LEFT JOIN sightings s ON s.vehicle = v.id "
                "GROUP BY v.id"
            ),
        }, token)
        print("✅ Created plate_stats view")

        # ── 5. enhanced_plate_stats view ──────────────────────────────────
        api(client, "/api/collections", "POST", {
            "id": "pbcplatestatsen",
            "name": "enhanced_plate_stats",
            "type": "view",
            "listRule": "@request.auth.id != \"\"",
            "viewRule": "@request.auth.id != \"\"",
            "viewQuery": (
                "SELECT v.id as id, v.plate as plate, "
                "COUNT(s.id) as sighting_count, MAX(s.date) as latest_sighting, "
                "MAX(v.state) as state_list, GROUP_CONCAT(s.ice) as ice_list, "
                "MAX(vi.vin) as vin_list, GROUP_CONCAT(s.location) as location_list, "
                "GROUP_CONCAT(s.match_status) as match_status_list, MAX(v.searchable) as searchable "
                "FROM vehicles v "
                "LEFT JOIN sightings s ON s.vehicle = v.id "
                "LEFT JOIN vins vi ON v.vin_relation = vi.id "
                "GROUP BY v.id"
            ),
        }, token)
        print("✅ Created enhanced_plate_stats view")

        # ── 6. enhanced_vin_stats view ────────────────────────────────────
        api(client, "/api/collections", "POST", {
            "id": "pbcvinstats0001",
            "name": "enhanced_vin_stats",
            "type": "view",
            "listRule": "@request.auth.id != \"\"",
            "viewRule": "@request.auth.id != \"\"",
            "viewQuery": (
                "SELECT vi.id as id, vi.vin as vin, vi.title_issues as title_issues, "
                "COUNT(DISTINCT v.id) as vehicle_count, "
                "GROUP_CONCAT(DISTINCT v.plate) as plates, "
                "COUNT(s.id) as total_sightings, "
                "MAX(s.date) as latest_sighting "
                "FROM vins vi "
                "LEFT JOIN vehicles v ON v.vin_relation = vi.id "
                "LEFT JOIN sightings s ON s.vehicle = v.id "
                "GROUP BY vi.id"
            ),
        }, token)
        print("✅ Created enhanced_vin_stats view")

        # ── 7. API rules ──────────────────────────────────────────────────
        print("\n🔧 Applying API rules...")
        for col_name in ["vins", "vehicles", "sightings"]:
            try:
                col = api(client, f"/api/collections/{col_name}", token=token)
                col_id = col["id"]
                api(client, f"/api/collections/{col_id}", "PATCH", {
                    "createRule": "@request.auth.id != \"\"",
                    "updateRule": "@request.auth.id != \"\"",
                    "listRule":   "@request.auth.id != \"\"",
                    "viewRule":   "@request.auth.id != \"\"",
                }, token)
                print(f"  ✅ {col_name} rules updated")
            except Exception as e:
                print(f"  ⚠️  Could not update {col_name} rules: {e}")

        print("\n🎉 Done! 3-tier schema (vins → vehicles → sightings) is ready.")


if __name__ == "__main__":
    main()

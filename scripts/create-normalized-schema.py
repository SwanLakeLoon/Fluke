#!/usr/bin/env python3
"""
Production Schema: Create vehicles + sightings collections.

Run this against any PocketBase instance that does NOT yet have the
normalized collections (vehicles, sightings). Safe to run multiple times —
skips any collection that already exists.

Usage:
    POCKETBASE_URL=https://your-pod.pikapods.net \
    PB_ADMIN_EMAIL=your@email.com \
    PB_ADMIN_PASS=yourpassword \
    uv run scripts/create-normalized-schema.py
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


def main():
    with httpx.Client(timeout=30) as client:
        # Authenticate
        auth = api(client, "/api/collections/_superusers/auth-with-password", "POST",
                   {"identity": ADMIN_EMAIL, "password": ADMIN_PASS})
        token = auth["token"]
        print(f"✅ Authenticated as superuser")

        # ── 1. vehicles ───────────────────────────────────────────────────
        if collection_exists(client, token, "vehicles"):
            print("⏭  vehicles collection already exists — skipping")
        else:
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
                    {"id": "textvehicleplate", "name": "plate",         "type": "text",   "required": True,  "max": 20,  "min": 0, "presentable": True},
                    {"id": "textvehiclestate", "name": "state",         "type": "text",   "required": False, "max": 2,   "min": 0},
                    {"id": "textvehiclemake",  "name": "make",          "type": "text",   "required": False, "max": 50,  "min": 0},
                    {"id": "textvehiclemodel", "name": "model",         "type": "text",   "required": False, "max": 50,  "min": 0},
                    {"id": "textvehiclecolor", "name": "color",         "type": "text",   "required": False, "max": 10,  "min": 0},
                    {"id": "textvehiclereg",   "name": "registration",  "type": "text",   "required": False},
                    {"id": "textvehiclevin",   "name": "vin",           "type": "text",   "required": False},
                    {"id": "textvehicletitle", "name": "title_issues",  "type": "text",   "required": False},
                    {"id": "boolvehiclesearch","name": "searchable",    "type": "bool",   "required": False},
                ],
            }, token)
            print("✅ Created vehicles collection")

        # ── 2. sightings ──────────────────────────────────────────────────
        if collection_exists(client, token, "sightings"):
            print("⏭  sightings collection already exists — skipping")
        else:
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
                    {"id": "textsightingloc",   "name": "location",        "type": "text",   "required": False},
                    {"id": "datesightingdate",  "name": "date",            "type": "date",   "required": False},
                    {"id": "textsightingice",   "name": "ice",             "type": "text",   "required": False, "max": 5, "min": 0},
                    {"id": "textsightingmatch", "name": "match_status",    "type": "text",   "required": False, "max": 5, "min": 0},
                    {"id": "numsightingconf",   "name": "plate_confidence","type": "number", "required": False},
                    {"id": "textsightingnotes", "name": "notes",           "type": "text",   "required": False},
                ],
            }, token)
            print("✅ Created sightings collection")

        # ── 3. plate_stats view ────────────────────────────────────────────
        if collection_exists(client, token, "plate_stats"):
            print("⏭  plate_stats view already exists — skipping")
        else:
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

        # ── 4. enhanced_plate_stats view ──────────────────────────────────
        if collection_exists(client, token, "enhanced_plate_stats"):
            print("⏭  enhanced_plate_stats view already exists — skipping")
        else:
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
                    "MAX(v.vin) as vin_list, GROUP_CONCAT(s.location) as location_list, "
                    "GROUP_CONCAT(s.match_status) as match_status_list, MAX(v.searchable) as searchable "
                    "FROM vehicles v LEFT JOIN sightings s ON s.vehicle = v.id "
                    "GROUP BY v.id"
                ),
            }, token)
            print("✅ Created enhanced_plate_stats view")

        # ── 5. ice_change_log ─────────────────────────────────────────────
        if collection_exists(client, token, "ice_change_log"):
            print("⏭  ice_change_log collection already exists — skipping")
        else:
            api(client, "/api/collections", "POST", {
                "id": "pbcicechangelog",
                "name": "ice_change_log",
                "type": "base",
                "listRule": "@request.auth.id != \"\"",
                "viewRule":  "@request.auth.id != \"\"",
                "createRule": None,
                "updateRule": None,
                "deleteRule": None,
                "fields": [
                    {"id": "texticclplate",    "name": "plate",             "type": "text",   "required": True,  "max": 10,  "min": 0, "presentable": True},
                    {"id": "texticcloldice",   "name": "old_ice",           "type": "text",   "required": False, "max": 5,   "min": 0},
                    {"id": "texticclnewice",   "name": "new_ice",           "type": "text",   "required": False, "max": 5,   "min": 0},
                    {"id": "numicclvehupd",    "name": "vehicles_updated",  "type": "number", "required": False},
                    {"id": "numicclsighupd",   "name": "sightings_updated", "type": "number", "required": False},
                    {"id": "dateicclrundate",  "name": "run_date",          "type": "date",   "required": False},
                    {"id": "boolicclack",      "name": "acknowledged",      "type": "bool",   "required": False},
                ],
            }, token)
            print("✅ Created ice_change_log collection")

        # ── 6. API rules (vehicles + sightings) ───────────────────────────
        print("\n🔧 Applying API rules for vehicles and sightings...")
        for col_name in ["vehicles", "sightings"]:
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

        print("\n🎉 Done! Run fix-api-rules.py next to apply rules to other collections.")


if __name__ == "__main__":
    main()

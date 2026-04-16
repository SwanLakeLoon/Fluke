#!/usr/bin/env python3
"""
PocketBase Schema Setup Script for Fluke

This script initializes the complete 3-tier database schema
and applies the required security and access API rules 
to a fresh or partially-configured PocketBase instance.

It handles:
- users (role schema patching)
- vins (unique VIN data)
- vehicles (plates and vehicle stats mapped to vins)
- sightings (sighting occurrences mapped to vehicles)
- duplicate_queue, upload_batches, ice_change_log
- SQLite aggregation views (enhanced_plate_stats, enhanced_vin_stats)

Usage: uv run scripts/setup-schema.py
"""
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx"]
# ///

import os
import sys
import httpx

PB_URL = os.environ.get("POCKETBASE_URL", "http://127.0.0.1:8090")
ADMIN_EMAIL = os.environ.get("PB_ADMIN_EMAIL", "admin@local.dev")
ADMIN_PASS = os.environ.get("PB_ADMIN_PASS", "admin123456")

ADMIN_RULE = '(@request.auth.id != "" && searchable = true) || @request.auth.role ?= "admin"'
APPROVER_RULE = '@request.auth.role ?= "admin" || @request.auth.role ?= "approver"'


def api(client: httpx.Client, path: str, method: str = "GET", json_data=None, token: str | None = None):
    headers = {"Authorization": token} if token else {}
    resp = client.request(method, f"{PB_URL}{path}", json=json_data, headers=headers)
    try:
        data = resp.json()
    except Exception:
        data = resp.text
    if not resp.is_success:
        print(f"❌ {method} {path} → {resp.status_code}: {data}", file=sys.stderr)
        raise RuntimeError(f"API error: {resp.status_code}")
    return data

def make_collection(client, token, names_list, name, payload):
    if name in names_list:
        print(f"⏭️  {name} already exists")
    else:
        print(f"📦 Creating {name}...")
        api(client, "/api/collections", "POST", payload, token=token)
        print(f"✅ {name} created")

def update_collection(client, token, col_id, payload):
    api(client, f"/api/collections/{col_id}", "PATCH", payload, token=token)

def main():
    print(f"\n🔌 Connecting to PocketBase at {PB_URL}...\n")

    with httpx.Client(timeout=30) as c:
        auth = api(c, "/api/collections/_superusers/auth-with-password", "POST", {
            "identity": ADMIN_EMAIL, "password": ADMIN_PASS,
        })
        token = auth["token"]
        print("✅ Authenticated as superuser\n")

        existing = api(c, "/api/collections?perPage=200", "GET", token=token)
        items = existing if isinstance(existing, list) else existing.get("items", [])
        names = [col["name"] for col in items]

        # 1. users
        users_col = next((col for col in items if col["name"] == "users"), None)
        if users_col:
            fields = users_col.get("fields", users_col.get("schema", []))
            role_field = next((f for f in fields if f["name"] == "role"), None)
            needed = {"user", "uploader", "approver", "admin"}
            if role_field:
                if needed.issubset(set(role_field.get("values", []))):
                    print("⏭️  users.role has required fields")
                else:
                    role_field["values"] = list(needed)
                    update_collection(c, token, users_col["id"], {"fields": fields})
                    print("✅ users.role updated with all roles")
            else:
                fields.append({"name": "role", "type": "select", "values": list(needed), "maxSelect": 1})
                update_collection(c, token, users_col["id"], {"fields": fields})
                print("✅ users.role added")

        # 2. duplicate_queue
        make_collection(c, token, names, "duplicate_queue", {
            "name": "duplicate_queue", "type": "base",
            "fields": [
                {"name": "raw_data", "type": "json"},
                {"name": "reason", "type": "text"},
                {"name": "status", "type": "select", "values": ["pending", "approved", "rejected"], "maxSelect": 1},
                {"name": "import_batch", "type": "text"},
                {"name": "existing_record_id", "type": "text"},
            ],
        })

        # 3. upload_batches
        make_collection(c, token, names, "upload_batches", {
            "name": "upload_batches", "type": "base",
            "fields": [
                {"name": "uploaded_by", "type": "relation", "required": True, "collectionId": users_col["id"] if users_col else "", "maxSelect": 1},
                {"name": "filename", "type": "text", "required": True},
                {"name": "row_count", "type": "number"},
                {"name": "rows", "type": "json"},
                {"name": "status", "type": "select", "values": ["pending", "approved", "rejected"], "maxSelect": 1},
            ],
        })

        # 4. vins
        make_collection(c, token, names, "vins", {
            "id": "pbc_vins00000001", "name": "vins", "type": "base",
            "indexes": ["CREATE UNIQUE INDEX idx_vins_vin ON vins (vin)"],
            "fields": [
                {"name": "vin", "type": "text", "required": True, "max": 25, "presentable": True},
                {"name": "title_issues", "type": "text"},
            ],
        })

        # 5. vehicles
        make_collection(c, token, names, "vehicles", {
            "id": "pbc_vehicles0001", "name": "vehicles", "type": "base",
            "indexes": ["CREATE UNIQUE INDEX idx_vehicles_plate ON vehicles (plate)"],
            "fields": [
                {"name": "plate", "type": "text", "required": True, "max": 20, "presentable": True},
                {"name": "state", "type": "text", "max": 2},
                {"name": "make", "type": "text", "max": 50},
                {"name": "model", "type": "text", "max": 50},
                {"name": "color", "type": "text", "max": 10},
                {"name": "registration", "type": "text"},
                {"name": "vin_relation", "type": "relation", "collectionId": "pbc_vins00000001", "maxSelect": 1},
                {"name": "physical_vin_relation", "type": "relation", "collectionId": "pbc_vins00000001", "maxSelect": 1},
                {"name": "searchable", "type": "bool"},
            ],
        })

        # 6. sightings
        make_collection(c, token, names, "sightings", {
            "id": "pbc_sightings001", "name": "sightings", "type": "base",
            "indexes": ["CREATE INDEX idx_sightings_vehicle ON sightings (vehicle)"],
            "fields": [
                {"name": "vehicle", "type": "relation", "required": True, "collectionId": "pbc_vehicles0001", "cascadeDelete": True, "maxSelect": 1},
                {"name": "location", "type": "text"},
                {"name": "date", "type": "date"},
                {"name": "ice", "type": "text", "max": 5},
                {"name": "match_status", "type": "text", "max": 5},
                {"name": "plate_confidence", "type": "number"},
                {"name": "notes", "type": "text"},
            ],
        })

        # 7. ice_change_log
        make_collection(c, token, names, "ice_change_log", {
            "id": "pbcicechangelog", "name": "ice_change_log", "type": "base",
            "fields": [
                {"name": "plate", "type": "text", "required": True, "max": 10},
                {"name": "old_ice", "type": "text", "max": 5},
                {"name": "new_ice", "type": "text", "max": 5},
                {"name": "vehicles_updated", "type": "number"},
                {"name": "sightings_updated", "type": "number"},
                {"name": "run_date", "type": "date"},
                {"name": "acknowledged", "type": "bool"},
            ],
        })

        # 8. enhanced_plate_stats (plate_stats was removed — this is the canonical plate view)
        make_collection(c, token, names, "enhanced_plate_stats", {
            "id": "pbcplatestatsen", "name": "enhanced_plate_stats", "type": "view",
            "viewQuery": "SELECT v.id as id, v.plate as plate, COUNT(s.id) as sighting_count, MAX(s.date) as latest_sighting, MAX(s.created) as latest_upload, MAX(v.state) as state_list, GROUP_CONCAT(s.ice) as ice_list, MAX(vi.vin) as vin_list, MAX(pvi.vin) as physical_vin_list, GROUP_CONCAT(s.location) as location_list, GROUP_CONCAT(s.match_status) as match_status_list, MAX(v.searchable) as searchable, MAX(v.physical_vin_relation) as physical_vin_relation FROM vehicles v LEFT JOIN sightings s ON s.vehicle = v.id LEFT JOIN vins vi ON v.vin_relation = vi.id LEFT JOIN vins pvi ON v.physical_vin_relation = pvi.id GROUP BY v.id",
        })

        # 10. enhanced_vin_stats
        make_collection(c, token, names, "enhanced_vin_stats", {
            "id": "pbcvinstatsenh", "name": "enhanced_vin_stats", "type": "view",
            "viewQuery": "SELECT vi.id as id, vi.vin as vin, vi.title_issues as title_issues, COUNT(s.id) as sighting_count, MAX(s.date) as latest_sighting, MAX(s.created) as latest_upload, GROUP_CONCAT(DISTINCT v.plate) as plate_list, MAX(v.searchable) as searchable, MAX(CASE WHEN v.physical_vin_relation = vi.id THEN 1 ELSE 0 END) as is_physical_vin FROM vins vi LEFT JOIN vehicles v ON v.vin_relation = vi.id OR v.physical_vin_relation = vi.id LEFT JOIN sightings s ON s.vehicle = v.id GROUP BY vi.id",
        })

        # 11. location_aliases
        make_collection(c, token, names, "location_aliases", {
            "name": "location_aliases", "type": "base",
            "indexes": ["CREATE UNIQUE INDEX idx_location_aliases_location ON location_aliases (location)"],
            "fields": [
                {"name": "location", "type": "text", "required": True, "presentable": True},
                {"name": "alias", "type": "select", "required": True, "values": ["Known ICE HOTEL", "Known ICE Business Suite"], "maxSelect": 1},
            ],
        })

        # 12. location_stats
        make_collection(c, token, names, "location_stats", {
            "name": "location_stats", "type": "view",
            "viewQuery": "SELECT (ROW_NUMBER() OVER()) as id, location, COUNT(*) as sighting_count FROM sightings WHERE location != '' GROUP BY location",
            # Fields are required by PocketBase for view collections — omitting causes validation_required error
            "fields": [
                {"name": "location",       "type": "text",   "required": False, "max": 500},
                {"name": "sighting_count", "type": "number", "required": False},
            ],
        })

        # 13. managed_locations — admin-curated canonical location names
        make_collection(c, token, names, "managed_locations", {
            "id": "pbc_managed_locs", "name": "managed_locations", "type": "base",
            "indexes": ["CREATE UNIQUE INDEX idx_managed_locations_name ON managed_locations (name)"],
            "fields": [
                {"name": "name", "type": "text", "required": True, "min": 1, "max": 500, "presentable": True},
            ],
        })

        # 14. location_mappings — maps raw DB strings to canonical managed locations
        make_collection(c, token, names, "location_mappings", {
            "id": "pbc_loc_mappings", "name": "location_mappings", "type": "base",
            "indexes": ["CREATE UNIQUE INDEX idx_location_mappings_raw ON location_mappings (raw_value)"],
            "fields": [
                {"name": "raw_value",        "type": "text",     "required": True, "min": 1, "max": 500, "presentable": True},
                {"name": "managed_location", "type": "relation", "required": True, "collectionId": "pbc_managed_locs", "maxSelect": 1},
            ],
        })

        print("\n🔧 Applying API access rules...")
        
        # Fresh collection snapshot for rule mapping
        cols = api(c, "/api/collections?perPage=200", "GET", token=token)
        items = cols if isinstance(cols, list) else cols.get("items", [])
        
        def safe_patch(colName, rulePayload):
            colObj = next((f for f in items if f["name"] == colName), None)
            if colObj:
                api(c, f"/api/collections/{colObj['id']}", "PATCH", rulePayload, token=token)
                print(f"  ✅ {colName} rules updated")

        for c_name in ["vins", "vehicles", "sightings", "enhanced_plate_stats", "enhanced_vin_stats"]:
            if c_name in ["vehicles", "enhanced_plate_stats", "enhanced_vin_stats"]:
                list_view = '(@request.auth.id != "" && searchable = true) || @request.auth.role ?= "admin"'
            elif c_name == "sightings":
                list_view = '(@request.auth.id != "" && vehicle.searchable = true) || @request.auth.role ?= "admin"'
            else:
                list_view = '(@request.auth.id != "") || @request.auth.role ?= "admin"'
                
            is_view = c_name in ["enhanced_plate_stats", "enhanced_vin_stats"]
            cu_rule = None if is_view else '@request.auth.role ?= "admin" || @request.auth.role ?= "approver"'
            
            safe_patch(c_name, {
                "listRule": list_view, "viewRule": list_view, 
                "createRule": cu_rule, "updateRule": cu_rule,
                "deleteRule": '@request.auth.role ?= "admin"' if not is_view and c_name != "vins" else None
            })

        safe_patch("ice_change_log", {
            "listRule": '@request.auth.id != ""', "viewRule": '@request.auth.id != ""',
            "updateRule": '@request.auth.id != ""',  # Anyone can ack
            "createRule": None, "deleteRule": None
        })
        
        dup_rule = '@request.auth.role ?= "admin" || @request.auth.role ?= "approver"'
        safe_patch("duplicate_queue", {
            "listRule": dup_rule, "viewRule": dup_rule, "createRule": dup_rule, "updateRule": dup_rule,
            "deleteRule": '@request.auth.role ?= "admin"'
        })

        safe_patch("upload_batches", {
            "listRule": 'uploaded_by = @request.auth.id || @request.auth.role ?= "approver" || @request.auth.role ?= "admin"',
            "viewRule": 'uploaded_by = @request.auth.id || @request.auth.role ?= "approver" || @request.auth.role ?= "admin"',
            "createRule": '@request.auth.role ?= "uploader" || @request.auth.role ?= "approver" || @request.auth.role ?= "admin"',
            "updateRule": '@request.auth.role ?= "approver" || @request.auth.role ?= "admin"',
            "deleteRule": '@request.auth.role ?= "admin"'
        })

        # role is a 'select' field — must use ?= operator (= silently fails for select fields)
        admin_only_rule = '@request.auth.role ?= "admin"'
        safe_patch("location_aliases", {
            "listRule": '@request.auth.id != ""',   # Any authed user can READ (required for redaction to work)
            "viewRule": '@request.auth.id != ""',
            "createRule": admin_only_rule,
            "updateRule": admin_only_rule,
            "deleteRule": admin_only_rule
        })

        safe_patch("location_stats", {
            "listRule": admin_only_rule, "viewRule": admin_only_rule
        })

        safe_patch("managed_locations", {
            "listRule": '@request.auth.id != ""',
            "viewRule": '@request.auth.id != ""',
            "createRule": admin_only_rule,
            "updateRule": admin_only_rule,
            "deleteRule": admin_only_rule
        })

        safe_patch("location_mappings", {
            "listRule": admin_only_rule, "viewRule": admin_only_rule,
            "createRule": admin_only_rule, "updateRule": admin_only_rule,
            "deleteRule": admin_only_rule
        })

        if users_col:
            user_rule = 'id = @request.auth.id || @request.auth.role ?= "admin"'
            opts = users_col.get("options", {})
            opts["manageRule"] = '@request.auth.role ?= "admin"'
            safe_patch("users", {
                "listRule": user_rule, "viewRule": user_rule, "updateRule": user_rule, 
                "deleteRule": user_rule, "options": opts
            })

        print("\n🎉 Schema setup complete! Your deployment is ready.")

if __name__ == "__main__":
    main()

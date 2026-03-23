#!/usr/bin/env python3
"""
PocketBase v0.25 Schema Setup Script
Creates alpr_records, duplicate_queue, and upload_batches collections,
and adds a role field (user/uploader/approver/admin) to the users collection.

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


def main():
    print(f"\n🔌 Connecting to PocketBase at {PB_URL}...\n")

    with httpx.Client() as c:
        # 1. Auth
        auth = api(c, "/api/collections/_superusers/auth-with-password", "POST", {
            "identity": ADMIN_EMAIL, "password": ADMIN_PASS,
        })
        token = auth["token"]
        print("✅ Authenticated as superuser\n")

        # 2. Existing collections
        existing = api(c, "/api/collections?perPage=200", "GET", token=token)
        items = existing if isinstance(existing, list) else existing.get("items", [])
        names = [col["name"] for col in items]

        # 3. alpr_records
        if "alpr_records" in names:
            print("⏭️  alpr_records already exists")
        else:
            print("📦 Creating alpr_records...")
            api(c, "/api/collections", "POST", {
                "name": "alpr_records",
                "type": "base",
                "fields": [
                    {"name": "plate",            "type": "text",   "required": True, "max": 10},
                    {"name": "state",            "type": "text",   "required": True, "max": 2},
                    {"name": "make",             "type": "text",   "max": 50},
                    {"name": "model",            "type": "text",   "max": 50},
                    {"name": "color",            "type": "select", "values": ["BR", "GR", "BK", "BL", "TN", "SL", "R", "WH", "GN", "GD", "PU"], "maxSelect": 1},
                    {"name": "ice",              "type": "select", "values": ["Y", "N", "HS"], "maxSelect": 1},
                    {"name": "match_status",     "type": "select", "values": ["Y", "N"], "maxSelect": 1},
                    {"name": "registration",     "type": "text"},
                    {"name": "vin",              "type": "text"},
                    {"name": "title_issues",     "type": "text"},
                    {"name": "notes",            "type": "text"},
                    {"name": "location",         "type": "text"},
                    {"name": "date",             "type": "date"},
                    {"name": "plate_confidence", "type": "number"},
                    {"name": "searchable",       "type": "bool"},
                ],
                "listRule": '@request.auth.id != "" && searchable = true',
                "viewRule": '@request.auth.id != "" && searchable = true',
                "createRule": None,
                "updateRule": None,
                "deleteRule": None,
            }, token=token)
            print("✅ alpr_records created")

        # 4. duplicate_queue
        if "duplicate_queue" in names:
            print("⏭️  duplicate_queue already exists")
        else:
            print("📦 Creating duplicate_queue...")
            api(c, "/api/collections", "POST", {
                "name": "duplicate_queue",
                "type": "base",
                "fields": [
                    {"name": "raw_data",     "type": "json"},
                    {"name": "reason",       "type": "text"},
                    {"name": "status",       "type": "select", "values": ["pending", "approved", "rejected"], "maxSelect": 1},
                    {"name": "import_batch", "type": "text"},
                    {"name": "existing_record_id", "type": "text"},
                ],
                "listRule": None,
                "viewRule": None,
                "createRule": None,
                "updateRule": None,
                "deleteRule": None,
            }, token=token)
            print("✅ duplicate_queue created")

        # Lookup users collection (needed for upload_batches relation and role update)
        users_col = next((col for col in items if col["name"] == "users"), None)

        # 5. upload_batches
        if "upload_batches" in names:
            print("⏭️  upload_batches already exists")
        else:
            print("📦 Creating upload_batches...")
            api(c, "/api/collections", "POST", {
                "name": "upload_batches",
                "type": "base",
                "fields": [
                    {"name": "uploaded_by", "type": "relation", "required": True, "collectionId": users_col["id"] if users_col else "", "maxSelect": 1, "cascadeDelete": False},
                    {"name": "filename",    "type": "text", "required": True},
                    {"name": "row_count",   "type": "number"},
                    {"name": "rows",        "type": "json"},
                    {"name": "status",      "type": "select", "values": ["pending", "approved", "rejected"], "maxSelect": 1},
                ],
                "listRule": 'uploaded_by = @request.auth.id || @request.auth.role = "approver" || @request.auth.role = "admin"',
                "viewRule": 'uploaded_by = @request.auth.id || @request.auth.role = "approver" || @request.auth.role = "admin"',
                "createRule": '@request.auth.role = "uploader" || @request.auth.role = "approver" || @request.auth.role = "admin"',
                "updateRule": '@request.auth.role = "approver" || @request.auth.role = "admin"',
                "deleteRule": '@request.auth.role = "admin"',
            }, token=token)
            print("✅ upload_batches created")

        # 6. Add role field to users (with all four roles)
        if users_col:
            fields = users_col.get("fields", [])
            role_field = next((f for f in fields if f["name"] == "role"), None)
            if role_field:
                # Check if it already has all four values
                existing_values = set(role_field.get("values", []))
                needed = {"user", "uploader", "approver", "admin"}
                if needed.issubset(existing_values):
                    print("⏭️  users.role already has all four roles")
                else:
                    print("📦 Updating users.role to include uploader/approver...")
                    role_field["values"] = list(needed)
                    api(c, f"/api/collections/{users_col['id']}", "PATCH", {
                        "fields": fields,
                    }, token=token)
                    print("✅ users.role updated with all four roles")
            else:
                print("📦 Adding role field to users...")
                fields.append({"name": "role", "type": "select", "values": ["user", "uploader", "approver", "admin"], "maxSelect": 1})
                api(c, f"/api/collections/{users_col['id']}", "PATCH", {
                    "fields": fields,
                }, token=token)
                print("✅ users.role added")

        print("\n🎉 Schema setup complete!\n")
        print("Next steps:")
        print("  👤 Open PocketBase admin and create a test user")
        print('  👤 Set the user role to "user", "uploader", "approver", or "admin"')


if __name__ == "__main__":
    main()

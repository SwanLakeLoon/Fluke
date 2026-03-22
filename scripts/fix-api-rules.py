#!/usr/bin/env python3
"""
Fix PocketBase API rules so admin-role users can see ALL records,
while regular users only see searchable = true records.

Usage: uv run scripts/fix-api-rules.py
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


def main():
    with httpx.Client() as c:
        # Auth
        auth = c.post(f"{PB_URL}/api/collections/_superusers/auth-with-password", json={
            "identity": ADMIN_EMAIL, "password": ADMIN_PASS,
        }).json()
        token = auth["token"]
        headers = {"Authorization": token}
        print("✅ Authenticated\n")

        # Get alpr_records collection
        cols = c.get(f"{PB_URL}/api/collections", headers=headers).json()
        items = cols if isinstance(cols, list) else cols.get("items", [])
        alpr = next((col for col in items if col["name"] == "alpr_records"), None)

        if not alpr:
            print("❌ alpr_records collection not found!")
            return

        # Update rules:
        # - Regular users: only see searchable = true
        # - Admin-role users: see everything
        # - Superusers always bypass rules in PocketBase
        # But the CsvUpload and RecordManager pages use the user's auth token (not superuser),
        # so we need the rule to allow admin-role users through.
        new_list_rule = '(@request.auth.id != "" && searchable = true) || @request.auth.role = "admin"'
        new_view_rule = '(@request.auth.id != "" && searchable = true) || @request.auth.role = "admin"'
        # Admin-role users can also update records (for inline editing, searchable toggle)
        new_update_rule = '@request.auth.role = "admin"'

        resp = c.patch(f"{PB_URL}/api/collections/{alpr['id']}", json={
            "listRule": new_list_rule,
            "viewRule": new_view_rule,
            "updateRule": new_update_rule,
        }, headers=headers)

        if resp.is_success:
            print("✅ API rules updated:")
            print(f"   listRule: {new_list_rule}")
            print(f"   viewRule: {new_view_rule}")
            print(f"   updateRule: {new_update_rule}")
        else:
            print(f"❌ Failed: {resp.status_code} {resp.json()}")

        # Also update duplicate_queue so admin-role users can manage it
        dup_q = next((col for col in items if col["name"] == "duplicate_queue"), None)
        if dup_q:
            resp2 = c.patch(f"{PB_URL}/api/collections/{dup_q['id']}", json={
                "listRule": '@request.auth.role = "admin"',
                "viewRule": '@request.auth.role = "admin"',
                "createRule": '@request.auth.role = "admin"',
                "updateRule": '@request.auth.role = "admin"',
                "deleteRule": '@request.auth.role = "admin"',
            }, headers=headers)
            if resp2.is_success:
                print("✅ duplicate_queue rules updated (admin-only)")
            else:
                print(f"❌ duplicate_queue update failed: {resp2.status_code}")

        # Update alpr_records createRule so admin-role users can insert via the UI
        resp3 = c.patch(f"{PB_URL}/api/collections/{alpr['id']}", json={
            "createRule": '@request.auth.role = "admin"',
        }, headers=headers)
        if resp3.is_success:
            print("✅ alpr_records createRule updated (admin-only)")
        else:
            print(f"❌ createRule update failed: {resp3.status_code}")

        print("\n🎉 All API rules fixed!")


if __name__ == "__main__":
    main()

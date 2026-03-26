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
        cols = c.get(f"{PB_URL}/api/collections", headers=headers, params={"perPage": 200}).json()
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

        # Also update duplicate_queue so admin + approver roles can manage it
        dup_q = next((col for col in items if col["name"] == "duplicate_queue"), None)
        if dup_q:
            dup_rule = '@request.auth.role = "admin" || @request.auth.role = "approver"'
            resp2 = c.patch(f"{PB_URL}/api/collections/{dup_q['id']}", json={
                "listRule": dup_rule,
                "viewRule": dup_rule,
                "createRule": dup_rule,
                "updateRule": dup_rule,
                "deleteRule": '@request.auth.role = "admin"',
            }, headers=headers)
            if resp2.is_success:
                print("✅ duplicate_queue rules updated (admin + approver)")
            else:
                print(f"❌ duplicate_queue update failed: {resp2.status_code}")

        # Update alpr_records createRule and updateRule so approvers can also insert/update
        approver_rule = '@request.auth.role = "admin" || @request.auth.role = "approver"'
        resp3 = c.patch(f"{PB_URL}/api/collections/{alpr['id']}", json={
            "createRule": approver_rule,
            "updateRule": approver_rule,
        }, headers=headers)
        if resp3.is_success:
            print("✅ alpr_records create/update rules updated (admin + approver)")
        else:
            print(f"❌ createRule update failed: {resp3.status_code}")

        # Update vehicles and sightings create/update rules
        for c_name in ["vehicles", "sightings"]:
            c_col = next((col for col in items if col["name"] == c_name), None)
            if c_col:
                c_resp = c.patch(f"{PB_URL}/api/collections/{c_col['id']}", json={
                    "createRule": approver_rule,
                    "updateRule": approver_rule,
                    "deleteRule": '@request.auth.role = "admin"'
                }, headers=headers)
                print(f"{'✅' if c_resp.is_success else '❌'} {c_name} rules updated")

        # Fix upload_batches rules
        ub = next((col for col in items if col["name"] == "upload_batches"), None)
        if ub:
            resp_ub = c.patch(f"{PB_URL}/api/collections/{ub['id']}", json={
                "listRule": 'uploaded_by = @request.auth.id || @request.auth.role = "approver" || @request.auth.role = "admin"',
                "viewRule": 'uploaded_by = @request.auth.id || @request.auth.role = "approver" || @request.auth.role = "admin"',
                "createRule": '@request.auth.role = "uploader" || @request.auth.role = "approver" || @request.auth.role = "admin"',
                "updateRule": '@request.auth.role = "approver" || @request.auth.role = "admin"',
                "deleteRule": '@request.auth.role = "admin"',
            }, headers=headers)
            if resp_ub.is_success:
                print("✅ upload_batches rules updated")
            else:
                print(f"❌ upload_batches update failed: {resp_ub.status_code}")

        # Fix users collection so admin-role users can manage everyone
        users_col = next((col for col in items if col["name"] == "users"), None)
        if users_col:
            user_rule = 'id = @request.auth.id || @request.auth.role = "admin"'
            # Auth collections require updating options.manageRule to expose emails to admins
            opts = users_col.get("options", {})
            opts["manageRule"] = '@request.auth.role = "admin"'

            resp4 = c.patch(f"{PB_URL}/api/collections/{users_col['id']}", json={
                "listRule": user_rule,
                "viewRule": user_rule,
                "updateRule": user_rule,
                "deleteRule": user_rule,
                "options": opts
            }, headers=headers)
            if resp4.is_success:
                print("✅ users collection rules updated (admin-roles can manage all)")
            else:
                print(f"❌ users collection update failed: {resp4.status_code}")

        print("\n🎉 All API rules fixed!")


if __name__ == "__main__":
    main()

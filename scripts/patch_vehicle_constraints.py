#!/usr/bin/env python3
"""
Patch vehicle constraints on an existing production PocketBase instance.

  - plate: max 10 → max 20
  - state: required → optional

Usage:
    POCKETBASE_URL=https://your-pod.pikapods.net \\
    PB_ADMIN_EMAIL=admin@example.com \\
    PB_ADMIN_PASS=yourpassword \\
    uv run scripts/patch_vehicle_constraints.py
"""
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx"]
# ///

import os
import httpx

PB_URL      = os.environ.get("POCKETBASE_URL", "http://127.0.0.1:8090")
PB_EMAIL    = os.environ.get("PB_ADMIN_EMAIL", "admin@local.dev")
PB_PASS     = os.environ.get("PB_ADMIN_PASS", "admin123456")


def main():
    with httpx.Client(timeout=30) as client:
        # Auth
        resp = client.post(
            f"{PB_URL}/api/collections/_superusers/auth-with-password",
            json={"identity": PB_EMAIL, "password": PB_PASS},
        )
        resp.raise_for_status()
        token = resp.json()["token"]
        print("✅ Authenticated")

        # Fetch current vehicles collection schema — use name, not hardcoded ID
        resp = client.get(f"{PB_URL}/api/collections/vehicles", headers={"Authorization": token})
        resp.raise_for_status()
        col = resp.json()
        col_id = col["id"]
        print(f"📋 Found vehicles collection (id: {col_id})")

        # Patch the fields in-place
        changed = False
        for field in col.get("fields", []):
            if field["name"] == "plate" and field.get("max") != 20:
                field["max"] = 20
                changed = True
                print("  ✏️  plate.max: 10 → 20")
            if field["name"] == "state" and field.get("required"):
                field["required"] = False
                changed = True
                print("  ✏️  state.required: true → false")

        if not changed:
            print("⏭  No changes needed — constraints already match.")
            return

        # Save collection with patched fields
        resp = client.patch(
            f"{PB_URL}/api/collections/{col_id}",
            json={"fields": col["fields"]},
            headers={"Authorization": token},
        )
        resp.raise_for_status()
        print("✅ vehicles collection updated successfully")


if __name__ == "__main__":
    main()

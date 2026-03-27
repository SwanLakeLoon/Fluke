#!/usr/bin/env python3
"""
Diagnostic: print the current field constraints on the vehicles collection.

Usage:
    POCKETBASE_URL=https://your-pod.pikapods.net \\
    PB_ADMIN_EMAIL=admin@example.com \\
    PB_ADMIN_PASS=yourpassword \\
    uv run scripts/check_vehicle_schema.py
"""
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx"]
# ///

import os
import httpx

PB_URL   = os.environ.get("POCKETBASE_URL", "http://127.0.0.1:8090")
PB_EMAIL = os.environ.get("PB_ADMIN_EMAIL", "admin@local.dev")
PB_PASS  = os.environ.get("PB_ADMIN_PASS", "admin123456")

def main():
    with httpx.Client(timeout=30) as client:
        resp = client.post(
            f"{PB_URL}/api/collections/_superusers/auth-with-password",
            json={"identity": PB_EMAIL, "password": PB_PASS},
        )
        resp.raise_for_status()
        token = resp.json()["token"]

        resp = client.get(f"{PB_URL}/api/collections/vehicles", headers={"Authorization": token})
        resp.raise_for_status()
        col = resp.json()
        print(f"Collection id: {col['id']}")
        print(f"Collection name: {col['name']}\n")
        for field in col.get("fields", []):
            name = field.get("name")
            if name in ("plate", "state"):
                print(f"  {name}:")
                print(f"    required = {field.get('required')}")
                print(f"    max      = {field.get('max')}")

if __name__ == "__main__":
    main()

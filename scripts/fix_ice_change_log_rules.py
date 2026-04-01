#!/usr/bin/env python3
"""
Patch: Fix ice_change_log updateRule so that logged-in users can acknowledge alerts.

The updateRule was null, causing dismiss() to silently fail and the ICE alert
modal to reappear on every page refresh.

Usage:
    uv run scripts/fix_ice_change_log_rules.py

For production:
    POCKETBASE_URL=https://your-pod.pikapod.net \
    PB_ADMIN_EMAIL=your@email.com \
    PB_ADMIN_PASS=yourpassword \
    uv run scripts/fix_ice_change_log_rules.py
"""
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx"]
# ///

import os
import httpx
import sys

PB_URL   = os.environ.get("POCKETBASE_URL", "http://127.0.0.1:8090")
EMAIL    = os.environ.get("PB_ADMIN_EMAIL",  "admin@local.dev")
PASSWORD = os.environ.get("PB_ADMIN_PASS",   "admin123456")


def main():
    with httpx.Client(timeout=30) as client:
        print(f"Connecting to {PB_URL}...")
        resp = client.post(
            f"{PB_URL}/api/collections/_superusers/auth-with-password",
            json={"identity": EMAIL, "password": PASSWORD},
        )
        resp.raise_for_status()
        token = resp.json()["token"]
        print("  ✓ Authenticated")

        resp = client.get(f"{PB_URL}/api/collections/ice_change_log", headers={"Authorization": token})
        resp.raise_for_status()
        col = resp.json()
        col_id = col["id"]

        current_update_rule = col.get("updateRule")
        print(f"  Current updateRule: {repr(current_update_rule)}")

        target_rule = '@request.auth.id != ""'
        if current_update_rule == target_rule:
            print("  ✓ updateRule already correct — nothing to do.")
            return

        resp = client.patch(
            f"{PB_URL}/api/collections/{col_id}",
            json={
                "listRule":   '@request.auth.id != ""',
                "viewRule":   '@request.auth.id != ""',
                "updateRule": '@request.auth.id != ""',  # Any logged-in user can ack
                "createRule": None,
                "deleteRule": None,
            },
            headers={"Authorization": token},
        )
        if resp.is_success:
            print("  ✓ updateRule patched → '@request.auth.id != \"\"'")
            print("\nDone. Admins can now dismiss ICE alerts and they will stay dismissed.")
        else:
            print(f"  ✗ Failed: {resp.status_code} — {resp.text}")
            sys.exit(1)


if __name__ == "__main__":
    main()

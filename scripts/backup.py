#!/usr/bin/env python3
"""
Nightly PocketBase Backup Script

Creates a backup snapshot via the PocketBase API and downloads it locally.
Keeps the last N backups and deletes older ones.

Setup:
  1. Set env vars (or use defaults):
       POCKETBASE_URL   — your PikaPods PocketBase URL
       PB_ADMIN_EMAIL   — superuser email
       PB_ADMIN_PASS    — superuser password
       BACKUP_DIR       — local directory for backups (default: ./backups)
       BACKUP_KEEP      — number of backups to keep (default: 7)

  2. Run manually:
       uv run scripts/backup.py

  3. Or add to crontab for nightly at 2 AM:
       0 2 * * * cd /path/to/plate-database && uv run scripts/backup.py >> /var/log/pb-backup.log 2>&1
"""
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx"]
# ///

import os
import sys
import datetime
import httpx

PB_URL     = os.environ.get("POCKETBASE_URL", "http://127.0.0.1:8090")
ADMIN_EMAIL = os.environ.get("PB_ADMIN_EMAIL", "admin@local.dev")
ADMIN_PASS  = os.environ.get("PB_ADMIN_PASS",  "admin123456")
BACKUP_DIR  = os.environ.get("BACKUP_DIR",     os.path.join(os.path.dirname(__file__), "..", "backups"))
BACKUP_KEEP = int(os.environ.get("BACKUP_KEEP", "7"))


def main():
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    print(f"[{timestamp}] Starting PocketBase backup...")
    print(f"  PB URL: {PB_URL}")

    os.makedirs(BACKUP_DIR, exist_ok=True)

    with httpx.Client(timeout=120) as c:
        # 1. Authenticate as superuser
        auth_resp = c.post(f"{PB_URL}/api/collections/_superusers/auth-with-password", json={
            "identity": ADMIN_EMAIL,
            "password": ADMIN_PASS,
        })
        if not auth_resp.is_success:
            print(f"  ❌ Auth failed: {auth_resp.status_code} {auth_resp.text}")
            sys.exit(1)

        token = auth_resp.json()["token"]
        headers = {"Authorization": token}
        print("  ✅ Authenticated")

        # 2. Create a backup on the server
        backup_name = f"backup_{timestamp}.zip"
        create_resp = c.post(f"{PB_URL}/api/backups", json={
            "name": backup_name,
        }, headers=headers)

        if not create_resp.is_success:
            print(f"  ❌ Backup create failed: {create_resp.status_code} {create_resp.text}")
            sys.exit(1)

        print(f"  ✅ Backup created on server: {backup_name}")

        # 3. Download the backup (PB v0.25 requires a file token)
        token_resp = c.post(f"{PB_URL}/api/files/token", headers=headers)
        if token_resp.is_success:
            file_token = token_resp.json().get("token", "")
        else:
            file_token = ""

        download_resp = c.get(
            f"{PB_URL}/api/backups/{backup_name}",
            params={"token": file_token} if file_token else {},
            headers=headers,
            follow_redirects=True,
        )

        if not download_resp.is_success:
            print(f"  ❌ Download failed: {download_resp.status_code}")
            sys.exit(1)

        local_path = os.path.join(BACKUP_DIR, backup_name)
        with open(local_path, "wb") as f:
            f.write(download_resp.content)

        size_mb = len(download_resp.content) / (1024 * 1024)
        print(f"  ✅ Downloaded: {local_path} ({size_mb:.2f} MB)")

        # 4. Delete the backup from the server (save PikaPods disk space)
        c.delete(f"{PB_URL}/api/backups/{backup_name}", headers=headers)
        print(f"  ✅ Cleaned up server-side backup")

        # 5. Rotate old local backups — keep only the latest N
        backups = sorted([
            f for f in os.listdir(BACKUP_DIR)
            if f.startswith("backup_") and f.endswith(".zip")
        ])

        if len(backups) > BACKUP_KEEP:
            to_delete = backups[:len(backups) - BACKUP_KEEP]
            for old in to_delete:
                os.remove(os.path.join(BACKUP_DIR, old))
                print(f"  🗑️  Rotated out: {old}")

        remaining = len([f for f in os.listdir(BACKUP_DIR) if f.endswith(".zip")])
        print(f"\n  📦 {remaining} backup(s) stored in {BACKUP_DIR}")
        print(f"  ✅ Backup complete!")


if __name__ == "__main__":
    main()

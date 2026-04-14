#!/usr/bin/env python3
"""
purge_records.py — Delete all *data* records from a Fluke PocketBase instance.

Removes rows from:
  sightings → vehicles → vins
  duplicate_queue, upload_batches, ice_change_log

Schema collections (users, location_aliases …) and view collections are
NOT touched. The database structure is left intact so it can be re-populated
with a fresh CSV import.

Usage:
  # Dry-run (safe default — shows what would be deleted, touches nothing):
  uv run scripts/purge_records.py

  # Live run against local dev:
  uv run scripts/purge_records.py --confirm

  # Live run against a remote instance:
  POCKETBASE_URL=https://my-prod.example.com \\
  PB_EMAIL=admin@example.com PB_PASSWORD=supersecret \\
  uv run scripts/purge_records.py --confirm

⚠️  THIS IS IRREVERSIBLE.  Always take a backup first:
    cp -r backend/pb_data backend/pb_data.bak
"""
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx"]
# ///

import os
import sys
import time
import argparse
import httpx

# ---------------------------------------------------------------------------
# Config (override via env vars)
# ---------------------------------------------------------------------------
PB_URL      = os.environ.get("POCKETBASE_URL", "http://127.0.0.1:8090")
PB_EMAIL    = os.environ.get("PB_EMAIL",       "admin@local.dev")
PB_PASSWORD = os.environ.get("PB_PASSWORD",    "admin123456")

# Collections to purge, in deletion order (children before parents).
# View collections are omitted — they have no rows to delete.
PURGE_ORDER = [
    "sightings",        # FK → vehicles (cascade, but we delete explicitly)
    "duplicate_queue",
    "upload_batches",
    "ice_change_log",
    "vehicles",         # FK → vins
    "vins",
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def authenticate(client: httpx.Client) -> str:
    """Return a superuser token, trying both PB 0.23+ and legacy paths."""
    for path in (
        "/api/collections/_superusers/auth-with-password",
        "/api/admins/auth-with-password",
    ):
        resp = client.post(path, json={"identity": PB_EMAIL, "password": PB_PASSWORD})
        if resp.is_success:
            print(f"✅  Authenticated via {path}")
            return resp.json()["token"]
        if resp.status_code != 404:
            print(f"❌  Auth failed ({resp.status_code}): {resp.text[:200]}", file=sys.stderr)
            sys.exit(1)
    print("❌  No working auth endpoint found.", file=sys.stderr)
    sys.exit(1)


def fetch_all_ids(client: httpx.Client, token: str, collection: str) -> list[str]:
    """Page through a collection and return every record id."""
    headers = {"Authorization": token}
    ids: list[str] = []
    page = 1
    per_page = 500
    while True:
        resp = client.get(
            f"/api/collections/{collection}/records",
            params={"fields": "id", "perPage": per_page, "page": page, "skipTotal": 1},
            headers=headers,
        )
        if not resp.is_success:
            print(f"  ⚠️  Could not list {collection} (skipping): {resp.status_code}", file=sys.stderr)
            return []
        data = resp.json()
        batch = [r["id"] for r in data.get("items", [])]
        ids.extend(batch)
        if len(batch) < per_page:
            break
        page += 1
    return ids


def delete_record(client: httpx.Client, token: str, collection: str, record_id: str) -> bool:
    headers = {"Authorization": token}
    resp = client.delete(
        f"/api/collections/{collection}/records/{record_id}",
        headers=headers,
    )
    return resp.is_success


def purge_collection(client: httpx.Client, token: str, collection: str, dry_run: bool) -> int:
    ids = fetch_all_ids(client, token, collection)
    count = len(ids)

    if count == 0:
        print(f"  ⬜  {collection}: already empty")
        return 0

    if dry_run:
        print(f"  🔍  {collection}: {count} records would be deleted")
        return count

    print(f"  🗑️   {collection}: deleting {count} records…", end="", flush=True)
    failed = 0
    for i, rid in enumerate(ids, 1):
        ok = delete_record(client, token, collection, rid)
        if not ok:
            failed += 1
        if i % 100 == 0:
            print(f" {i}…", end="", flush=True)
        # Tiny pause to avoid overwhelming the server
        time.sleep(0.01)

    status = f" done ({count - failed} deleted"
    if failed:
        status += f", {failed} failed"
    status += ")"
    print(status)
    return count - failed


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Purge all data records from a Fluke PocketBase instance.")
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Actually delete records. Without this flag the script runs in DRY-RUN mode.",
    )
    parser.add_argument(
        "--collections",
        nargs="+",
        default=PURGE_ORDER,
        metavar="NAME",
        help=f"Collections to purge (default order: {', '.join(PURGE_ORDER)}).",
    )
    args = parser.parse_args()

    dry_run = not args.confirm

    print()
    print("=" * 60)
    print("  Fluke — Database Record Purge Script")
    print("=" * 60)
    print(f"  Target : {PB_URL}")
    print(f"  Mode   : {'⚠️  LIVE — records WILL be deleted' if not dry_run else '🔍 DRY-RUN (no changes)'}")
    print(f"  Scope  : {', '.join(args.collections)}")
    print("=" * 60)
    print()

    # --- Extra confirmation gate for live runs ---
    if not dry_run:
        print("⚠️  WARNING: This will PERMANENTLY delete all records in the listed")
        print("   collections. This action CANNOT be undone.")
        print()
        answer = input('   Type "DELETE ALL RECORDS" to confirm: ').strip()
        if answer != "DELETE ALL RECORDS":
            print("\n❌  Confirmation failed. Aborting.")
            sys.exit(1)
        print()

    with httpx.Client(base_url=PB_URL, timeout=30) as client:
        token = authenticate(client)
        print()

        total = 0
        for col in args.collections:
            total += purge_collection(client, token, col, dry_run)

    print()
    if dry_run:
        print(f"✅  Dry-run complete. {total} records would be deleted.")
        print("   Re-run with --confirm to actually delete them.")
    else:
        print(f"✅  Purge complete. {total} records deleted.")
    print()


if __name__ == "__main__":
    main()

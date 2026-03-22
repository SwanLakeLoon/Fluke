#!/usr/bin/env python3
"""
CLI CSV Import Script — thin wrapper around the import engine.

Usage:
    uv run scripts/import_csv.py ./data/sample.csv
    uv run scripts/import_csv.py ./data/sample.csv --batch "march-2026"
"""
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx"]
# ///

import csv
import os
import sys
from pathlib import Path

# Add parent to path so we can import the engine
sys.path.insert(0, str(Path(__file__).parent))
from import_engine import process_csv_rows

PB_URL = os.environ.get("POCKETBASE_URL", "http://127.0.0.1:8090")
ADMIN_EMAIL = os.environ.get("PB_ADMIN_EMAIL", "admin@local.dev")
ADMIN_PASS = os.environ.get("PB_ADMIN_PASS", "admin123456")


def authenticate(pb_url: str, email: str, password: str) -> str:
    """Authenticate as superuser and return the token."""
    import httpx
    resp = httpx.post(
        f"{pb_url}/api/collections/_superusers/auth-with-password",
        json={"identity": email, "password": password},
    )
    if not resp.is_success:
        print(f"❌ Auth failed: {resp.status_code} {resp.text}", file=sys.stderr)
        sys.exit(1)
    return resp.json()["token"]


def main():
    if len(sys.argv) < 2:
        print("Usage: uv run scripts/import_csv.py <csv_file> [--batch <name>]")
        sys.exit(1)

    csv_path = sys.argv[1]
    batch_name = Path(csv_path).stem

    # Parse --batch flag
    if "--batch" in sys.argv:
        idx = sys.argv.index("--batch")
        if idx + 1 < len(sys.argv):
            batch_name = sys.argv[idx + 1]

    if not os.path.exists(csv_path):
        print(f"❌ File not found: {csv_path}", file=sys.stderr)
        sys.exit(1)

    # Read CSV
    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"\n📄 Loaded {len(rows)} rows from {csv_path}")
    print(f"📦 Import batch: {batch_name}")
    print(f"🔌 PocketBase: {PB_URL}\n")

    # Authenticate
    token = authenticate(PB_URL, ADMIN_EMAIL, ADMIN_PASS)
    print("✅ Authenticated\n")

    # Process
    result = process_csv_rows(rows, PB_URL, token, import_batch=batch_name)

    # Summary
    print("\n" + "=" * 50)
    print("📊 Import Summary")
    print("=" * 50)
    print(f"  ✅ Inserted:          {result['inserted']}")
    print(f"  ⚠️  Duplicates queued: {result['duplicates_queued']}")
    print(f"  ❌ Rejected:          {result['rejected']}")

    if result["rejected_rows"]:
        print(f"\n❌ Rejected rows:")
        for r in result["rejected_rows"]:
            print(f"  Row {r['row']}: {', '.join(r['errors'])}")

    if result["errors"]:
        print(f"\n⚠️  Errors:")
        for e in result["errors"]:
            print(f"  {e}")

    print()


if __name__ == "__main__":
    main()

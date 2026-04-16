#!/usr/bin/env python3
"""
Fluke — Nightly ICE Status Refresh
====================================
Queries defrostmn.net for every plate in the vehicles collection and updates
any whose ICE status has changed since last import.

Mirrors the logic in image-extraction-tests/src/pipeline/ice.py exactly,
including the same browser headers required by defrostmn.net.

Usage (manual):
    POCKETBASE_URL=https://your-pod.pikapods.net \\
    PB_ADMIN_EMAIL=admin@example.com \\
    PB_ADMIN_PASS=yourpassword \\
    DEFROST_PASSWORD=bCBEYZbpA3 \\
    uv run scripts/ice_refresh.py

    Add --dry-run to print changes without writing to the database.

Env vars:
    POCKETBASE_URL        PocketBase pod URL (no trailing slash)
    PB_ADMIN_EMAIL        Superuser email
    PB_ADMIN_PASS         Superuser password
    DEFROST_PASSWORD      Shared defrostmn.net password
    DEFROST_CONCURRENCY   Max parallel requests to defrost (default: 5)
"""
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx"]
# ///

import asyncio
import json
import os
import sys
import time
import urllib.parse
from datetime import datetime, timezone
from functools import wraps

import httpx

# ── Config ────────────────────────────────────────────────────────────────────
PB_URL       = os.environ.get("POCKETBASE_URL", "http://127.0.0.1:8090")
PB_EMAIL     = os.environ.get("PB_ADMIN_EMAIL", "admin@local.dev")
PB_PASS      = os.environ.get("PB_ADMIN_PASS", "admin123456")
DEFROST_PASS = os.environ.get("DEFROST_PASSWORD", "")
CONCURRENCY  = int(os.environ.get("DEFROST_CONCURRENCY", "5"))
DRY_RUN      = "--dry-run" in sys.argv

DEFROST_BASE = "https://defrostmn.net/plates/lookup"
DEFROST_HEADERS = {
    "Accept": "application/json",
    "Origin": "https://defrostmn.net",
    "Referer": "https://defrostmn.net/plate-check/",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
}

# ── PocketBase Resiliency ─────────────────────────────────────────────────────
def with_pb_retry(max_retries=4):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except httpx.RequestError as e:
                    if attempt == max_retries - 1:
                        raise
                    print(f"  ⚠️ PB request dropped ({type(e).__name__}) — retrying {attempt+1}/{max_retries}...")
                    time.sleep(1 + attempt)
        return wrapper
    return decorator


# ── PocketBase helpers ────────────────────────────────────────────────────────

@with_pb_retry()
def pb_auth(client: httpx.Client) -> str:
    resp = client.post(
        f"{PB_URL}/api/collections/_superusers/auth-with-password",
        json={"identity": PB_EMAIL, "password": PB_PASS},
    )
    resp.raise_for_status()
    return resp.json()["token"]


@with_pb_retry()
def pb_get_all_vehicles(client: httpx.Client, token: str) -> list[dict]:
    """Return list of {id, plate} for every vehicle."""
    vehicles = []
    page = 1
    while True:
        resp = client.get(
            f"{PB_URL}/api/collections/vehicles/records",
            params={"page": page, "perPage": 200, "fields": "id,plate"},
            headers={"Authorization": token},
        )
        resp.raise_for_status()
        data = resp.json()
        vehicles.extend(data["items"])
        if page >= data["totalPages"]:
            break
        page += 1
    return vehicles


@with_pb_retry()
def pb_get_latest_ice(client: httpx.Client, token: str, vehicle_id: str) -> str | None:
    """Return the ICE value from the most recent sighting for this vehicle."""
    resp = client.get(
        f"{PB_URL}/api/collections/sightings/records",
        params={
            "filter": f'vehicle = "{vehicle_id}"',
            "sort": "-date",
            "perPage": 1,
            "fields": "ice",
        },
        headers={"Authorization": token},
    )
    resp.raise_for_status()
    items = resp.json()["items"]
    return items[0]["ice"] if items else None


@with_pb_retry()
def pb_update_all_sightings(client: httpx.Client, token: str, vehicle_id: str, new_ice: str) -> int:
    """Set ice on ALL sightings for this vehicle. Returns count updated."""
    resp = client.get(
        f"{PB_URL}/api/collections/sightings/records",
        params={"filter": f'vehicle = "{vehicle_id}"', "perPage": 500, "fields": "id"},
        headers={"Authorization": token},
    )
    resp.raise_for_status()
    sightings = resp.json()["items"]
    for s in sightings:
        client.patch(
            f"{PB_URL}/api/collections/sightings/records/{s['id']}",
            json={"ice": new_ice},
            headers={"Authorization": token},
        ).raise_for_status()
    return len(sightings)


@with_pb_retry()
def pb_update_vehicle_searchable(client: httpx.Client, token: str, vehicle_id: str, new_ice: str):
    searchable = new_ice in ("Y", "HS")
    client.patch(
        f"{PB_URL}/api/collections/vehicles/records/{vehicle_id}",
        json={"searchable": searchable},
        headers={"Authorization": token},
    ).raise_for_status()


@with_pb_retry()
def pb_log_change(client: httpx.Client, token: str, plate: str, old_ice: str, new_ice: str,
                   sightings_updated: int):
    client.post(
        f"{PB_URL}/api/collections/ice_change_log/records",
        json={
            "plate": plate,
            "old_ice": old_ice,
            "new_ice": new_ice,
            "vehicles_updated": 1,
            "sightings_updated": sightings_updated,
            "run_date": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
            "acknowledged": False,
        },
        headers={"Authorization": token},
    ).raise_for_status()


# ── Defrost lookup ─────────────────────────────────────────────────────────────

async def lookup_ice_async(client: httpx.AsyncClient, sem: asyncio.Semaphore, plate: str) -> str | None:
    """
    Query defrostmn.net for a plate.
    Returns 'Y', 'HS', 'N', 'C', or None on error.
      - 'Y'  = Confirmed ICE
      - 'HS' = Highly suspected ICE
      - 'C'  = Cleared (previously flagged, now removed)
      - 'N'  = Not listed
      - None = lookup failed — do not overwrite existing value
    """
    clean = plate.replace(" ", "").replace("-", "").upper()
    params = urllib.parse.urlencode({"q": clean, "password": DEFROST_PASS})
    url = f"{DEFROST_BASE}?{params}"

    for attempt in range(3):
        try:
            async with sem:
                resp = await client.get(url, headers=DEFROST_HEADERS, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            exact = [m for m in data.get("matches", []) if m.get("similarity_score", 0) == 1]
            if not exact:
                return "N"
            status = (exact[0].get("status") or "").strip()
            status_upper = status.upper()
            if status_upper in ("CONFIRMED ICE", "CONFIRMED"):
                return "Y"
            elif "HIGHLY SUSPECTED" in status_upper:
                return "HS"
            elif status_upper.startswith("CLEARED"):
                return "C"
            else:
                return "N"
        except Exception as e:
            wait = 2 ** attempt
            print(f"  [defrost] {plate} attempt {attempt+1} failed: {e} — retrying in {wait}s")
            await asyncio.sleep(wait)

    print(f"  [defrost] {plate} — all retries exhausted, SKIPPING (not writing N)")
    return None  # caller must skip this plate


# ── Main ───────────────────────────────────────────────────────────────────────

async def run():
    if DRY_RUN:
        print("🔍 DRY RUN — no changes will be written\n")

    if not DEFROST_PASS:
        print("❌ DEFROST_PASSWORD env var is not set. Aborting.")
        sys.exit(1)

    print(f"🔌 Connecting to PocketBase at {PB_URL}")
    with httpx.Client(timeout=30) as pb:
        token = pb_auth(pb)
        print("✅ Authenticated as superuser")

        vehicles = pb_get_all_vehicles(pb, token)
        print(f"🚗 Fetched {len(vehicles)} vehicles\n")

        sem = asyncio.Semaphore(CONCURRENCY)
        checked = 0
        skipped = 0
        changed = 0
        errors  = 0

        async with httpx.AsyncClient() as defrost:
            for i in range(0, len(vehicles), CONCURRENCY):
                batch = vehicles[i : i + CONCURRENCY]
                tasks = [lookup_ice_async(defrost, sem, v["plate"]) for v in batch]
                results = await asyncio.gather(*tasks)

                for vehicle, new_ice in zip(batch, results):
                    checked += 1
                    plate = vehicle["plate"]
                    vid   = vehicle["id"]

                    if new_ice is None:
                        skipped += 1
                        continue

                    old_ice = pb_get_latest_ice(pb, token, vid)
                    if old_ice is None:
                        # No sightings yet — nothing to update
                        skipped += 1
                        continue

                    if new_ice == old_ice:
                        continue  # No change — most common case

                    # Determine change direction for display and logging
                    is_escalation = new_ice in ("Y", "HS")
                    is_clearance  = new_ice == "C"
                    icon = "🔴" if is_escalation else ("⬜" if is_clearance else "📋")
                    print(f"  {icon} {plate}: {old_ice} → {new_ice}")
                    changed += 1

                    if not DRY_RUN:
                        try:
                            n = pb_update_all_sightings(pb, token, vid, new_ice)
                            pb_update_vehicle_searchable(pb, token, vid, new_ice)
                            # Only log escalations (Y/HS) to ice_change_log — these
                            # trigger the admin modal. Clearances are applied silently.
                            if is_escalation:
                                pb_log_change(pb, token, plate, old_ice, new_ice, n)
                        except Exception as e:
                            print(f"    ❌ Write failed for {plate}: {e}")
                            errors += 1

                # Polite 1-second pause between batches
                if i + CONCURRENCY < len(vehicles):
                    await asyncio.sleep(1)

    print(f"\n{'='*50}")
    print(f"{'DRY RUN ' if DRY_RUN else ''}✅ ICE refresh complete")
    print(f"   Plates checked:  {checked}")
    print(f"   Status changed:  {changed}")
    print(f"   Skipped/errors:  {skipped + errors}")
    if errors:
        print(f"   Write errors:    {errors}")
    print(f"{'='*50}")


if __name__ == "__main__":
    asyncio.run(run())

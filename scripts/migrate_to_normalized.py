#!/usr/bin/env python3
"""
One-time migration: alpr_records (flat) → vehicles + sightings (normalized).

Usage:
    POCKETBASE_URL=http://127.0.0.1:8090 \
    PB_ADMIN_EMAIL=admin@local.dev \
    PB_ADMIN_PASS=admin123456 \
    uv run scripts/migrate_to_normalized.py
"""

import os, json, urllib.request, urllib.parse, urllib.error

PB = os.environ.get("POCKETBASE_URL", "http://127.0.0.1:8090")
EMAIL = os.environ.get("PB_ADMIN_EMAIL", "admin@local.dev")
PASS = os.environ.get("PB_ADMIN_PASS", "admin123456")

token = None

def api(method, path, data=None):
    url = f"{PB}{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", token)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        raise Exception(f"{method} {path} → {e.code}: {err_body}")

def auth_admin():
    global token
    res = api("POST", "/api/collections/_superusers/auth-with-password", {
        "identity": EMAIL, "password": PASS
    })
    token = res["token"]
    print(f"✅ Authenticated as admin")

def fetch_all_records():
    """Fetch all alpr_records with pagination."""
    records = []
    page = 1
    while True:
        res = api("GET", f"/api/collections/alpr_records/records?perPage=200&page={page}&sort=-date")
        records.extend(res["items"])
        if page >= res["totalPages"]:
            break
        page += 1
    print(f"📦 Fetched {len(records)} alpr_records")
    return records

def migrate():
    auth_admin()
    records = fetch_all_records()
    
    if not records:
        print("⚠️  No records to migrate.")
        return
    
    # Group by plate, keeping order (newest first since sorted -date)
    plates = {}
    for r in records:
        plate = r.get("plate", "").strip()
        if not plate:
            continue
        if plate not in plates:
            plates[plate] = []
        plates[plate].append(r)
    
    print(f"🚗 Found {len(plates)} unique plates")
    
    vehicles_created = 0
    sightings_created = 0
    errors = 0
    
    for plate, plate_records in plates.items():
        # Use the first (most recent) record for vehicle-level attributes
        newest = plate_records[0]
        
        vehicle_data = {
            "plate": plate,
            "state": newest.get("state", ""),
            "make": newest.get("make", ""),
            "model": newest.get("model", ""),
            "color": newest.get("color", ""),
            "registration": newest.get("registration", ""),
            "vin": newest.get("vin", ""),
            "title_issues": newest.get("title_issues", ""),
            "searchable": newest.get("searchable", False),
        }
        
        try:
            vehicle = api("POST", "/api/collections/vehicles/records", vehicle_data)
            vehicle_id = vehicle["id"]
            vehicles_created += 1
        except Exception as e:
            print(f"  ❌ Failed to create vehicle {plate}: {e}")
            errors += 1
            continue
        
        # Create sightings for each record
        for r in plate_records:
            sighting_data = {
                "vehicle": vehicle_id,
                "location": r.get("location", ""),
                "date": r.get("date", None) or None,
                "ice": r.get("ice", ""),
                "match_status": r.get("match_status", ""),
                "plate_confidence": r.get("plate_confidence", 0),
                "notes": r.get("notes", ""),
            }
            
            try:
                api("POST", "/api/collections/sightings/records", sighting_data)
                sightings_created += 1
            except Exception as e:
                print(f"  ❌ Failed to create sighting for {plate}: {e}")
                errors += 1
    
    print(f"\n{'='*50}")
    print(f"✅ Migration complete!")
    print(f"   Vehicles created:  {vehicles_created}")
    print(f"   Sightings created: {sightings_created}")
    print(f"   Errors:            {errors}")
    print(f"{'='*50}")

if __name__ == "__main__":
    migrate()

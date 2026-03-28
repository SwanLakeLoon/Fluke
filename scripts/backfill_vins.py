# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx"]
# ///
import os
import httpx

PB_URL = os.environ.get("POCKETBASE_URL", "http://127.0.0.1:8090")
ADMIN_EMAIL = os.environ.get("PB_ADMIN_EMAIL", "admin@local.dev")
ADMIN_PASS = os.environ.get("PB_ADMIN_PASS", "admin123456")

def api(client, path, method="GET", json_data=None, token=None):
    headers = {"Authorization": token} if token else {}
    resp = client.request(method, f"{PB_URL}{path}", json=json_data, headers=headers)
    try:
        data = resp.json()
    except Exception:
        data = resp.text
    if not resp.is_success:
        raise Exception(f"{method} {path} → {resp.status_code}: {data}")
    return data

def collection_exists(client, token, name):
    try:
        api(client, f"/api/collections/{name}", token=token)
        return True
    except Exception:
        return False

def main():
    with httpx.Client(timeout=30) as client:
        auth = api(client, "/api/collections/_superusers/auth-with-password", "POST",
                   {"identity": ADMIN_EMAIL, "password": ADMIN_PASS})
        token = auth["token"]
        print("✅ Authenticated as superuser")

        if not collection_exists(client, token, "vins"):
            print("⚠️ 'vins' collection missing. Creating it natively...")
            api(client, "/api/collections", "POST", {
                "id": "pbc_vins00000001", "name": "vins", "type": "base",
                "listRule": "@request.auth.id != \"\"", "viewRule": "@request.auth.id != \"\"",
                "createRule": "@request.auth.id != \"\"", "updateRule": "@request.auth.id != \"\"", "deleteRule": None,
                "indexes": ["CREATE UNIQUE INDEX idx_vins_vin ON vins (vin)"],
                "fields": [
                    {"id": "textvin000vin", "name": "vin", "type": "text", "required": True, "max": 25, "min": 0, "presentable": True},
                    {"id": "textvin000title", "name": "title_issues", "type": "text", "required": False},
                ],
            }, token)
            print("✅ Created vins collection")

        veh_col = api(client, "/api/collections/vehicles", token=token)
        has_vin_rel = any(f["name"] == "vin_relation" for f in veh_col.get("fields", veh_col.get("schema", [])))
        if not has_vin_rel:
            print("⚠️ 'vin_relation' missing on vehicles. Adding it natively...")
            new_fields = veh_col.get("fields", veh_col.get("schema", []))
            new_fields.append({
                "id": "relvehiclevin", "name": "vin_relation", "type": "relation",
                "required": False, "collectionId": "pbc_vins00000001", "cascadeDelete": False, "maxSelect": 1, "minSelect": 0
            })
            api(client, f"/api/collections/{veh_col['id']}", "PATCH", {"schema" if "schema" in veh_col else "fields": new_fields}, token=token)
            print("✅ Added vin_relation to vehicles")

        if not collection_exists(client, token, "enhanced_vin_stats"):
            print("⚠️ 'enhanced_vin_stats' view missing. Creating it natively...")
            api(client, "/api/collections", "POST", {
                "id": "pbcvinstatsenh", "name": "enhanced_vin_stats", "type": "view",
                "listRule": "@request.auth.id != \"\"", "viewRule": "@request.auth.id != \"\"",
                "viewQuery": "SELECT vi.id as id, vi.vin as vin, vi.title_issues as title_issues, COUNT(s.id) as sighting_count, MAX(s.date) as latest_sighting, GROUP_CONCAT(DISTINCT v.plate) as plate_list, MAX(v.searchable) as searchable FROM vins vi LEFT JOIN vehicles v ON v.vin_relation = vi.id LEFT JOIN sightings s ON s.vehicle = v.id GROUP BY vi.id"
            }, token)
            print("✅ Created enhanced_vin_stats view")

        if collection_exists(client, token, "enhanced_plate_stats"):
            ep_col = api(client, "/api/collections/enhanced_plate_stats", token=token)
            if "vin_list" not in ep_col.get("viewQuery", ""):
                print("⚠️ Updating 'enhanced_plate_stats' view to use vin_relation natively...")
                api(client, f"/api/collections/{ep_col['id']}", "PATCH", {
                    "viewQuery": "SELECT v.id as id, v.plate as plate, COUNT(s.id) as sighting_count, MAX(s.date) as latest_sighting, MAX(v.state) as state_list, GROUP_CONCAT(s.ice) as ice_list, MAX(vi.vin) as vin_list, GROUP_CONCAT(s.location) as location_list, GROUP_CONCAT(s.match_status) as match_status_list, MAX(v.searchable) as searchable FROM vehicles v LEFT JOIN sightings s ON s.vehicle = v.id LEFT JOIN vins vi ON v.vin_relation = vi.id GROUP BY v.id"
                }, token)
                print("✅ Updated enhanced_plate_stats view")

        # Fetch vehicles with a VIN string but no relation
        page = 1
        vehicles = []
        while True:
            res = api(client, f"/api/collections/vehicles/records?filter=(vin!='')&&(vin_relation='')&perPage=500&page={page}", token=token)
            vehicles.extend(res["items"])
            if page >= res["totalPages"] or len(res["items"]) == 0:
                break
            page += 1
            
        print(f"📦 Found {len(vehicles)} vehicles needing VIN backfill")
        
        if not vehicles:
            return

        # Group by VIN
        vins = {}
        for v in vehicles:
            vin_str = v["vin"].strip()
            if not vin_str: continue
            if vin_str not in vins:
                vins[vin_str] = []
            vins[vin_str].append(v)

        for vin_str, veh_list in vins.items():
            # 1. find or create vin record
            try:
                search = api(client, f"/api/collections/vins/records?filter=(vin='{vin_str.replace(chr(39), chr(92)+chr(39))}')&limit=1", token=token)
                if search.get("items"):
                    vin_id = search["items"][0]["id"]
                else:
                    # use title_issues from first vehicle
                    title = veh_list[0].get("title_issues", "")
                    new_vin = api(client, "/api/collections/vins/records", "POST", { "vin": vin_str, "title_issues": title }, token=token)
                    vin_id = new_vin["id"]
                
                # 2. update vehicles
                for veh in veh_list:
                    api(client, f"/api/collections/vehicles/records/{veh['id']}", "PATCH", { "vin_relation": vin_id }, token=token)
                print(f"✅ Migrated VIN: {vin_str} ({len(veh_list)} vehicles)")
            except Exception as e:
                print(f"❌ Failed processing VIN {vin_str}: {e}")

if __name__ == "__main__":
    main()

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

def main():
    with httpx.Client(timeout=30) as client:
        auth = api(client, "/api/collections/_superusers/auth-with-password", "POST",
                   {"identity": ADMIN_EMAIL, "password": ADMIN_PASS})
        token = auth["token"]
        print("✅ Authenticated as superuser")

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

import os
import sys
import json
import uuid
from pocketbase import PocketBase

def main():
    pb_url = os.getenv("POCKETBASE_URL", "http://127.0.0.1:8090")
    pb = PocketBase(pb_url)
    
    admin_email = os.getenv("PB_ADMIN_EMAIL")
    admin_pass = os.getenv("PB_ADMIN_PASS")
    
    if not admin_email or not admin_pass:
        print("Missing PB_ADMIN_EMAIL or PB_ADMIN_PASS")
        sys.exit(1)
        
    try:
        pb.collection("_superusers").auth_with_password(admin_email, admin_pass)
        print(f"✅ Authenticated to {pb_url}")
    except Exception as e:
        print(f"Authentication failed: {e}")
        sys.exit(1)

    # 1. Find target vehicles
    plateless_filters = [
        "plate ~ 'no plates'", "plate ~ 'no plate'", 
        "plate ~ 'unknown'", "plate ~ 'none'", 
        "plate ~ 'n/a'", "plate ~ 'na'"
    ]
    query_filter = " || ".join(plateless_filters)
    
    # Need to make sure we don't accidentally match 'JRNA60' with 'plate ~ na'
    # PocketBase ~ is a LIKE operator. To be strict, we should pull them and filter in Python.
    print("Fetching potential plateless vehicles...")
    vehicles = pb.collection("vehicles").get_full_list()
    
    target_plates = {"no plates", "no plate", "unknown", "none", "n/a", "na"}
    bad_vehicles = [v for v in vehicles if v.plate.lower().strip() in target_plates]
    
    print(f"Found {len(bad_vehicles)} true plateless 'Frankenstein' vehicles.")
    
    sightings_to_migrate = []
    
    for v in bad_vehicles:
        sightings = pb.collection("sightings").get_full_list(query_params={"filter": f"vehicle = '{v.id}'"})
        print(f"Vehicle {v.id} (Plate: '{v.plate}') has {len(sightings)} sightings.")
        for s in sightings:
            sightings_to_migrate.append((v, s))
            
    print(f"\nTotal sightings to untangle: {len(sightings_to_migrate)}")
    
    # To avoid repeated batch fetching
    batches_cache = {}
    
    for old_v, s in sightings_to_migrate:
        print(f"\n--- Processing Sighting {s.id} ---")
        batch_id = getattr(s, "import_batch", "")
        raw_row = None
        
        if batch_id:
            if batch_id not in batches_cache:
                try:
                    batch = pb.collection("upload_batches").get_one(batch_id)
                    batches_cache[batch_id] = getattr(batch, "rows", [])
                except:
                    batches_cache[batch_id] = []
                    
            # Try to find the exact row
            rows = batches_cache[batch_id]
            for r in rows:
                r_date = r.get("Date", "")[:10]
                s_date = getattr(s, "date", "")[:10]
                r_loc = r.get("Location", "")
                
                if r_date == s_date and r_loc == getattr(s, "location", ""):
                    raw_row = r
                    break
        
        vin_val = ""
        is_physical = False
        make = old_v.make
        model = old_v.model
        color = old_v.color
        
        if raw_row:
            print(f"  [+] Found raw row in batch {batch_id}")
            vin_val = raw_row.get("VIN Associated to Plate (if available)", "").strip()
            is_physical = raw_row.get("VIN Source", "") == "Vehicle VIN"
            make = raw_row.get("Make", make)
            model = raw_row.get("Model", model)
            color = raw_row.get("Color", color)
        else:
            print("  [-] No raw row found (UI created or batch missing).")
            
        vin_record_id = None
        
        # If we have a VIN, get or create the VIN record
        if vin_val:
            try:
                existing_vin = pb.collection("vins").get_first_list_item(f"vin = '{vin_val}'")
                vin_record_id = existing_vin.id
                print(f"  [+] Found existing VIN record {vin_record_id}")
            except:
                new_vin = pb.collection("vins").create({"vin": vin_val})
                vin_record_id = new_vin.id
                print(f"  [+] Created new VIN record {vin_record_id}")

        # Now find or create a vehicle for this sighting
        target_vehicle = None
        
        if vin_record_id:
            # Group by VIN
            try:
                target_vehicle = pb.collection("vehicles").get_first_list_item(
                    f"vin_relation = '{vin_record_id}' || physical_vin_relation = '{vin_record_id}'"
                )
                print(f"  [+] Grouping by VIN to existing vehicle {target_vehicle.id}")
            except:
                pass
                
        if not target_vehicle:
            # Create a brand new transient vehicle
            transient_plate = f"NO PLATES ({str(uuid.uuid4())[:8].upper()})"
            print(f"  [+] Creating new isolated vehicle for this sighting: {transient_plate}")
            target_vehicle = pb.collection("vehicles").create({
                "plate": transient_plate,
                "state": "MN", # Defaulting to MN or what we had
                "make": make,
                "model": model,
                "color": color,
                "vin_relation": "" if is_physical else (vin_record_id or ""),
                "physical_vin_relation": (vin_record_id or "") if is_physical else "",
                "searchable": False
            })
            
        if target_vehicle.id == old_v.id:
            print("  [!] Target vehicle is the same as the old vehicle (should not happen usually).")
            continue
            
        # Move the sighting
        print(f"  [+] Moving sighting from {old_v.id} to {target_vehicle.id}")
        pb.collection("sightings").update(s.id, {"vehicle": target_vehicle.id})
        
    # Delete the old Frankenstein vehicles
    print("\n--- Cleanup ---")
    for v in bad_vehicles:
        # verify no sightings left
        remaining = pb.collection("sightings").get_full_list(query_params={"filter": f"vehicle = '{v.id}'"})
        if len(remaining) == 0:
            print(f"Deleting empty Frankenstein vehicle {v.id}")
            pb.collection("vehicles").delete(v.id)
        else:
            print(f"WARNING: Vehicle {v.id} still has {len(remaining)} sightings! Skipping deletion.")
            
    print("Untangling complete!")

if __name__ == "__main__":
    main()

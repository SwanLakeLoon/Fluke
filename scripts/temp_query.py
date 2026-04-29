import os
from pocketbase import PocketBase

def main():
    pb = PocketBase("https://eccentric-bumblebee.pikapod.net")
    admin_email = os.getenv("PB_ADMIN_EMAIL")
    admin_pass = os.getenv("PB_ADMIN_PASS")
    pb.collection("_superusers").auth_with_password(admin_email, admin_pass)

    # 1. Find all vehicles that might be plateless
    vehicles = pb.collection("vehicles").get_full_list(query_params={
        "filter": "plate ~ 'no plate' || plate ~ 'unknown' || plate ~ 'none' || plate ~ 'na'"
    })
    
    print(f"Found {len(vehicles)} plateless vehicles")
    for v in vehicles:
        print(f"Vehicle: {v.id} | Plate: '{v.plate}' | Make: {v.make} | Model: {v.model} | Searchable: {v.searchable}")
        
        # 2. Find sightings for this vehicle
        sightings = pb.collection("sightings").get_full_list(query_params={
            "filter": f"vehicle = '{v.id}'",
            "sort": "-date"
        })
        print(f"  -> Has {len(sightings)} sightings")
        for s in sightings[:3]:
            print(f"    - {s.id}: {s.date} at {s.location}")
        if len(sightings) > 3:
            print(f"    - ... and {len(sightings) - 3} more")

if __name__ == "__main__":
    main()

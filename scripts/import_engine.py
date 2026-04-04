#!/usr/bin/env python3
"""
Import Engine — shared CSV processing logic used by both
the CLI import script and the admin CSV Upload page.

3-tier architecture: VIN → Vehicle → Sighting

Usage from CLI:
    uv run scripts/import_csv.py ./data/sample.csv

Usage from Python:
    from scripts.import_engine import process_csv_rows
    result = process_csv_rows(rows, pb_url, token)
"""
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx", "python-dateutil"]
# ///

import httpx

# ---------- constants ----------

COLUMN_MAP = {
    "Plate":                                      "plate",
    "State":                                      "state",
    "Make":                                       "make",
    "Model":                                      "model",
    "Color":                                      "color",
    "ICE":                                        "ice",
    "Match":                                      "match_status",
    "Registration":                               "registration",
    "VIN Associated to Plate (if available)":      "vin",
    "Title Issues Associated to VIN (if available)": "title_issues",
    "Notes":                                      "notes",
    "Location":                                   "location",
    "Date":                                       "date",
    "Plate Confidence":                           "plate_confidence",
    "VIN Source":                                 "vin_source",
}

VALID_COLORS = {"BR", "GR", "BK", "BL", "TN", "SL", "R", "WH", "GN", "GD", "PU", "OR"}
VALID_ICE    = {"Y", "N", "HS", "C"}
VALID_MATCH  = {"Y", "N", ""}

# ---------- helpers ----------

def map_row(csv_row: dict) -> dict:
    """Map CSV column names to DB field names."""
    mapped = {}
    for csv_col, db_field in COLUMN_MAP.items():
        val = csv_row.get(csv_col, "").strip()
        mapped[db_field] = val
        
    # Normalize missing plates
    if mapped.get("plate", "").lower() in {"no plates", "no", "missing", "none", "nothing"}:
        mapped["plate"] = "NO PLATES"

    # Also check if 'searchable' column exists in CSV
    if "searchable" in csv_row or "Searchable" in csv_row:
        raw = csv_row.get("searchable", csv_row.get("Searchable", "")).strip().upper()
        mapped["_searchable_from_csv"] = raw in ("Y", "TRUE", "1", "YES")
    else:
        mapped["_searchable_from_csv"] = None  # signals: derive it
    # VIN Source: normalize — only 'Vehicle VIN' is special, everything else defaults to 'Plate VIN'
    vin_source_raw = mapped.get("vin_source", "").strip()
    mapped["vin_source"] = "Vehicle VIN" if vin_source_raw == "Vehicle VIN" else "Plate VIN"
    return mapped


def validate_row(row: dict) -> list[str]:
    """Validate a mapped row. Returns a list of error strings (empty = valid)."""
    errors = []
    if not row.get("plate"):
        errors.append("plate is required")
    elif len(row["plate"]) > 20:
        errors.append(f"plate too long ({len(row['plate'])} > 20)")

    if row.get("state") and len(row["state"]) > 2:
        errors.append(f"state must be at most 2 chars, got '{row['state']}'")

    if row.get("color") and row["color"] not in VALID_COLORS:
        errors.append(f"invalid color '{row['color']}', must be one of {VALID_COLORS}")

    if row.get("ice") and row["ice"] not in VALID_ICE:
        errors.append(f"invalid ICE '{row['ice']}', must be one of {VALID_ICE}")

    if row.get("match_status") and row["match_status"] not in VALID_MATCH:
        errors.append(f"invalid match '{row['match_status']}', must be Y, N, or blank")

    return errors


def derive_searchable(row: dict) -> bool:
    """Derive the searchable flag based on CSV value or ICE column."""
    csv_val = row.pop("_searchable_from_csv", None)
    if csv_val is not None:
        return csv_val
    # Auto-derive: only searchable if ICE is Y or HS; C (Cleared) explicitly becomes False
    return row.get("ice", "") in ("Y", "HS")


import dateutil.parser

def build_record(row: dict) -> dict:
    """Build a PocketBase-ready record dict from a mapped row."""
    searchable = derive_searchable(row)
    record = {k: v for k, v in row.items() if not k.startswith("_")}

    # Convert plate_confidence to float
    if record.get("plate_confidence"):
        try:
            record["plate_confidence"] = float(record["plate_confidence"])
        except ValueError:
            record["plate_confidence"] = 0.0
    else:
        record["plate_confidence"] = 0.0

    # Robust Date Normalization
    raw_date = record.get("date", "").strip()
    if raw_date:
        try:
            dt = dateutil.parser.parse(raw_date)
            # PocketBase natively ingests ISO formatted UTC strings
            record["date"] = dt.strftime("%Y-%m-%d %H:%M:%S.000Z")
        except Exception:
            record["date"] = None
    else:
        record["date"] = None

    record["searchable"] = searchable
    return record


# ---------- main engine (3-tier) ----------

def process_csv_rows(
    rows: list[dict],
    pb_url: str,
    token: str,
    import_batch: str = "unknown",
) -> dict:
    """
    Process parsed CSV rows and insert into PocketBase using 3-tier schema.
    VIN → Vehicle → Sighting

    Returns: { "inserted": int, "duplicates_queued": int, "rejected": int,
               "rejected_rows": list, "errors": list }
    """
    result = {
        "inserted": 0,
        "duplicates_queued": 0,
        "rejected": 0,
        "rejected_rows": [],
        "errors": [],
    }

    with httpx.Client(timeout=30.0) as client:
        headers = {"Authorization": token}
        vin_cache: dict[str, str | None] = {}     # vin string → vin record id
        vehicle_cache: dict[str, str | None] = {}  # plate → vehicle record id

        for i, csv_row in enumerate(rows, start=1):
            # 1. Map columns
            mapped = map_row(csv_row)

            # 2. Validate
            errors = validate_row(mapped)
            if errors:
                result["rejected"] += 1
                result["rejected_rows"].append({"row": i, "errors": errors, "data": csv_row})
                continue

            # 3. Build record
            record = build_record(mapped)

            # 4. VIN phase — find or create VIN record
            vin_relation_id = None
            vin_str = record.pop("vin", "")
            title_issues = record.pop("title_issues", "")

            if vin_str:
                if vin_str in vin_cache:
                    vin_relation_id = vin_cache[vin_str]
                else:
                    try:
                        # Try to find existing VIN
                        check = client.get(
                            f"{pb_url}/api/collections/vins/records",
                            params={"filter": f'vin = "{vin_str}"', "perPage": 1},
                            headers=headers,
                        )
                        items = check.json().get("items", [])
                        if items:
                            vin_relation_id = items[0]["id"]
                            # Backfill title_issues if missing
                            if title_issues and not items[0].get("title_issues"):
                                client.patch(
                                    f"{pb_url}/api/collections/vins/records/{vin_relation_id}",
                                    json={"title_issues": title_issues},
                                    headers=headers,
                                )
                        else:
                            # Create new VIN record
                            resp = client.post(
                                f"{pb_url}/api/collections/vins/records",
                                json={"vin": vin_str, "title_issues": title_issues},
                                headers=headers,
                            )
                            vin_relation_id = resp.json()["id"]
                    except Exception as e:
                        result["errors"].append(f"Row {i}: VIN lookup/create failed: {e}")

                    vin_cache[vin_str] = vin_relation_id

            # 5. Vehicle phase — find or create Vehicle
            plate = record["plate"]
            vehicle_id = None
            is_physical = record.get("vin_source") == "Vehicle VIN"

            if plate in vehicle_cache:
                vehicle_id = vehicle_cache[plate]
            else:
                try:
                    check = client.get(
                        f"{pb_url}/api/collections/vehicles/records",
                        params={"filter": f'plate = "{plate}"', "perPage": 1},
                        headers=headers,
                    )
                    items = check.json().get("items", [])
                    if items:
                        vehicle_id = items[0]["id"]
                        # Backfill correct VIN relation field if missing
                        existing = items[0]
                        if is_physical and vin_relation_id and not existing.get("physical_vin_relation"):
                            client.patch(
                                f"{pb_url}/api/collections/vehicles/records/{vehicle_id}",
                                json={"physical_vin_relation": vin_relation_id},
                                headers=headers,
                            )
                        elif not is_physical and vin_relation_id and not existing.get("vin_relation"):
                            client.patch(
                                f"{pb_url}/api/collections/vehicles/records/{vehicle_id}",
                                json={"vin_relation": vin_relation_id},
                                headers=headers,
                            )
                    else:
                        # Create new vehicle
                        veh_data = {
                            "plate":                 plate,
                            "state":                 record.get("state", ""),
                            "make":                  record.get("make", ""),
                            "model":                 record.get("model", ""),
                            "color":                 record.get("color", ""),
                            "registration":          record.get("registration", ""),
                            "vin_relation":          "" if is_physical else (vin_relation_id or ""),
                            "physical_vin_relation": (vin_relation_id or "") if is_physical else "",
                            "searchable":            record.get("searchable", False),
                        }
                        resp = client.post(
                            f"{pb_url}/api/collections/vehicles/records",
                            json=veh_data,
                            headers=headers,
                        )
                        vehicle_id = resp.json()["id"]
                except Exception as e:
                    result["errors"].append(f"Row {i}: vehicle lookup/create failed: {e}")
                    continue

                vehicle_cache[plate] = vehicle_id

            # 6. Vehicle VIN rows only exist to set physical_vin_relation.
            # They share the same plate/date/location as the Plate VIN sighting,
            # so skip the duplicate check and sighting creation entirely.
            if record.get("vin_source") == "Vehicle VIN":
                result["inserted"] += 1
                continue

            # 7. Duplicate check (vehicle + date + location)
            date = record.get("date") or ""
            location = record.get("location") or ""

            filter_parts = [f'vehicle = "{vehicle_id}"']
            if location:
                filter_parts.append(f'location = "{location}"')
            else:
                filter_parts.append('location = ""')

            filter_str = " && ".join(filter_parts)

            try:
                check = client.get(
                    f"{pb_url}/api/collections/sightings/records",
                    params={"filter": filter_str, "perPage": 50, "skipTotal": False},
                    headers=headers,
                )
                check_data = check.json()
                # Check for matching date
                is_dup = False
                existing_id = None
                rec_date = date[:10] if date else None
                for item in check_data.get("items", []):
                    ex_date = item.get("date", "")[:10] if item.get("date") else None
                    if ex_date == rec_date:
                        is_dup = True
                        existing_id = item["id"]
                        break
            except Exception as e:
                result["errors"].append(f"Row {i}: duplicate check failed: {e}")
                is_dup = False
                existing_id = None

            if is_dup:
                # Stage as duplicate
                try:
                    client.post(
                        f"{pb_url}/api/collections/duplicate_queue/records",
                        json={
                            "raw_data": record,
                            "reason": f"Duplicate: same plate+date+location (plate={plate})",
                            "status": "pending",
                            "import_batch": import_batch,
                            "existing_record_id": existing_id,
                        },
                        headers=headers,
                    )
                    result["duplicates_queued"] += 1
                except Exception as e:
                    result["errors"].append(f"Row {i}: failed to queue duplicate: {e}")
                continue

            # 7. Insert sighting
            try:
                sighting_data = {
                    "vehicle": vehicle_id,
                    "location": record.get("location", ""),
                    "date": record.get("date"),
                    "ice": record.get("ice", ""),
                    "match_status": record.get("match_status", ""),
                    "plate_confidence": record.get("plate_confidence", 0),
                    "notes": record.get("notes", ""),
                }
                resp = client.post(
                    f"{pb_url}/api/collections/sightings/records",
                    json=sighting_data,
                    headers=headers,
                )
                if resp.is_success:
                    result["inserted"] += 1
                else:
                    err_data = resp.json()
                    result["rejected"] += 1
                    result["rejected_rows"].append({"row": i, "errors": [str(err_data)], "data": csv_row})
            except Exception as e:
                result["errors"].append(f"Row {i}: insert failed: {e}")

    return result

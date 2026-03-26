#!/usr/bin/env python3
"""
Import Engine — shared CSV processing logic used by both
the CLI import script and the admin CSV Upload page.

Usage from CLI:
    uv run scripts/import_csv.py ./data/sample.csv

Usage from Python:
    from scripts.import_engine import process_csv_rows
    result = process_csv_rows(rows, pb_url, token)
"""
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx"]
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
}

VALID_COLORS = {"BR", "GR", "BK", "BL", "TN", "SL", "R", "WH", "GN", "GD", "PU", "OR"}
VALID_ICE    = {"Y", "N", "HS"}
VALID_MATCH  = {"Y", "N", ""}

# ---------- helpers ----------

def map_row(csv_row: dict) -> dict:
    """Map CSV column names to DB field names."""
    mapped = {}
    for csv_col, db_field in COLUMN_MAP.items():
        val = csv_row.get(csv_col, "").strip()
        mapped[db_field] = val
    # Also check if 'searchable' column exists in CSV
    if "searchable" in csv_row or "Searchable" in csv_row:
        raw = csv_row.get("searchable", csv_row.get("Searchable", "")).strip().upper()
        mapped["_searchable_from_csv"] = raw in ("Y", "TRUE", "1", "YES")
    else:
        mapped["_searchable_from_csv"] = None  # signals: derive it
    return mapped


def validate_row(row: dict) -> list[str]:
    """Validate a mapped row. Returns a list of error strings (empty = valid)."""
    errors = []
    if not row.get("plate"):
        errors.append("plate is required")
    elif len(row["plate"]) > 10:
        errors.append(f"plate too long ({len(row['plate'])} > 10)")

    if not row.get("state"):
        errors.append("state is required")
    elif len(row["state"]) != 2:
        errors.append(f"state must be 2 chars, got '{row['state']}'")

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
    # Auto-derive: searchable if ICE is Y or HS
    return row.get("ice", "") in ("Y", "HS")


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

    # Blank date should be None
    if not record.get("date"):
        record["date"] = None

    record["searchable"] = searchable
    return record


# ---------- main engine ----------

def process_csv_rows(
    rows: list[dict],
    pb_url: str,
    token: str,
    import_batch: str = "unknown",
) -> dict:
    """
    Process parsed CSV rows and insert into PocketBase.

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

            # 4. Duplicate check (plate + date + location)
            plate = record["plate"]
            date = record.get("date") or ""
            location = record.get("location") or ""

            filter_parts = [f'plate = "{plate}"']
            if date:
                filter_parts.append(f'date = "{date}"')
            else:
                filter_parts.append('date = ""')
            if location:
                filter_parts.append(f'location = "{location}"')
            else:
                filter_parts.append('location = ""')

            filter_str = " && ".join(filter_parts)

            try:
                check = client.get(
                    f"{pb_url}/api/collections/alpr_records/records",
                    params={"filter": filter_str, "perPage": 1, "skipTotal": False},
                    headers=headers,
                )
                check_data = check.json()
                total = check_data.get("totalItems", 0)
            except Exception as e:
                result["errors"].append(f"Row {i}: duplicate check failed: {e}")
                total = 0

            if total > 0:
                # Stage as duplicate
                existing_id = check_data.get("items", [{}])[0].get("id")
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

            # 5. Insert
            try:
                resp = client.post(
                    f"{pb_url}/api/collections/alpr_records/records",
                    json=record,
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

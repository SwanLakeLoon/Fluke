#!/usr/bin/env python3
"""
format_csv.py — Format scraped + reg-annotated Airtable rows into the
                standard Fluke CSV import template.

The output CSV is ready to be consumed by the existing import_engine.py
pipeline (the same one used by the admin CSV Upload page).

Column mapping:
  Plate         ← plate
  State         ← state
  Make          ← reg_make  (falls back to scraped make if reg lookup failed)
  Model         ← reg_model (falls back to scraped model)
  Color         ← color     (already Fluke-coded: BK, SL, GR, etc.)
  ICE           ← ice       (C, HS)
  Match         ← Y if reg make matches Airtable make, N if not, blank if unknown
  Registration  ← "YEAR MAKE MODEL" from registry (blank if not found)
  VIN Associated to Plate (if available)  ← blank
  Title Issues Associated to VIN (if available) ← blank
  Notes         ← "[airtable-hot-dishes]"
  Location      ← location
  Date          ← YYYY-MM-DD
  Plate Confidence ← blank
  VIN Source    ← "Plate VIN"

Usage:
    uv run scripts/format_csv.py \\
        --input /tmp/airtable_rows_reg.json \\
        --output /tmp/airtable_import.csv
"""
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///

import argparse
import csv
import json
import sys

TEMPLATE_COLUMNS = [
    "Plate",
    "State",
    "Make",
    "Model",
    "Color",
    "ICE",
    "Match",
    "Registration",
    "VIN Associated to Plate (if available)",
    "Title Issues Associated to VIN (if available)",
    "Notes",
    "Location",
    "Date",
    "Plate Confidence",
    "VIN Source",
]

IMPORT_SOURCE = "airtable-hot-dishes"

# Make aliases — groups of strings that refer to the same manufacturer.
# Used to determine Match: Y if reg make and observed make are in the same group.
MAKE_ALIAS_GROUPS: list[set[str]] = [
    {"CHEVROLET", "CHEVY"},
    {"DODGE", "RAM"},
    {"VOLKSWAGEN", "VW"},
    {"FORD"},
    {"HONDA"},
    {"TOYOTA"},
    {"NISSAN"},
    {"JEEP"},
    {"CHRYSLER"},
    {"KIA"},
    {"HYUNDAI"},
    {"SUBARU"},
    {"GMC"},
    {"BUICK"},
    {"MAZDA"},
    {"MITSUBISHI"},
    {"LINCOLN"},
    {"CADILLAC"},
    {"ACURA"},
    {"LEXUS"},
    {"INFINITI"},
    {"BMW"},
    {"MERCEDES", "MERCEDES-BENZ"},
    {"AUDI"},
    {"VOLVO"},
    {"LAND ROVER"},
]

def _make_group(make: str) -> set[str] | None:
    """Return the alias group for a make string, or None if not found."""
    upper = make.upper().strip()
    for group in MAKE_ALIAS_GROUPS:
        if upper in group:
            return group
    return None


def compute_match(observed_make: str, reg_make: str) -> str:
    """
    Compare the Airtable-observed make against the registry make.
    Returns 'Y', 'N', or '' (unknown — one side is blank).
    """
    obs = (observed_make or "").upper().strip()
    reg = (reg_make or "").upper().strip()

    if not obs or not reg:
        return ""   # can't determine

    if obs == reg:
        return "Y"

    obs_group = _make_group(obs)
    reg_group = _make_group(reg)

    if obs_group and reg_group:
        return "Y" if obs_group & reg_group else "N"

    # At least one make is unknown — do a substring check as last resort
    if obs in reg or reg in obs:
        return "Y"

    return "N"


def build_registration_string(r: dict) -> str:
    """
    Build a human-readable registration string: "2020 Jeep Grand Cherokee".
    Returns blank if no registry data was returned.
    """
    parts = [
        str(r.get("reg_year") or "").strip(),
        (r.get("reg_make") or "").strip().title(),
        (r.get("reg_model") or "").strip().title(),
    ]
    result = " ".join(p for p in parts if p)
    return result


def row_to_csv(r: dict) -> dict:
    """Map a single annotated row dict to a template CSV row dict."""

    reg_str = build_registration_string(r)

    # Match: computed fresh here by comparing reg make vs Airtable-scraped make.
    # reg_lookup.py may have already set match_status, but we recompute for
    # transparency and to handle cases where only one side is populated.
    match = compute_match(r.get("make", ""), r.get("reg_make", ""))

    # Make/Model for the vehicle record:
    # If registry returned data, use it (more authoritative).
    # Fall back to Airtable-scraped values.
    has_reg = bool(r.get("reg_make"))
    make  = (r.get("reg_make")  or r.get("make")  or "").strip().title()
    model = (r.get("reg_model") or r.get("model") or "").strip().title()

    return {
        "Plate":       r.get("plate", ""),
        "State":       r.get("state", ""),
        "Make":        make,
        "Model":       model,
        "Color":       r.get("color", ""),
        "ICE":         r.get("ice", ""),
        "Match":       match,
        "Registration": reg_str,
        "VIN Associated to Plate (if available)": "",
        "Title Issues Associated to VIN (if available)": "",
        "Notes":       f"[{IMPORT_SOURCE}]",
        "Location":    r.get("location", ""),
        "Date":        (r.get("date") or "")[:10],  # YYYY-MM-DD only
        "Plate Confidence": "",
        "VIN Source":  "Plate VIN",
    }


def main():
    parser = argparse.ArgumentParser(
        description="Format annotated Airtable rows into the Fluke CSV import template."
    )
    parser.add_argument("--input",  "-i", metavar="FILE", required=True,
                        help="JSON file from reg_lookup.py")
    parser.add_argument("--output", "-o", metavar="FILE",
                        help="Write CSV to FILE (default: stdout)")
    args = parser.parse_args()

    with open(args.input) as f:
        rows = json.load(f)

    out = open(args.output, "w", newline="") if args.output else sys.stdout

    try:
        writer = csv.DictWriter(out, fieldnames=TEMPLATE_COLUMNS)
        writer.writeheader()

        written = 0
        skipped = 0
        for r in rows:
            plate = (r.get("plate") or "").strip()
            if not plate:
                skipped += 1
                continue
            writer.writerow(row_to_csv(r))
            written += 1

        print(f"[csv] Wrote {written} rows ({skipped} skipped) → "
              f"{args.output or 'stdout'}", file=sys.stderr)
    finally:
        if args.output:
            out.close()


if __name__ == "__main__":
    main()

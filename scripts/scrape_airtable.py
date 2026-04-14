#!/usr/bin/env python3
"""
scrape_airtable.py — Scrape the "Hot Dishes" Airtable shared view.

Strategy: Intercept the single JSON response from Airtable's internal
`readForSharedPages` API call, which embeds ALL 261 records (plus full
schema/select-option metadata) in the page load payload.

Exact data path:
  response.data
    .preloadPageQueryResults
    .tableDataById[<tableId>]
    .partialRowById        ← all records (dict keyed by record id)
  response.data
    .tableSchemas[0]
    .columns               ← field id → name + select choices dict

Output: JSON array written to stdout (or --output <file>).

Usage:
    uv run scripts/scrape_airtable.py
    uv run scripts/scrape_airtable.py --output /tmp/airtable_rows.json
    uv run scripts/scrape_airtable.py --dump-raw /tmp/raw.json --dry-run
"""
# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright"]
# ///

import argparse
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

# ── Config ─────────────────────────────────────────────────────────────────────

AIRTABLE_URL = "https://airtable.com/app1PYL3vaSIYiCi5/shrP1K3uviv0gVmR2"

# Airtable "Current Plate Status" option names → Fluke ICE code
ICE_MAP = {
    "confirmed ice":        "C",
    "highly suspected ice": "HS",
    "suspected ice":        "HS",  # treat as HS
    "cleared - not ice":    "N",
}

# Airtable "Color" option names → Fluke color code
COLOR_MAP = {
    "black":       "BK",
    "white":       "WH",
    "silver":      "SL",
    "gray":        "GR",
    "grey":        "GR",
    "gray / grey": "GR",
    "blue":        "BL",
    "red":         "R",
    "green":       "GN",
    "brown":       "BR",
    "tan":         "TN",
    "gold":        "GD",
    "purple":      "PU",
    "orange":      "OR",
}

STATE_RE = re.compile(r"^([A-Z]{2})\s*[-–]")


# ── Normalisation helpers ───────────────────────────────────────────────────────

def parse_state(raw: str) -> str:
    """'MN - Minnesota' → 'MN'"""
    m = STATE_RE.match(raw.strip())
    return m.group(1) if m else raw.strip()[:2].upper()


def parse_ice(status_name: str) -> str:
    return ICE_MAP.get(status_name.strip().lower(), "")


def parse_color(color_name: str) -> str:
    lower = color_name.strip().lower()
    # Exact match first
    if lower in COLOR_MAP:
        return COLOR_MAP[lower]
    # Partial match
    for key, code in COLOR_MAP.items():
        if key in lower:
            return code
    return ""


def parse_make(make_name: str) -> str:
    """Strip parenthetical aliases: 'Chevrolet (Chevy)' → 'Chevrolet'"""
    return re.sub(r"\s*\(.*?\)", "", make_name).strip()


def parse_date(raw) -> str | None:
    """Parse ISO date string from Airtable into PocketBase format."""
    if not raw:
        return None
    raw = str(raw).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(raw, fmt)
            return dt.strftime("%Y-%m-%d %H:%M:%S.000Z")
        except ValueError:
            continue
    return None


# ── Schema parser ───────────────────────────────────────────────────────────────

def build_lookup_tables(columns: list[dict]) -> tuple[dict, dict]:
    """
    Returns:
        field_id_to_name:   { fldXXX: "Plate #" }
        select_id_to_name:  { selXXX: "MN - Minnesota" }   (all fields combined)
    """
    field_id_to_name: dict[str, str] = {}
    select_id_to_name: dict[str, str] = {}

    for col in columns:
        fid   = col["id"]
        fname = col["name"]
        field_id_to_name[fid] = fname

        opts = col.get("typeOptions") or {}
        if not isinstance(opts, dict):
            continue
        choices = opts.get("choices") or {}
        if isinstance(choices, dict):
            for sel_id, choice in choices.items():
                if isinstance(choice, dict):
                    select_id_to_name[sel_id] = choice.get("name", "")

    return field_id_to_name, select_id_to_name


# ── Row parser ──────────────────────────────────────────────────────────────────

def parse_row(rec: dict,
              field_id_to_name: dict[str, str],
              select_id_to_name: dict[str, str]) -> dict | None:
    cells = rec.get("cellValuesByColumnId", {})
    if not cells:
        return None

    def get_field(human_name: str) -> str:
        """Find a cell value by field human name."""
        for fid, fname in field_id_to_name.items():
            if fname == human_name:
                raw = cells.get(fid)
                if raw is None:
                    return ""
                # Select fields return a selXXX id string
                if isinstance(raw, str) and raw.startswith("sel"):
                    return select_id_to_name.get(raw, raw)
                # Multi-select returns a list of selXXX strings
                if isinstance(raw, list):
                    resolved = []
                    for item in raw:
                        if isinstance(item, str) and item.startswith("sel"):
                            resolved.append(select_id_to_name.get(item, item))
                        elif isinstance(item, dict):
                            resolved.append(item.get("name") or item.get("text") or "")
                        else:
                            resolved.append(str(item))
                    return ", ".join(r for r in resolved if r)
                # Plain value
                return str(raw).strip()
        return ""

    plate = get_field("Plate #").upper().strip()
    if not plate:
        return None

    issuer_raw  = get_field("Plate Issuer")
    status_raw  = get_field("Current Plate Status")
    color_raw   = get_field("Color")
    make_raw    = get_field("Make")
    model_raw   = get_field("Model")
    date_raw    = cells.get(
        next((fid for fid, n in field_id_to_name.items() if n == "Date & time seen"), ""), ""
    )
    location_raw = get_field("Location seen")

    return {
        "plate":        plate,
        "state":        parse_state(issuer_raw),
        "ice":          parse_ice(status_raw),
        "color":        parse_color(color_raw),
        "make":         parse_make(make_raw),
        "model":        model_raw.strip(),
        "date":         parse_date(date_raw),
        "location":     location_raw.strip(),
        # Debug fields (stripped by ingest script)
        "_raw_status":  status_raw,
        "_raw_color":   color_raw,
    }


# ── Playwright scraper ──────────────────────────────────────────────────────────

def scrape(dump_raw: str | None = None) -> list[dict]:
    target_payload: dict | None = None

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
        )
        page = context.new_page()

        def on_response(response):
            nonlocal target_payload
            if "readForSharedPages" not in response.url:
                return
            if response.status != 200:
                return
            try:
                data = response.json()
                if data.get("msg") == "SUCCESS":
                    target_payload = data
                    print(f"[scraper] ✅ Captured readForSharedPages response", file=sys.stderr)
            except Exception as e:
                print(f"[scraper] ⚠️  Failed to parse readForSharedPages: {e}", file=sys.stderr)

        page.on("response", on_response)

        print(f"[scraper] Navigating to {AIRTABLE_URL}", file=sys.stderr)
        try:
            page.goto(AIRTABLE_URL, wait_until="networkidle", timeout=90_000)
        except PWTimeout:
            print("[scraper] ⚠️  networkidle timed out — proceeding", file=sys.stderr)

        # Give Airtable extra time if the response hasn't arrived yet
        for _ in range(10):
            if target_payload is not None:
                break
            time.sleep(1)

        browser.close()

    if target_payload is None:
        print("[scraper] ❌ No readForSharedPages response captured.", file=sys.stderr)
        return []

    if dump_raw:
        Path(dump_raw).write_text(json.dumps(target_payload, indent=2))
        print(f"[scraper] Raw payload saved → {dump_raw}", file=sys.stderr)

    # ── Parse ────────────────────────────────────────────────────────────────
    inner = target_payload["data"]
    columns = inner.get("tableSchemas", [{}])[0].get("columns", [])
    field_id_to_name, select_id_to_name = build_lookup_tables(columns)

    print(f"[scraper] Fields: {len(field_id_to_name)}, Select options: {len(select_id_to_name)}", file=sys.stderr)

    pq      = inner.get("preloadPageQueryResults", {})
    tdb     = pq.get("tableDataById", {})
    if not tdb:
        print("[scraper] ❌ tableDataById is empty.", file=sys.stderr)
        return []

    table_id = list(tdb.keys())[0]
    rows_by_id = tdb[table_id].get("partialRowById", {})
    print(f"[scraper] Raw records in payload: {len(rows_by_id)}", file=sys.stderr)

    rows: list[dict] = []
    for rec_id, rec in rows_by_id.items():
        parsed = parse_row(rec, field_id_to_name, select_id_to_name)
        if parsed:
            rows.append(parsed)

    print(f"[scraper] ✅ Parsed {len(rows)} rows", file=sys.stderr)
    return rows


# ── Entry point ─────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Scrape the Hot Dishes Airtable shared view.")
    parser.add_argument("--output", "-o", metavar="FILE",
                        help="Write JSON to FILE (default: stdout).")
    parser.add_argument("--dump-raw", metavar="FILE",
                        help="Save the raw intercepted Airtable payload to FILE.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Scrape but don't write output — prints first 10 rows to stderr.")
    args = parser.parse_args()

    rows = scrape(dump_raw=args.dump_raw)

    if args.dry_run:
        print(f"\n[scraper] Dry-run — {len(rows)} rows scraped:", file=sys.stderr)
        for r in rows[:10]:
            print(f"  {r['plate']:<10} {r['state']:<3} {r['ice']:<4}  "
                  f"{r.get('color',''):<3}  {r.get('make',''):<20}  "
                  f"{r.get('location',''):<15}  {(r.get('date') or '')[:10]}",
                  file=sys.stderr)
        if len(rows) > 10:
            print(f"  … and {len(rows) - 10} more", file=sys.stderr)
        return

    payload = json.dumps(rows, indent=2)
    if args.output:
        with open(args.output, "w") as f:
            f.write(payload)
        print(f"[scraper] Wrote {len(rows)} rows → {args.output}", file=sys.stderr)
    else:
        print(payload)


if __name__ == "__main__":
    main()

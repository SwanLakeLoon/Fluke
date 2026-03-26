# Schema Normalization: vehicles + sightings

Normalize the flat `alpr_records` table into a proper `vehicles` + `sightings` relational schema, then update all frontend components to use it.

## Proposed Changes

### Backend — PocketBase Migrations

#### [NEW] Migration: Create `vehicles` collection
- Fields: `plate` (unique, required), `state`, `make`, `model`, `color`, `registration`, `vin`, `title_issues`, `searchable` (bool)
- List/View rules: `@request.auth.id != ""`
- Create/Update/Delete rules: admin only (null)

#### [NEW] Migration: Create `sightings` collection
- Fields: `vehicle` (relation → vehicles, required), `location`, `date`, `ice`, `match_status`, `plate_confidence`, `notes`
- List/View rules: `@request.auth.id != ""`
- Create/Update/Delete rules: admin only (null)

#### [NEW] Migration script: `scripts/migrate_to_normalized.py`
A one-time Python script (using `uv`) that:
1. Reads all `alpr_records` rows (sorted by date desc so the newest is first)
2. For each unique plate: creates one `vehicles` row using the most recent record's attributes
3. For each `alpr_records` row: creates a `sightings` row linked to the vehicle

> [!IMPORTANT]
> The old `alpr_records`, `plate_stats`, and `enhanced_plate_stats` collections will **not** be deleted automatically. They will remain intact as a safety net until you confirm the migration is clean. You can drop them later.

---

### Frontend — Component Updates

#### [MODIFY] [client.js](file:///Users/kattraxler/code/project-maven/frontend/src/api/client.js)
No changes needed — PocketBase client is generic.

#### [DELETE] [groupSightings.js](file:///Users/kattraxler/code/project-maven/frontend/src/utils/groupSightings.js)
No longer needed — PocketBase's `expand` parameter handles the join natively.

#### [MODIFY] [Search.jsx](file:///Users/kattraxler/code/project-maven/frontend/src/pages/Search.jsx)
- Query `vehicles` collection with `expand=sightings(vehicle)` 
- Remove `enhanced_plate_stats` usage and `groupBySightings` call
- Filter by plate, state, vin directly on vehicles
- Filter by ice, match_status, location on expanded sightings client-side (or use back-relation filters)
- Sightings count filter: use `@sightings(vehicle).id ?> 0` style PB back-relation counting

#### [MODIFY] [RecordManager.jsx](file:///Users/kattraxler/code/project-maven/frontend/src/pages/admin/RecordManager.jsx)
- Paginate over `vehicles` collection (one row per plate — exactly what the user wants)
- Expand sightings via `expand=sightings(vehicle)`
- Searchable toggle: single update on the `vehicles` row
- Accordion expand: show sightings sub-rows from the expanded relation
- Inline edit on sightings: update `sightings` collection directly
- Delete: delete individual sightings or the whole vehicle

#### [MODIFY] [CsvUpload.jsx](file:///Users/kattraxler/code/project-maven/frontend/src/pages/admin/CsvUpload.jsx)
- On import: look up or create a `vehicles` row for each plate
- Create a `sightings` row linked to the vehicle
- Duplicate check: query `sightings` where `vehicle.plate = X AND date = Y AND location = Z`

#### [MODIFY] [ApprovalQueue.jsx](file:///Users/kattraxler/code/project-maven/frontend/src/pages/admin/ApprovalQueue.jsx)
- Same pattern as CsvUpload: look up or create vehicle, then create sighting

#### [MODIFY] [DuplicateReview.jsx](file:///Users/kattraxler/code/project-maven/frontend/src/pages/admin/DuplicateReview.jsx)
- "Keep Both" → creates a new sighting under the existing vehicle
- "Replace Existing" → updates the existing sighting row
- `existing_record_id` field on `duplicate_queue` now points to a sighting ID

#### [MODIFY] [VehicleCard.jsx](file:///Users/kattraxler/code/project-maven/frontend/src/components/VehicleCard.jsx)
- Minor: access `vehicle.expand['sightings(vehicle)']` instead of `vehicle.sightings`

---

## Execution Order

1. Create `vehicles` + `sightings` PB migrations and apply them
2. Write and run the data migration script  
3. Update `CsvUpload.jsx` and `ApprovalQueue.jsx` (ingestion path)
4. Update `RecordManager.jsx` (admin view)
5. Update `Search.jsx` and `VehicleCard.jsx` (public search)
6. Update `DuplicateReview.jsx`
7. Remove `groupSightings.js`
8. Verify end-to-end

## Verification Plan

### Browser Testing (via browser tool)
1. **Records Manager**: Navigate to `/records`, confirm vehicles load as grouped rows, expand one to see sightings, toggle Searchable and verify it persists on reload
2. **CSV Upload**: Upload a small test CSV, confirm vehicles are created/reused and sightings are linked
3. **Search**: Navigate to `/search`, filter by plate and sightings count, confirm VehicleCard renders correctly
4. **Duplicate Detection**: Re-upload the same CSV, confirm duplicates are routed to the duplicate queue

### Manual Verification (by you)
- After migration: spot-check in the PocketBase admin panel (`http://127.0.0.1:8090/_/`) that `vehicles` and `sightings` tables have the expected row counts
- Confirm the old `alpr_records` table is untouched as a backup

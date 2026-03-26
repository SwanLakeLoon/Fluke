/**
 * ingestPipeline.js
 *
 * Shared ingest logic for both CsvUpload and ApprovalQueue.
 * Accepts a PocketBase client (pb) as a parameter so it can be
 * easily swapped for a mock in tests.
 */

/**
 * Find an existing vehicle by plate, or create a new one.
 * If the vehicle exists but is missing fields present in the record,
 * those fields are backfilled via PATCH.
 *
 * @param {object} pb - PocketBase SDK client
 * @param {object} record - Mapped row data
 * @returns {object} vehicle record
 */
export async function findOrCreateVehicle(pb, record) {
  let vehicle;
  try {
    vehicle = await pb
      .collection('vehicles')
      .getFirstListItem(`plate = "${record.plate.replace(/"/g, '\\"')}"`);

    // Backfill missing fields
    const updates = {};
    if (record.searchable && !vehicle.searchable) updates.searchable = true;
    if (record.vin && !vehicle.vin) updates.vin = record.vin;
    if (record.title_issues && !vehicle.title_issues) updates.title_issues = record.title_issues;
    if (record.make && !vehicle.make) updates.make = record.make;
    if (record.model && !vehicle.model) updates.model = record.model;
    if (record.color && !vehicle.color) updates.color = record.color;
    if (record.state && !vehicle.state) updates.state = record.state;
    if (record.registration && !vehicle.registration) updates.registration = record.registration;

    if (Object.keys(updates).length > 0) {
      vehicle = await pb.collection('vehicles').update(vehicle.id, updates);
    }
  } catch {
    // Not found — create new vehicle
    vehicle = await pb.collection('vehicles').create({
      plate: record.plate,
      state: record.state,
      make: record.make,
      model: record.model,
      color: record.color,
      registration: record.registration,
      vin: record.vin,
      title_issues: record.title_issues,
      searchable: record.searchable ?? false,
    });
  }
  return vehicle;
}

/**
 * Check if a sighting already exists for the given vehicle + location + date.
 *
 * @returns {{ isDup: boolean, existingSightingId: string|null }}
 */
export async function findDuplicateSighting(pb, vehicleId, record) {
  const filterParts = [`vehicle = "${vehicleId}"`];
  if (record.location) {
    filterParts.push(`location = "${record.location.replace(/"/g, '\\"')}"`);
  } else {
    filterParts.push('location = ""');
  }

  const check = await pb.collection('sightings').getList(1, 50, {
    filter: filterParts.join(' && '),
  });

  const recDate = record.date ? record.date.substring(0, 10) : null;
  for (const existing of check.items) {
    const exDate = existing.date ? existing.date.substring(0, 10) : null;
    if (exDate === recDate) {
      return { isDup: true, existingSightingId: existing.id };
    }
  }
  return { isDup: false, existingSightingId: null };
}

/**
 * Log a duplicate to the duplicate_queue. Failures here are non-fatal.
 */
export async function logDuplicate(pb, record, sightingId, batchLabel) {
  try {
    await pb.collection('duplicate_queue').create({
      raw_data: record,
      reason: `Duplicate: same plate+date+location (plate=${record.plate})`,
      status: 'pending',
      import_batch: batchLabel,
      ...(sightingId ? { existing_record_id: sightingId } : {}),
    });
  } catch (err) {
    // Non-fatal: logging failure should never block ingestion
    console.warn('Could not log to duplicate_queue:', err);
  }
}

/**
 * Process a single record through the full ingest pipeline.
 *
 * @param {object} pb - PocketBase client
 * @param {object} record - Mapped row data
 * @param {string} batchLabel - Human-readable label for import_batch field
 * @returns {{ result: 'inserted'|'duplicate'|'error', error?: Error }}
 */
export async function ingestRecord(pb, record, batchLabel) {
  try {
    const vehicle = await findOrCreateVehicle(pb, record);
    const { isDup, existingSightingId } = await findDuplicateSighting(pb, vehicle.id, record);

    if (isDup) {
      await logDuplicate(pb, record, existingSightingId, batchLabel);
      return { result: 'duplicate' };
    }

    await pb.collection('sightings').create({
      vehicle: vehicle.id,
      location: record.location,
      date: record.date || null,
      ice: record.ice,
      match_status: record.match_status,
      plate_confidence: record.plate_confidence || 0,
      notes: record.notes,
    });

    return { result: 'inserted' };
  } catch (err) {
    return { result: 'error', error: err };
  }
}

/**
 * Process an array of records and return aggregate counts.
 *
 * @param {object} pb
 * @param {Array} records
 * @param {string} batchLabel
 * @returns {{ inserted: number, dupsQueued: number, errors: number }}
 */
export async function processBatch(pb, records, batchLabel) {
  let inserted = 0, dupsQueued = 0, errors = 0;
  let firstError = null;
  for (const record of records) {
    const { result, error } = await ingestRecord(pb, record, batchLabel);
    if (result === 'inserted') inserted++;
    else if (result === 'duplicate') dupsQueued++;
    else {
      errors++;
      if (!firstError && error) {
        firstError = error;
        console.error('[ingestPipeline] First error (plate=%s):', record.plate, error?.message, error);
      }
    }
  }
  return { inserted, dupsQueued, errors, firstError };
}

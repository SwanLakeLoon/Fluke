/**
 * ingestPipeline.js
 *
 * Shared ingest logic for both CsvUpload and ApprovalQueue.
 * Accepts a PocketBase client (pb) as a parameter so it can be
 * easily swapped for a mock in tests.
 *
 * 3-tier architecture: VIN → Vehicle → Sighting
 */

/**
 * Find an existing VIN record, or create a new one.
 *
 * @param {object} pb - PocketBase SDK client
 * @param {string} vin - The VIN string
 * @param {string} titleIssues - Title issues text
 * @returns {object|null} VIN record, or null if no vin provided
 */
export async function findOrCreateVin(pb, vin, titleIssues) {
  if (!vin) return null;

  try {
    const existing = await pb
      .collection('vins')
      .getFirstListItem(`vin = "${vin.replace(/"/g, '\\"')}"`);

    // Backfill title_issues if missing
    if (titleIssues && !existing.title_issues) {
      return await pb.collection('vins').update(existing.id, { title_issues: titleIssues });
    }
    return existing;
  } catch {
    // Not found — create
    return await pb.collection('vins').create({
      vin,
      title_issues: titleIssues || '',
    });
  }
}

/**
 * Find an existing vehicle by plate, or create a new one.
 * If the vehicle exists but is missing fields present in the record,
 * those fields are backfilled via PATCH.
 *
 * @param {object} pb - PocketBase SDK client
 * @param {object} record - Mapped row data
 * @param {string|null} vinRelationId - ID of the VIN record (or null)
 * @returns {object} vehicle record
 */
export async function findOrCreateVehicle(pb, record, vinRelationId) {
  let vehicle;
  const isPhysical = record.vin_source === 'Vehicle VIN';

  try {
    vehicle = await pb
      .collection('vehicles')
      .getFirstListItem(`plate = "${record.plate.replace(/"/g, '\\"')}"`);

    // Backfill missing fields
    const updates = {};
    if (record.searchable && !vehicle.searchable) updates.searchable = true;
    // Route VIN to the correct relation field based on source
    if (isPhysical) {
      if (vinRelationId && !vehicle.physical_vin_relation) updates.physical_vin_relation = vinRelationId;
    } else {
      if (vinRelationId && !vehicle.vin_relation) updates.vin_relation = vinRelationId;
    }
    if (record.make         && !vehicle.make)         updates.make = record.make;
    if (record.model        && !vehicle.model)        updates.model = record.model;
    if (record.color        && !vehicle.color)        updates.color = record.color;
    if (record.state        && !vehicle.state)        updates.state = record.state;
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
      vin_relation:          isPhysical ? '' : (vinRelationId || ''),
      physical_vin_relation: isPhysical ? (vinRelationId || '') : '',
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
  // Normalize date comparison string (YYYY-MM-DD)
  const recDate = record.date ? record.date.substring(0, 10) : null;

  const filterParts = [`vehicle = "${vehicleId}"`];
  if (record.location) {
    filterParts.push(`location = "${record.location.replace(/"/g, '\\"')}"`);
  } else {
    filterParts.push('location = ""');
  }

  const check = await pb.collection('sightings').getList(1, 50, {
    filter: filterParts.join(' && '),
  });

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
 * Process a single record through the full 3-tier ingest pipeline.
 *
 * @param {object} pb - PocketBase client
 * @param {object} record - Mapped row data
 * @param {string} batchLabel - Human-readable label for import_batch field
 * @returns {{ result: 'inserted'|'duplicate'|'error', error?: Error }}
 */
export async function ingestRecord(pb, record, batchLabel) {
  try {
    // Phase 1: VIN
    const vinRecord = await findOrCreateVin(pb, record.vin, record.title_issues);
    const vinRelationId = vinRecord ? vinRecord.id : null;

    // Phase 2: Vehicle
    const vehicle = await findOrCreateVehicle(pb, record, vinRelationId);

    // Phase 3: Sighting
    const { isDup, existingSightingId } = await findDuplicateSighting(pb, vehicle.id, record);

    if (isDup) {
      // Vehicle VIN rows auto-merge with existing sightings — no duplicate queue entry.
      // For regular Plate VIN rows, queue for approver review as normal.
      if (record.vin_source === 'Vehicle VIN') {
        return { result: 'inserted' }; // silently merged
      }
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

export async function processBatch(pb, records, batchLabel, concurrency = 8) {
  // ── Phase 0: location auto-normalization ──────────────────────────────────
  // Fetch all location_mappings once and rewrite record locations in-place.
  // This is best-effort — if the collection doesn't exist yet, we skip silently.
  try {
    const mappings = await pb.collection('location_mappings').getFullList({
      expand: 'managed_location',
    });
    const locationMap = new Map(); // raw_value → canonical name
    for (const m of mappings) {
      const raw = m.raw_value;
      const canonical = m.expand?.managed_location?.name;
      if (raw && canonical) locationMap.set(raw, canonical);
    }
    if (locationMap.size > 0) {
      for (const record of records) {
        const loc = record.location || '';
        if (loc && locationMap.has(loc)) {
          record.location = locationMap.get(loc);
        }
      }
    }
  } catch {
    // Non-fatal: collection may not exist in older deployments
  }

  // ── Phase 1: build VIN cache ─────────────────────────────────────────────
  const uniqueVins = [...new Set(records.map(r => r.vin).filter(Boolean))];
  const vinCache = new Map(); // vin string → vin record

  await Promise.all(
    uniqueVins.map(async (vin) => {
      try {
        const v = await pb
          .collection('vins')
          .getFirstListItem(`vin = "${vin.replace(/"/g, '\\"')}"`);
        vinCache.set(vin, v);
      } catch {
        vinCache.set(vin, null); // null = needs creation
      }
    })
  );

  for (const vin of uniqueVins) {
    if (vinCache.get(vin) === null) {
      try {
        const firstRec = records.find(r => r.vin === vin);
        const newVin = await pb.collection('vins').create({
          vin,
          title_issues: firstRec.title_issues || '',
        });
        vinCache.set(vin, newVin);
      } catch (err) {
        vinCache.set(vin, err);
      }
    }
  }

  // ── Phase 2: build vehicle cache ─────────────────────────────────────────
  const uniquePlates = [...new Set(records.map(r => r.plate).filter(Boolean))];
  const vehicleCache = new Map(); // plate → vehicle record

  await Promise.all(
    uniquePlates.map(async (plate) => {
      try {
        const v = await pb
          .collection('vehicles')
          .getFirstListItem(`plate = "${plate.replace(/"/g, '\\"')}"`);
        vehicleCache.set(plate, v);
      } catch {
        vehicleCache.set(plate, null); // null = needs creation
      }
    })
  );

  for (const plate of uniquePlates) {
    if (vehicleCache.get(plate) === null) {
      try {
        const firstRec = records.find(r => r.plate === plate);
        const isPhysical = firstRec.vin_source === 'Vehicle VIN';
        let vinRelationId = null;
        if (firstRec.vin) {
          const vinEntry = vinCache.get(firstRec.vin);
          if (vinEntry instanceof Error) throw vinEntry;
          vinRelationId = vinEntry?.id || null;
        }
        
        const newVeh = await pb.collection('vehicles').create({
          plate:                 firstRec.plate,
          state:                 firstRec.state,
          make:                  firstRec.make,
          model:                 firstRec.model,
          color:                 firstRec.color,
          registration:          firstRec.registration,
          vin_relation:          isPhysical ? '' : (vinRelationId || ''),
          physical_vin_relation: isPhysical ? (vinRelationId || '') : '',
          searchable:            firstRec.searchable ?? false,
        });
        vehicleCache.set(plate, newVeh);
      } catch (err) {
        vehicleCache.set(plate, err);
      }
    }
  }

  // ── Phase 2.5: build sighting cache (single batch fetch) ──────────────────
  // Pre-fetch ALL existing sightings for the known vehicles in one query
  // instead of doing N individual getList calls per record.
  // Key format: "vehicleId|YYYY-MM-DD|location" → sighting id
  const sightingCache = new Map();

  const validVehicleIds = [...vehicleCache.values()]
    .filter(v => v && !(v instanceof Error))
    .map(v => v.id);

  if (validVehicleIds.length > 0) {
    try {
      // Fetch in batches of 30 vehicle IDs to avoid overly long filter strings
      const VEHICLE_BATCH_SIZE = 30;
      for (let vi = 0; vi < validVehicleIds.length; vi += VEHICLE_BATCH_SIZE) {
        const vIdBatch = validVehicleIds.slice(vi, vi + VEHICLE_BATCH_SIZE);
        const sightFilter = vIdBatch.map(id => `vehicle = "${id}"`).join(' || ');
        const existingSightings = await pb.collection('sightings').getFullList({
          filter: sightFilter,
          fields: 'id,vehicle,date,location',
        });
        for (const s of existingSightings) {
          const dateStr = s.date ? s.date.substring(0, 10) : '';
          const key = `${s.vehicle}|${dateStr}|${s.location || ''}`;
          sightingCache.set(key, s.id);
        }
      }
    } catch (err) {
      console.warn('[ingestPipeline] Sighting cache pre-fetch failed, falling back to per-record checks:', err);
      // sightingCache stays empty — ingestRecordCached will fall back to individual queries
    }
  }

  // ── Phase 3: process sightings concurrently in chunks ────────────────────
  let inserted = 0, dupsQueued = 0, errors = 0;
  let firstError = null;

  // Track sightings "in-flight" or already processed in this batch to prevent race conditions
  // Key format: "plate|YYYY-MM-DD|location" → sighting ID (or true if pending)
  const inBatchSightings = new Map();

  for (let i = 0; i < records.length; i += concurrency) {
    const chunk = records.slice(i, i + concurrency);

    const results = await Promise.all(
      chunk.map(async record => {
        const dateStr = (record.date || '').substring(0, 10);
        const sightingKey = `${record.plate}|${dateStr}|${record.location || ''}`;
        
        // Internal duplicate check — but Vehicle VIN rows skip this guard
        // so they can auto-merge inside ingestRecordCached instead of being queued.
        if (record.vin_source !== 'Vehicle VIN' && inBatchSightings.has(sightingKey)) {
          const pendingPromise = inBatchSightings.get(sightingKey);
          const existingId = pendingPromise ? await pendingPromise : null;
          await logDuplicate(pb, record, existingId, `Internal duplicate in same batch: ${batchLabel}`);
          return { result: 'duplicate' };
        }
        
        let resolveSightingId;
        const pendingPromise = new Promise(resolve => resolveSightingId = resolve);
        // Only register in the inBatchSightings map for non-Vehicle-VIN rows
        if (record.vin_source !== 'Vehicle VIN') {
          inBatchSightings.set(sightingKey, pendingPromise);
        }
        
        const outcome = await ingestRecordCached(pb, record, batchLabel, vinCache, vehicleCache, sightingCache);
        
        // Resolve the promise so any waiting internal duplicates can get the ID
        if (outcome.result === 'inserted' && outcome.sightingId) {
          resolveSightingId(outcome.sightingId);
        } else {
          resolveSightingId(null);
        }
        
        return outcome;
      })
    );

    for (const { result, error } of results) {
      if (result === 'inserted') inserted++;
      else if (result === 'duplicate') dupsQueued++;
      else {
        errors++;
        if (!firstError && error) {
          firstError = error;
          console.error('[ingestPipeline] First error (plate=%s):', error?.plate, error?.message, error);
        }
      }
    }
  }

  return { inserted, dupsQueued, errors, firstError };
}

/**
 * Internal: process one record using the pre-built caches.
 * Caches are fully populated by this point.
 */
async function ingestRecordCached(pb, record, batchLabel, vinCache, vehicleCache, sightingCache) {
  try {
    // ── VIN backfill phase ─────────────────────────────────────────────────
    let vinRelationId = null;
    if (record.vin) {
      let vinRec = vinCache.get(record.vin);
      if (vinRec instanceof Error) throw vinRec;
      if (vinRec && record.title_issues && !vinRec.title_issues) {
        vinRec = await pb.collection('vins').update(vinRec.id, { title_issues: record.title_issues });
        vinCache.set(record.vin, vinRec);
      }
      vinRelationId = vinRec.id;
    }

    // ── Vehicle backfill phase ─────────────────────────────────────────────
    let vehicle = vehicleCache.get(record.plate);
    if (vehicle instanceof Error) throw vehicle;
    if (vehicle) {
      const isPhysical = record.vin_source === 'Vehicle VIN';
      const updates = {};
      if (record.searchable && !vehicle.searchable) updates.searchable = true;
      // Route VIN backfill to correct field based on source
      if (isPhysical) {
        if (vinRelationId && !vehicle.physical_vin_relation) updates.physical_vin_relation = vinRelationId;
      } else {
        if (vinRelationId && !vehicle.vin_relation) updates.vin_relation = vinRelationId;
      }
      if (record.make         && !vehicle.make)         updates.make = record.make;
      if (record.model        && !vehicle.model)        updates.model = record.model;
      if (record.color        && !vehicle.color)        updates.color = record.color;
      if (record.state        && !vehicle.state)        updates.state = record.state;
      if (record.registration && !vehicle.registration) updates.registration = record.registration;
      
      if (Object.keys(updates).length > 0) {
        const updatedVehicle = await pb.collection('vehicles').update(vehicle.id, updates);
        if (updatedVehicle) vehicle = updatedVehicle;
        vehicleCache.set(record.plate, vehicle);
      }
    }

    // ── Sighting phase (cache-first, fallback to DB query) ─────────────────
    const dateStr = record.date ? record.date.substring(0, 10) : '';
    const cacheKey = `${vehicle.id}|${dateStr}|${record.location || ''}`;

    let isDup = false;
    let existingSightingId = null;

    if (sightingCache.has(cacheKey)) {
      // Cache hit — known duplicate
      isDup = true;
      existingSightingId = sightingCache.get(cacheKey);
    } else if (sightingCache.size === 0) {
      // Cache empty (pre-fetch failed or no existing vehicles) — fall back to per-record query
      const dbResult = await findDuplicateSighting(pb, vehicle.id, record);
      isDup = dbResult.isDup;
      existingSightingId = dbResult.existingSightingId;
    }
    // If cache is populated and key is absent → not a dup (no DB call needed)

    if (isDup) {
      // Vehicle VIN rows auto-merge with existing sightings — no duplicate queue.
      if (record.vin_source === 'Vehicle VIN') {
        return { result: 'inserted' }; // silently merged
      }
      await logDuplicate(pb, record, existingSightingId, batchLabel);
      return { result: 'duplicate' };
    }

    const newSighting = await pb.collection('sightings').create({
      vehicle:          vehicle.id,
      location:         record.location,
      date:             record.date || null,
      ice:              record.ice,
      match_status:     record.match_status,
      plate_confidence: record.plate_confidence || 0,
      notes:            record.notes,
    });

    // Add to cache so later records in same batch detect this as existing
    sightingCache.set(cacheKey, newSighting.id);

    return { result: 'inserted', sightingId: newSighting.id };
  } catch (err) {
    return { result: 'error', error: err };
  }
}

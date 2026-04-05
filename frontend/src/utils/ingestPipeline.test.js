/**
 * ingestPipeline.test.js
 *
 * Comprehensive unit tests for the ingest pipeline.
 * Uses vi.fn() mocks for the PocketBase client — no live database required.
 *
 * Scenarios covered:
 *  1. New plate, no existing sightings → inserted
 *  2. Known plate, vehicle already exists → re-uses vehicle, inserted
 *  3. Known plate, vehicle exists with missing fields → PATCH called, inserted
 *  4. Same plate + date + location already in sightings → duplicate
 *  5. Same plate + date, different location → inserted (not a dup)
 *  6. Null date on both record and existing sighting → duplicate
 *  7. duplicate_queue create throws → still counted as duplicate, no error
 *  8. sightings.create throws unexpectedly → error
 *  9. vehicles.create throws (after getFirstListItem also throws) → error
 * 10. processBatch aggregates counts correctly across mixed records
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  findOrCreateVin,
  findOrCreateVehicle,
  findDuplicateSighting,
  ingestRecord,
  processBatch,
} from './ingestPipeline.js';

// ---------------------------------------------------------------------------
// Helpers to build mock PocketBase clients
// ---------------------------------------------------------------------------

/** Creates a minimal mock pb.collection() factory. */
function makePb({ vehicles = {}, sightings = {}, duplicate_queue = {}, vins = {} } = {}) {
  const colMocks = {
    vehicles: {
      getFirstListItem: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      ...vehicles,
    },
    vins: {
      getFirstListItem: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      ...vins,
    },
    sightings: {
      getFullList: vi.fn().mockResolvedValue([]),
      getList: vi.fn(),
      create: vi.fn(),
      ...sightings,
    },
    duplicate_queue: {
      create: vi.fn(),
      ...duplicate_queue,
    },
  };
  return {
    collection: (name) => colMocks[name],
    // Expose raw mocks for assertions
    _mocks: colMocks,
  };
}

/** A minimal valid record representing one mapped CSV row. */
const baseRecord = {
  plate: 'ABC123',
  state: 'CA',
  make: 'Toyota',
  model: 'Camry',
  color: 'WH',
  ice: 'N',
  location: 'Main St',
  date: '2024-03-01T00:00:00.000Z',
  registration: '',
  vin: '',
  title_issues: '',
  match_status: '',
  plate_confidence: 0.95,
  notes: '',
  searchable: true,
};

const existingVehicle = { id: 'veh001', plate: 'ABC123', state: 'CA', make: '', model: '', searchable: false };

// ---------------------------------------------------------------------------
// findOrCreateVehicle
// ---------------------------------------------------------------------------

describe('findOrCreateVehicle', () => {
  it('1 — creates a new vehicle when none exists', async () => {
    const pb = makePb();
    pb._mocks.vehicles.getFirstListItem.mockRejectedValue(new Error('Not found'));
    pb._mocks.vehicles.create.mockResolvedValue({ id: 'new001', plate: 'ABC123' });

    const v = await findOrCreateVehicle(pb, baseRecord);

    expect(pb._mocks.vehicles.create).toHaveBeenCalledOnce();
    expect(pb._mocks.vehicles.create).toHaveBeenCalledWith(expect.objectContaining({
      plate: 'ABC123',
      state: 'CA',
      searchable: true,
    }));
    expect(v.id).toBe('new001');
  });

  it('2 — returns existing vehicle when found, no create called', async () => {
    const pb = makePb();
    // Vehicle exists AND all fields already populated so no update needed
    const fullVehicle = { ...existingVehicle, make: 'Toyota', model: 'Camry', color: 'WH', searchable: true };
    pb._mocks.vehicles.getFirstListItem.mockResolvedValue(fullVehicle);
    pb._mocks.vehicles.update.mockResolvedValue({});

    const v = await findOrCreateVehicle(pb, { ...baseRecord, make: 'Toyota', model: 'Camry', color: 'WH', searchable: true });

    expect(pb._mocks.vehicles.create).not.toHaveBeenCalled();
    expect(pb._mocks.vehicles.update).not.toHaveBeenCalled();
    expect(v.id).toBe('veh001');
  });

  it('3 — patches missing fields on existing vehicle when record has them', async () => {
    const pb = makePb();
    // Vehicle exists but make/model are empty
    pb._mocks.vehicles.getFirstListItem.mockResolvedValue({ ...existingVehicle });
    pb._mocks.vehicles.update.mockResolvedValue({ ...existingVehicle, make: 'Toyota', model: 'Camry' });

    const v = await findOrCreateVehicle(pb, { ...baseRecord, make: 'Toyota', model: 'Camry' });

    expect(pb._mocks.vehicles.update).toHaveBeenCalledOnce();
    expect(pb._mocks.vehicles.update).toHaveBeenCalledWith('veh001', expect.objectContaining({
      make: 'Toyota',
      model: 'Camry',
    }));
    expect(pb._mocks.vehicles.create).not.toHaveBeenCalled();
    expect(v.make).toBe('Toyota');
  });
});

// ---------------------------------------------------------------------------
// findDuplicateSighting
// ---------------------------------------------------------------------------

describe('findDuplicateSighting', () => {
  it('4 — detects a duplicate: same vehicle + date + location already in sightings', async () => {
    const pb = makePb();
    pb._mocks.sightings.getList.mockResolvedValue({
      items: [{ id: 'sighting001', date: '2024-03-01T12:00:00.000Z' }],
    });

    const result = await findDuplicateSighting(pb, 'veh001', baseRecord);

    expect(result.isDup).toBe(true);
    expect(result.existingSightingId).toBe('sighting001');
  });

  it('5 — not a dup: same plate + date but different location', async () => {
    const pb = makePb();
    // Sightings query filters by vehicle+location — if location differs the filter
    // won't return the old record. Simulate empty result.
    pb._mocks.sightings.getList.mockResolvedValue({ items: [] });

    const result = await findDuplicateSighting(pb, 'veh001', {
      ...baseRecord,
      location: 'Other St',
    });

    expect(result.isDup).toBe(false);
    expect(result.existingSightingId).toBeNull();
  });

  it('6 — treats null date on both record and existing sighting as a duplicate', async () => {
    const pb = makePb();
    pb._mocks.sightings.getList.mockResolvedValue({
      items: [{ id: 'sighting002', date: null }],
    });

    const result = await findDuplicateSighting(pb, 'veh001', { ...baseRecord, date: null });

    expect(result.isDup).toBe(true);
    expect(result.existingSightingId).toBe('sighting002');
  });
});

// ---------------------------------------------------------------------------
// ingestRecord - full pipeline
// ---------------------------------------------------------------------------

describe('ingestRecord', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns inserted for a clean new record', async () => {
    const pb = makePb();
    pb._mocks.vehicles.getFirstListItem.mockRejectedValue(new Error('not found'));
    pb._mocks.vehicles.create.mockResolvedValue({ id: 'v1' });
    pb._mocks.sightings.getList.mockResolvedValue({ items: [] });
    pb._mocks.sightings.create.mockResolvedValue({ id: 's1' });

    const { result } = await ingestRecord(pb, baseRecord, 'batch-label');

    expect(result).toBe('inserted');
    expect(pb._mocks.sightings.create).toHaveBeenCalledOnce();
    expect(pb._mocks.duplicate_queue.create).not.toHaveBeenCalled();
  });

  it('returns duplicate when sighting already exists', async () => {
    const pb = makePb();
    // Vehicle exists with all fields — no update needed
    const fullVehicle = { id: 'v1', plate: 'ABC123', make: 'Toyota', model: 'Camry', state: 'CA', color: 'WH', searchable: true };
    pb._mocks.vehicles.getFirstListItem.mockResolvedValue(fullVehicle);
    pb._mocks.sightings.getList.mockResolvedValue({
      items: [{ id: 'existing-sighting', date: '2024-03-01T12:00:00.000Z' }],
    });
    pb._mocks.duplicate_queue.create.mockResolvedValue({});

    const { result } = await ingestRecord(pb, baseRecord, 'batch-label');

    expect(result).toBe('duplicate');
    expect(pb._mocks.sightings.create).not.toHaveBeenCalled();
    expect(pb._mocks.duplicate_queue.create).toHaveBeenCalledOnce();
    expect(pb._mocks.duplicate_queue.create).toHaveBeenCalledWith(
      expect.objectContaining({ existing_record_id: 'existing-sighting' })
    );
  });

  it('7 — duplicate_queue.create failure is non-fatal: still returns duplicate', async () => {
    const pb = makePb();
    const fullVehicle = { id: 'v1', plate: 'ABC123', make: 'Toyota', model: 'Camry', state: 'CA', color: 'WH', searchable: true };
    pb._mocks.vehicles.getFirstListItem.mockResolvedValue(fullVehicle);
    pb._mocks.sightings.getList.mockResolvedValue({
      items: [{ id: 'existing-sighting', date: '2024-03-01T00:00:00Z' }],
    });
    // This is the bug that was causing 16 errors — dup_queue create fails
    pb._mocks.duplicate_queue.create.mockRejectedValue(
      new Error('Failed to find all relation records with the provided ids')
    );

    const { result } = await ingestRecord(pb, baseRecord, 'batch-label');

    // Must be 'duplicate', NOT 'error'
    expect(result).toBe('duplicate');
    expect(pb._mocks.sightings.create).not.toHaveBeenCalled();
  });

  it('8 — sightings.create failure returns error', async () => {
    const pb = makePb();
    pb._mocks.vehicles.getFirstListItem.mockRejectedValue(new Error('not found'));
    pb._mocks.vehicles.create.mockResolvedValue({ id: 'v1' });
    pb._mocks.sightings.getList.mockResolvedValue({ items: [] });
    pb._mocks.sightings.create.mockRejectedValue(new Error('Database error'));

    const { result, error } = await ingestRecord(pb, baseRecord, 'batch-label');

    expect(result).toBe('error');
    expect(error).toBeDefined();
    expect(error.message).toBe('Database error');
  });

  it('9 — vehicles.create failure after getFirstListItem also throws returns error', async () => {
    const pb = makePb();
    pb._mocks.vehicles.getFirstListItem.mockRejectedValue(new Error('not found'));
    pb._mocks.vehicles.create.mockRejectedValue(new Error('403 Forbidden'));

    const { result, error } = await ingestRecord(pb, baseRecord, 'batch-label');

    expect(result).toBe('error');
    expect(error.message).toBe('403 Forbidden');
  });

  it('provides a VIN relation when record contains VIN', async () => {
    const pb = makePb();
    // Simulate VIN not found, so it creates one
    pb._mocks.vins.getFirstListItem.mockRejectedValue(new Error('not found'));
    pb._mocks.vins.create.mockResolvedValue({ id: 'vin123' });
    
    pb._mocks.vehicles.getFirstListItem.mockRejectedValue(new Error('not found'));
    pb._mocks.vehicles.create.mockResolvedValue({ id: 'v1' });
    pb._mocks.sightings.getList.mockResolvedValue({ items: [] });
    pb._mocks.sightings.create.mockResolvedValue({ id: 's1' });

    const { result } = await ingestRecord(pb, { ...baseRecord, vin: 'TESTVIN', title_issues: 'Salvage' }, 'batch-label');

    expect(result).toBe('inserted');
    expect(pb._mocks.vins.create).toHaveBeenCalledOnce();
    expect(pb._mocks.vins.create).toHaveBeenCalledWith(expect.objectContaining({ vin: 'TESTVIN', title_issues: 'Salvage' }));
    expect(pb._mocks.vehicles.create).toHaveBeenCalledWith(expect.objectContaining({ vin_relation: 'vin123' }));
  });
});

// ---------------------------------------------------------------------------
// processBatch - aggregate counts
// ---------------------------------------------------------------------------

describe('processBatch', () => {
  it('10 — correctly tallies inserted, dupsQueued, errors across mixed records', async () => {
    const record1 = { ...baseRecord, plate: 'AAA001', date: '2024-01-01T00:00:00Z' }; // → inserted
    const record2 = { ...baseRecord, plate: 'BBB002', date: '2024-01-02T00:00:00Z' }; // → duplicate
    const record3 = { ...baseRecord, plate: 'CCC003', date: '2024-01-03T00:00:00Z' }; // → error

    const pb = makePb();

    // Phase 1 vehicle lookup: dispatch by plate value (safe for concurrent Promise.all)
    pb._mocks.vehicles.getFirstListItem.mockImplementation((filter) => {
      if (filter.includes('BBB002')) {
        return Promise.resolve({
          id: 'v2', plate: 'BBB002', make: 'Ford', model: 'F150',
          state: 'TX', color: 'BK', searchable: true,
        });
      }
      return Promise.reject(new Error('not found')); // AAA001 and CCC003
    });

    // Phase 2 vehicle creation: dispatch by plate value
    pb._mocks.vehicles.create.mockImplementation((data) => {
      if (data.plate === 'CCC003') return Promise.reject(new Error('403 Forbidden'));
      return Promise.resolve({ id: 'v1', plate: data.plate }); // AAA001
    });

    // Sighting dup checks: dispatch by vehicleId
    pb._mocks.sightings.getList.mockImplementation((page, size, opts) => {
      if (opts?.filter?.includes('v2')) {
        // BBB002 vehicle → dup
        return Promise.resolve({ items: [{ id: 's_old', date: '2024-01-02T08:00:00Z' }] });
      }
      return Promise.resolve({ items: [] }); // AAA001 → not dup
    });

    pb._mocks.sightings.create.mockResolvedValue({ id: 'new-sighting' });
    pb._mocks.duplicate_queue.create.mockResolvedValue({});

    const counts = await processBatch(pb, [record1, record2, record3], 'test-batch');

    expect(counts.inserted).toBe(1);
    expect(counts.dupsQueued).toBe(1);
    expect(counts.errors).toBe(1);
  });

  it('11 — handles internal duplicates in the same batch (race condition preventer)', async () => {
    // Two identical records in the same batch
    const record1 = { ...baseRecord, plate: 'DUP123', date: '2024-05-01T12:00:00Z' };
    const record2 = { ...baseRecord, plate: 'DUP123', date: '2024-05-01T12:00:00Z' };

    const pb = makePb();

    // Vehicle lookup fails (new vehicle)
    pb._mocks.vehicles.getFirstListItem.mockRejectedValue(new Error('not found'));
    pb._mocks.vehicles.create.mockResolvedValue({ id: 'v1', plate: 'DUP123' });

    // Sighting lookup fails (new sighting)
    pb._mocks.sightings.getList.mockResolvedValue({ items: [] });
    pb._mocks.sightings.create.mockResolvedValue({ id: 's1' });

    const counts = await processBatch(pb, [record1, record2], 'race-test');

    // Should insert 1 and queue 1 as duplicate
    expect(counts.inserted).toBe(1);
    expect(counts.dupsQueued).toBe(1);
    
    // Sighting.create should only be called once because of internal deduplication
    expect(pb._mocks.sightings.create).toHaveBeenCalledOnce();
    // duplicate_queue.create should be called for the second record
    expect(pb._mocks.duplicate_queue.create).toHaveBeenCalledOnce();
    // The duplicate_queue entry must reference the sighting ID of the first record
    expect(pb._mocks.duplicate_queue.create).toHaveBeenCalledWith(
      expect.objectContaining({ existing_record_id: 's1' })
    );
  });

  it('12 — newly inserted sightings are visible to later records in the same batch', async () => {
    // Record 1 inserts. Record 2 is a DB-level dup against a sighting that was
    // created by record 1 in this same batch (not pre-existing in DB).
    // This tests that sightingCache is updated after creation.
    const record1 = { ...baseRecord, plate: 'NEW999', date: '2024-07-01T00:00:00Z', location: 'Whipple' };
    const record2 = { ...baseRecord, plate: 'NEW999', date: '2024-07-01T00:00:00Z', location: 'Whipple' };

    const pb = makePb();

    pb._mocks.vehicles.getFirstListItem.mockRejectedValue(new Error('not found'));
    pb._mocks.vehicles.create.mockResolvedValue({ id: 'v_new', plate: 'NEW999' });
    pb._mocks.sightings.getList.mockResolvedValue({ items: [] });
    pb._mocks.sightings.create.mockResolvedValue({ id: 's_new' });
    pb._mocks.duplicate_queue.create.mockResolvedValue({});

    // Use concurrency=1 to ensure sequential processing so record2
    // sees record1's sighting in the inBatchSightings map
    const counts = await processBatch(pb, [record1, record2], 'cache-test', 1);

    expect(counts.inserted).toBe(1);
    expect(counts.dupsQueued).toBe(1);
    expect(pb._mocks.sightings.create).toHaveBeenCalledOnce();
    // The internal dup should reference the newly created sighting
    expect(pb._mocks.duplicate_queue.create).toHaveBeenCalledWith(
      expect.objectContaining({ existing_record_id: 's_new' })
    );
  });
});

// ---------------------------------------------------------------------------
// findOrCreateVin
// ---------------------------------------------------------------------------

describe('findOrCreateVin', () => {
  it('returns null for empty VIN string', async () => {
    const pb = makePb();
    const result = await findOrCreateVin(pb, '', 'some title issues');
    expect(result).toBeNull();
    expect(pb._mocks.vins.getFirstListItem).not.toHaveBeenCalled();
    expect(pb._mocks.vins.create).not.toHaveBeenCalled();
  });

  it('returns null for undefined VIN', async () => {
    const pb = makePb();
    const result = await findOrCreateVin(pb, undefined, '');
    expect(result).toBeNull();
  });

  it('returns existing VIN record when found', async () => {
    const pb = makePb();
    const existingVin = { id: 'vin001', vin: 'TESTVIN123', title_issues: 'Salvage' };
    pb._mocks.vins.getFirstListItem.mockResolvedValue(existingVin);

    const result = await findOrCreateVin(pb, 'TESTVIN123', '');

    expect(result.id).toBe('vin001');
    expect(pb._mocks.vins.create).not.toHaveBeenCalled();
  });

  it('backfills title_issues on existing VIN if missing', async () => {
    const pb = makePb();
    const existingVin = { id: 'vin001', vin: 'TESTVIN123', title_issues: '' };
    pb._mocks.vins.getFirstListItem.mockResolvedValue(existingVin);
    pb._mocks.vins.update.mockResolvedValue({ ...existingVin, title_issues: 'Salvage' });

    const result = await findOrCreateVin(pb, 'TESTVIN123', 'Salvage');

    expect(pb._mocks.vins.update).toHaveBeenCalledWith('vin001', { title_issues: 'Salvage' });
    expect(result.title_issues).toBe('Salvage');
  });

  it('does NOT overwrite existing title_issues', async () => {
    const pb = makePb();
    const existingVin = { id: 'vin001', vin: 'TESTVIN123', title_issues: 'Already Set' };
    pb._mocks.vins.getFirstListItem.mockResolvedValue(existingVin);

    await findOrCreateVin(pb, 'TESTVIN123', 'New Value');

    expect(pb._mocks.vins.update).not.toHaveBeenCalled();
  });

  it('creates new VIN record when not found', async () => {
    const pb = makePb();
    pb._mocks.vins.getFirstListItem.mockRejectedValue(new Error('not found'));
    pb._mocks.vins.create.mockResolvedValue({ id: 'vin_new', vin: 'NEW123', title_issues: 'Flood' });

    const result = await findOrCreateVin(pb, 'NEW123', 'Flood');

    expect(pb._mocks.vins.create).toHaveBeenCalledWith({ vin: 'NEW123', title_issues: 'Flood' });
    expect(result.id).toBe('vin_new');
  });
});

// ---------------------------------------------------------------------------
// findDuplicateSighting — additional edge cases
// ---------------------------------------------------------------------------

describe('findDuplicateSighting (edge cases)', () => {
  it('treats empty location as matching location=""', async () => {
    const pb = makePb();
    pb._mocks.sightings.getList.mockResolvedValue({
      items: [{ id: 'existing1', date: '2024-03-01T00:00:00Z' }],
    });

    const result = await findDuplicateSighting(pb, 'veh001', {
      ...baseRecord,
      location: '',
    });

    // Verify filter includes location = ""
    const filterArg = pb._mocks.sightings.getList.mock.calls[0][2].filter;
    expect(filterArg).toContain('location = ""');
    expect(result.isDup).toBe(true);
  });

  it('does not match when dates differ even at same vehicle+location', async () => {
    const pb = makePb();
    pb._mocks.sightings.getList.mockResolvedValue({
      items: [{ id: 'existing1', date: '2024-06-15T00:00:00Z' }],
    });

    const result = await findDuplicateSighting(pb, 'veh001', {
      ...baseRecord,
      date: '2024-03-01T00:00:00Z', // different date
    });

    expect(result.isDup).toBe(false);
  });
});

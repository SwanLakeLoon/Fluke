import { useState, useEffect } from 'react';
import { pb } from '../../api/client';
import { findOrCreateVin } from '../../utils/ingestPipeline';
import './AdminPages.css';

export default function DuplicateReview({ embedded = false }) {
  const [dupes, setDupes] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDupes = async () => {
    setLoading(true);
    try {
      const res = await pb.collection('duplicate_queue').getList(1, 50, {
        filter: 'status = "pending"',
        sort: 'status',
      });

      const enriched = await Promise.all(res.items.map(async (dup) => {
        try {
          let existingSightingId = dup.existing_record_id;

          // ── Fallback: if no existing_record_id, find the matching sighting
          //    by plate+location (handles old records from pre-normalized schema)
          if (!existingSightingId && dup.raw_data?.plate) {
            try {
              const vRes = await pb.collection('vehicles').getList(1, 1, {
                filter: `plate = "${dup.raw_data.plate.replace(/"/g, '\\"')}"`,
                fields: 'id',
              });
              if (vRes.items.length > 0) {
                const vid = vRes.items[0].id;
                const loc = dup.raw_data.location || '';
                const sRes = await pb.collection('sightings').getList(1, 1, {
                  filter: `vehicle = "${vid}" && location = "${loc.replace(/"/g, '\\"')}"`,
                  sort: '-date',
                  fields: 'id',
                });
                if (sRes.items.length > 0) existingSightingId = sRes.items[0].id;
              }
            } catch { /* ignore — best effort */ }
          }

          if (!existingSightingId) return dup;

          // ── Fetch the sighting with vehicle expand ────────────────────────
          const sighting = await pb.collection('sightings').getOne(existingSightingId, {
            expand: 'vehicle',
          });

          // ── If expand.vehicle is null, fetch the vehicle directly ─────────
          let vehicle = sighting.expand?.vehicle || null;
          if (!vehicle && sighting.vehicle) {
            try {
              vehicle = await pb.collection('vehicles').getOne(sighting.vehicle);
            } catch { /* vehicle may have been deleted */ }
          }

          return {
            ...dup,
            _existingSighting: sighting,
            _existingVehicle: vehicle,
          };
        } catch {
          return dup; // sighting may have been deleted — show incoming side only
        }
      }));

      setDupes(enriched);
    } catch (e) {
      console.error('Failed to fetch duplicates:', e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchDupes(); }, []);

  const handleKeepBoth = async (dup) => {
    if (!window.confirm("Insert the incoming record as a completely new entry?")) return;
    try {
      // VIN phase
      let vinRelationId = null;
      if (dup.raw_data.vin) {
        const vinRec = await findOrCreateVin(pb, dup.raw_data.vin, dup.raw_data.title_issues);
        vinRelationId = vinRec?.id || null;
      }

      let vehicle;
      try {
        const safePlate = (dup.raw_data.plate || '').replace(/"/g, '\\"');
        vehicle = await pb.collection('vehicles').getFirstListItem(`plate = "${safePlate}"`);
        // Backfill vin_relation if missing
        if (vinRelationId && !vehicle.vin_relation) {
          vehicle = await pb.collection('vehicles').update(vehicle.id, { vin_relation: vinRelationId });
        }
      } catch (e) {
        vehicle = await pb.collection('vehicles').create({
          plate: dup.raw_data.plate, state: dup.raw_data.state, make: dup.raw_data.make,
          model: dup.raw_data.model, color: dup.raw_data.color, registration: dup.raw_data.registration,
          vin_relation: vinRelationId || '', searchable: dup.raw_data.searchable ?? false,
        });
      }
      await pb.collection('sightings').create({
        vehicle: vehicle.id, location: dup.raw_data.location, date: dup.raw_data.date || null,
        ice: dup.raw_data.ice, match_status: dup.raw_data.match_status, plate_confidence: dup.raw_data.plate_confidence || 0,
        notes: dup.raw_data.notes,
      });
      await pb.collection('duplicate_queue').update(dup.id, { status: 'approved' });
      setDupes(prev => prev.filter(d => d.id !== dup.id));
    } catch (e) {
      console.error('Keep Both failed:', e);
      alert('Failed: ' + e.message);
    }
  };

  const handleReplace = async (dup) => {
    if (!window.confirm("Overwrite the existing database record with the incoming data?")) return;
    try {
      // VIN phase
      let vinRelationId = null;
      if (dup.raw_data.vin) {
        const vinRec = await findOrCreateVin(pb, dup.raw_data.vin, dup.raw_data.title_issues);
        vinRelationId = vinRec?.id || null;
      }

      if (dup.existing_record_id) {
        // Fetch FIRST to get vehicle FK, then write
        const existingSighting = await pb.collection('sightings').getOne(dup.existing_record_id);
        await pb.collection('sightings').update(dup.existing_record_id, {
          location: dup.raw_data.location, date: dup.raw_data.date || null,
          ice: dup.raw_data.ice, match_status: dup.raw_data.match_status,
          plate_confidence: dup.raw_data.plate_confidence || 0, notes: dup.raw_data.notes,
        });
        await pb.collection('vehicles').update(existingSighting.vehicle, {
          state: dup.raw_data.state, make: dup.raw_data.make, model: dup.raw_data.model, 
          color: dup.raw_data.color, registration: dup.raw_data.registration,
          vin_relation: vinRelationId || '',
        });
      } else {
        let vehicle;
        try {
          const safePlate = (dup.raw_data.plate || '').replace(/"/g, '\\"');
          vehicle = await pb.collection('vehicles').getFirstListItem(`plate = "${safePlate}"`);
        } catch (e) {
          vehicle = await pb.collection('vehicles').create({
            plate: dup.raw_data.plate, state: dup.raw_data.state, make: dup.raw_data.make,
            model: dup.raw_data.model, color: dup.raw_data.color, registration: dup.raw_data.registration,
            vin_relation: vinRelationId || '', searchable: dup.raw_data.searchable ?? false,
          });
        }
        await pb.collection('sightings').create({
          vehicle: vehicle.id, location: dup.raw_data.location, date: dup.raw_data.date || null,
          ice: dup.raw_data.ice, match_status: dup.raw_data.match_status, plate_confidence: dup.raw_data.plate_confidence || 0,
          notes: dup.raw_data.notes,
        });
      }
      await pb.collection('duplicate_queue').update(dup.id, { status: 'approved' });
      setDupes(prev => prev.filter(d => d.id !== dup.id));
    } catch (e) {
      console.error('Replace failed:', e);
      alert('Failed: ' + e.message);
    }
  };

  const handleReject = async (dup) => {
    try {
      await pb.collection('duplicate_queue').update(dup.id, { status: 'rejected' });
      setDupes(prev => prev.filter(d => d.id !== dup.id));
    } catch (e) {
      console.error('Reject failed:', e);
      alert('Failed: ' + e.message);
    }
  };

  const MatchField = ({ label, value }) => (
    <div className="dup-field" style={{
      borderLeft: '3px solid var(--accent)',
      paddingLeft: '8px',
      background: 'rgba(56, 189, 248, 0.08)',
      borderRadius: '0 4px 4px 0',
    }}>
      <strong>{label}:</strong> {value || '—'}
    </div>
  );

  const DiffField = ({ label, incoming, existing }) => {
    const newVal = String(incoming || '—');
    const oldVal = existing ? String(existing || '—') : null;
    let isDifferent = oldVal !== null && newVal !== oldVal;
    
    // Normalize blank vs null
    if (oldVal === '—' && incoming === '') isDifferent = false;
    if (newVal === '—' && existing === '') isDifferent = false;

    return (
      <div className="dup-field" style={isDifferent ? { background: 'rgba(234, 179, 8, 0.15)', padding: '2px 6px', borderRadius: '4px' } : {}}>
        <strong>{label}:</strong> {newVal}
      </div>
    );
  };

  const inner = (
    <>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)', fontSize: '0.95rem', maxWidth: '800px', lineHeight: 1.5 }}>
          When importing CSV batches, incoming records that match the exact Plate, Date, and Location of an existing 
          database entry are held in this queue. They are <strong>not</strong> officially ingested into the database 
          until you resolve the conflict below.
        </p>

        {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}

        {!loading && dupes.length === 0 && (
          <div className="search-empty animate-fadeIn">
            <div className="search-empty-icon">✅</div>
            <h2>No pending conflicts</h2>
            <p>All duplicate records have been resolved.</p>
          </div>
        )}

        {dupes.map(dup => {
          const incData = dup.raw_data || {};
          // Use manual fetches stored on the dup object
          const exSighting = dup._existingSighting || null;
          const exVehicle = dup._existingVehicle || null;
          // Show right panel as long as we have the sighting.
          // Vehicle data is optional — spread empty object if unavailable.
          const exData = exSighting ? { ...(exVehicle || {}), ...exSighting } : null;
          
          return (
            <div key={dup.id} className="dup-card glass-card animate-fadeIn">
              <div className="flex justify-between items-center" style={{ marginBottom: 'var(--space-md)' }}>
                <div className="flex items-center gap-sm">
                  <span className="badge badge-warning">Conflict</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Batch: {dup.import_batch}
                  </span>
                </div>
              </div>

              <div className="dup-comparison" style={{ gridTemplateColumns: exData ? '1fr 1fr' : '1fr', gap: 'var(--space-xl)' }}>
                {/* INCOMING RECORD — LEFT */}
                <div className="dup-side" style={{ borderRight: exData ? '1px solid var(--border)' : 'none', paddingRight: exData ? 'var(--space-xl)' : 0 }}>
                  <h4 style={{ color: 'var(--accent)' }}>Incoming CSV Record</h4>
                  <MatchField label="Plate"    value={incData.plate} />
                  <DiffField  label="State"    incoming={incData.state}        existing={exData?.state} />
                  <DiffField  label="Make/Model" incoming={incData.make ? `${incData.make} ${incData.model}` : incData.model} existing={exData ? `${exData.make} ${exData.model}` : null} />
                  <DiffField  label="Color"    incoming={incData.color}        existing={exData?.color} />
                  <MatchField label="Location" value={incData.location} />
                  <MatchField label="Date"     value={incData.date ? new Date(incData.date).toLocaleDateString('en-US', { timeZone: 'UTC' }) : '—'} />
                  <DiffField  label="ICE"      incoming={incData.ice}          existing={exData?.ice} />
                  <DiffField  label="Matches Reg.?" incoming={incData.match_status} existing={exData?.match_status} />
                  <DiffField  label="Notes"    incoming={incData.notes}        existing={exData?.notes} />
                </div>

                {/* EXISTING RECORD — RIGHT */}
                {exData && (
                  <div className="dup-side">
                    <h4 style={{ color: 'var(--text-muted)' }}>Existing Database Record</h4>

                    <MatchField label="Plate"    value={exData.plate} />
                    <div className="dup-field"><strong>State:</strong> {exData.state}</div>
                    <div className="dup-field"><strong>Make/Model:</strong> {exData.make} {exData.model}</div>
                    <div className="dup-field"><strong>Color:</strong> {exData.color}</div>
                    <MatchField label="Location" value={exData.location} />
                    <MatchField label="Date"     value={exData.date ? new Date(exData.date).toLocaleDateString('en-US', { timeZone: 'UTC' }) : '—'} />
                    <div className="dup-field"><strong>ICE:</strong> {exData.ice}</div>
                    <div className="dup-field"><strong>Matches Reg.?:</strong> {exData.match_status}</div>
                    <div className="dup-field"><strong>Notes:</strong> {exData.notes || '—'}</div>
                  </div>
                )}
              </div>

              <div className="flex gap-md mt-lg" style={{ marginTop: 'var(--space-xl)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-md)' }}>
                <button
                  className="btn btn-sm"
                  style={{ background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border)', flex: 1 }}
                  onClick={() => handleKeepBoth(dup)}
                >
                  ➕ Keep Both
                </button>
                <button 
                  className="btn btn-primary btn-sm" 
                  style={{ flex: 1 }}
                  onClick={() => handleReplace(dup)}
                >
                  🔄 Replace Existing
                </button>
                <button
                  className="btn btn-sm"
                  style={{ background: 'transparent', color: 'var(--danger)', border: '1px solid rgba(248,113,113,0.3)', flex: 1 }}
                  onClick={() => handleReject(dup)}
                >
                  🚫 Reject Incoming
                </button>
              </div>
            </div>
          );
        })}
    </>
  );

  if (embedded) return inner;
  return (
    <div className="page">
      <div className="container" style={{ maxWidth: '1000px' }}>
        <h1 className="admin-title">Duplicate Conflict Resolution</h1>
        {inner}
      </div>
    </div>
  );
}

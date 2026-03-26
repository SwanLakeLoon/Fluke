import { useState } from 'react';
import Papa from 'papaparse';
import { pb } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import './AdminPages.css';

const COLUMN_MAP = {
  'Plate': 'plate',
  'State': 'state',
  'Make': 'make',
  'Model': 'model',
  'Color': 'color',
  'ICE': 'ice',
  'Match': 'match_status',
  'Registration': 'registration',
  'VIN Associated to Plate (if available)': 'vin',
  'Title Issues Associated to VIN (if available)': 'title_issues',
  'Notes': 'notes',
  'Location': 'location',
  'Date': 'date',
  'Plate Confidence': 'plate_confidence',
};

const VALID_COLORS = new Set(['BR', 'GR', 'BK', 'BL', 'TN', 'SL', 'R', 'WH', 'GN', 'GD', 'PU']);
const VALID_ICE = new Set(['Y', 'N', 'HS']);
const VALID_MATCH = new Set(['Y', 'N', '']);

function mapRow(csvRow) {
  const mapped = {};
  for (const [csvCol, dbField] of Object.entries(COLUMN_MAP)) {
    mapped[dbField] = (csvRow[csvCol] || '').trim();
  }
  // searchable: if column exists in CSV, use it; otherwise derive
  const searchableRaw = (csvRow['searchable'] || csvRow['Searchable'] || '').trim().toUpperCase();
  if (searchableRaw) {
    mapped.searchable = ['Y', 'TRUE', '1', 'YES'].includes(searchableRaw);
  } else {
    mapped.searchable = ['Y', 'HS'].includes(mapped.ice);
  }
  // plate_confidence
  mapped.plate_confidence = parseFloat(mapped.plate_confidence) || 0;
  // Fallback for plural "Dates" column
  if (!mapped.date) {
    mapped.date = (csvRow['Dates'] || '').trim();
  }
  // blank date → null
  if (!mapped.date) mapped.date = null;
  return mapped;
}

function validateRow(row) {
  const errors = [];
  if (!row.plate) errors.push('plate required');
  else if (row.plate.length > 10) errors.push('plate too long');
  if (!row.state) errors.push('state required');
  else if (row.state.length !== 2) errors.push('state must be 2 chars');
  if (row.color && !VALID_COLORS.has(row.color)) errors.push(`invalid color: ${row.color}`);
  if (row.ice && !VALID_ICE.has(row.ice)) errors.push(`invalid ICE: ${row.ice}`);
  if (row.match_status && !VALID_MATCH.has(row.match_status)) errors.push(`invalid match: ${row.match_status}`);
  return errors;
}

export default function CsvUpload() {
  const { user, isAdmin } = useAuth();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [validationErrors, setValidationErrors] = useState([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [priorSightings, setPriorSightings] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [expandedPlates, setExpandedPlates] = useState(new Set());

  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    setResult(null);

    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data;
        const mapped = rows.map((r, i) => {
          const row = mapRow(r);
          return {
            index: i + 1,
            raw: r,
            mapped: row,
            errors: validateRow(row),
          };
        });
        setPreview(mapped);
        setValidationErrors(mapped.filter(r => r.errors.length > 0));
      },
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith('.csv')) handleFile(f);
  };

  const handleImport = async () => {
    setImporting(true);
    const batchName = file.name;
    const validRows = preview.filter(r => r.errors.length === 0);

    if (!isAdmin) {
      // --- UPLOADER/APPROVER: Stage for approval ---
      try {
        await pb.collection('upload_batches').create({
          uploaded_by: user.id,
          filename: batchName,
          row_count: validRows.length,
          rows: validRows.map(r => r.mapped),
          status: 'pending',
        });
        setResult({ staged: true, row_count: validRows.length, rejected: preview.length - validRows.length });
      } catch (e) {
        console.error('Staging failed:', e);
        setResult({ staged: true, error: e.message });
      }
      setImporting(false);
      setPreview([]);
      setValidationErrors([]);
      setFile(null);
      return;
    }

    // --- ADMIN: Direct ingest (existing flow) ---
    let inserted = 0, dupsQueued = 0, rejected = 0;

    const batchPlates = [...new Set(validRows
      .map(r => r.mapped.plate)
      .filter(Boolean)
    )];

    await lookupPriorSightings(batchPlates);

    for (const row of preview) {
      if (row.errors.length > 0) { rejected++; continue; }

      const record = row.mapped;

      try {
        // 1) Find or create the vehicle
        let vehicle;
        try {
          const vRes = await pb.collection('vehicles').getFirstListItem(`plate = "${record.plate.replace(/"/g, '\\"')}"`);
          vehicle = vRes;
          
          // Upgrade existing vehicle with new/higher-permission data if missing
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
        } catch (e) {
          // Not found — create it
          vehicle = await pb.collection('vehicles').create({
            plate: record.plate,
            state: record.state,
            make: record.make,
            model: record.model,
            color: record.color,
            registration: record.registration,
            vin: record.vin,
            title_issues: record.title_issues,
            searchable: record.searchable,
          });
        }

        // 2) Duplicate check: same vehicle + location + date
        const filterParts = [`vehicle = "${vehicle.id}"`];
        if (record.location) {
          filterParts.push(`location = "${record.location.replace(/"/g, '\\"')}"`);
        } else {
          filterParts.push('location = ""');
        }

        const check = await pb.collection('sightings').getList(1, 50, {
          filter: filterParts.join(' && '),
        });

        // Match date in JS to avoid PocketBase date="" parsing errors
        const recDate = record.date ? record.date.substring(0, 10) : null;
        let isDup = false;
        let existingSightingId = null;

        for (const existing of check.items) {
          const exDate = existing.date ? existing.date.substring(0, 10) : null;
          if (exDate === recDate) {
            isDup = true;
            existingSightingId = existing.id;
            break;
          }
        }

        if (isDup) {
          await pb.collection('duplicate_queue').create({
            raw_data: record,
            reason: `Duplicate: same plate+date+location (plate=${record.plate})`,
            status: 'pending',
            import_batch: `${batchName} (by ${user.username || user.email || 'Admin'})`,
            existing_record_id: existingSightingId,
          });
          dupsQueued++;
          continue;
        }

        // 3) Create sighting
        await pb.collection('sightings').create({
          vehicle: vehicle.id,
          location: record.location,
          date: record.date || null,
          ice: record.ice,
          match_status: record.match_status,
          plate_confidence: record.plate_confidence,
          notes: record.notes,
        });
        inserted++;
      } catch (e) {
        console.error('Insert error:', e);
        rejected++;
      }
    }

    setResult({ inserted, dupsQueued, rejected });
    setImporting(false);
    setPreview([]);
    setValidationErrors([]);
    setFile(null);
  };

  const lookupPriorSightings = async (plates) => {
    if (!plates.length) { setPriorSightings({}); return; }
    try {
      const filterStr = plates.map(p => `plate = "${p.replace(/"/g, '\\"')}"`).join(' || ');
      const vehicleRes = await pb.collection('vehicles').getFullList({
        filter: filterStr,
      });
      const vehicleIds = vehicleRes.map(v => v.id);
      if (vehicleIds.length === 0) { setPriorSightings({}); return; }

      const sightFilter = vehicleIds.map(id => `vehicle = "${id}"`).join(' || ');
      const sightRes = await pb.collection('sightings').getFullList({
        filter: sightFilter,
        sort: '-date',
        expand: 'vehicle',
      });
      // Group by plate
      const grouped = {};
      for (const s of sightRes) {
        const plate = s.expand?.vehicle?.plate;
        if (!plate) continue;
        if (!grouped[plate]) grouped[plate] = [];
        grouped[plate].push(s);
      }
      setPriorSightings(grouped);
    } catch (e) {
      console.error('Prior sightings lookup failed:', e);
      setPriorSightings({});
    }
  };

  const togglePlate = (plate) => {
    setExpandedPlates(prev => {
      const next = new Set(prev);
      next.has(plate) ? next.delete(plate) : next.add(plate);
      return next;
    });
  };

  return (
    <div className="page">
      <div className="container">
        <div className="flex justify-between items-center" style={{ marginBottom: 'var(--space-lg)' }}>
          <h1 className="admin-title" style={{ marginBottom: 0 }}>CSV Upload</h1>
          <a href="/template.csv" download className="btn btn-ghost btn-sm" aria-label="Download CSV template">
            📥 Download Template
          </a>
        </div>

        {/* Drop Zone */}
        <div
          className={`drop-zone glass-card ${dragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById('csv-input').click()}
        >
          <input
            id="csv-input"
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files[0])}
          />
          <div className="drop-icon">📁</div>
          <p>{file ? file.name : 'Drop a CSV file here or click to browse'}</p>
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="validation-summary">
            <h3>⚠️ {validationErrors.length} row{validationErrors.length !== 1 ? 's' : ''} with validation issues:</h3>
            {validationErrors.slice(0, 10).map(r => (
              <div key={r.index} className="val-error">
                Row {r.index}: {r.errors.join(', ')}
              </div>
            ))}
            {validationErrors.length > 10 && <p>...and {validationErrors.length - 10} more</p>}
          </div>
        )}

        {/* Preview Table */}
        {preview.length > 0 && (
          <>
            <div className="preview-header">
              <h3>Preview — {preview.length} rows</h3>
              <div className="flex gap-sm">
                <button
                  className="btn btn-ghost"
                  onClick={() => { setFile(null); setPreview([]); setValidationErrors([]); }}
                  disabled={importing}
                >
                  Discard
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleImport}
                  disabled={importing}
                >
                  {importing ? 'Importing...' : `Import ${preview.length - validationErrors.length} valid rows`}
                </button>
              </div>
            </div>

            <div className="table-wrapper glass-card" style={{ padding: 0, overflow: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Status</th>
                    <th>Plate</th>
                    <th>State</th>
                    <th>Date</th>
                    <th>Make</th>
                    <th>Model</th>
                    <th>ICE</th>
                    <th>Searchable</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 50).map(r => (
                    <tr key={r.index} className={r.errors.length > 0 ? 'row-error' : ''}>
                      <td>{r.index}</td>
                      <td>
                        {r.errors.length > 0
                          ? <span className="badge badge-danger">Invalid</span>
                          : <span className="badge badge-success">Valid</span>}
                      </td>
                      <td>{r.mapped.plate}</td>
                      <td>{r.mapped.state}</td>
                      <td>{r.mapped.date ? new Date(r.mapped.date).toLocaleDateString() : '—'}</td>
                      <td>{r.mapped.make}</td>
                      <td>{r.mapped.model}</td>
                      <td>{r.mapped.ice}</td>
                      <td>{r.mapped.searchable ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 500+ Row Warning */}
        {preview.length > 500 && (
          <div className="validation-summary" style={{ background: 'rgba(234, 179, 8, 0.12)', borderColor: 'var(--warning)' }}>
            <h3>⚠️ Large batch — {preview.length} rows may take a while to process.</h3>
          </div>
        )}

        {/* Result */}
        {result && result.staged ? (
          <div className="import-result glass-card animate-fadeIn">
            {result.error ? (
              <>
                <h3>❌ Staging Failed</h3>
                <p style={{ color: 'var(--danger)' }}>{result.error}</p>
              </>
            ) : (
              <>
                <h3>📤 Staged for Approval</h3>
                <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-sm)' }}>
                  Your batch of <strong>{result.row_count}</strong> valid rows has been submitted for review.
                  An approver or admin will review and approve the data before it is ingested into the database.
                </p>
                {result.rejected > 0 && (
                  <p style={{ color: 'var(--danger)', marginTop: 'var(--space-sm)' }}>
                    {result.rejected} invalid row{result.rejected !== 1 ? 's were' : ' was'} discarded.
                  </p>
                )}
              </>
            )}
          </div>
        ) : result && (
          <div className="import-result glass-card animate-fadeIn">
            <h3>Import Complete</h3>
            <div className="result-stats">
              <div className="result-stat">
                <span className="result-num" style={{ color: 'var(--success)' }}>{result.inserted}</span>
                <span>Inserted</span>
              </div>
              <div className="result-stat">
                <span className="result-num" style={{ color: 'var(--warning)' }}>{result.dupsQueued}</span>
                <span>Duplicates Queued</span>
              </div>
              <div className="result-stat">
                <span className="result-num" style={{ color: 'var(--danger)' }}>{result.rejected}</span>
                <span>Rejected</span>
              </div>
            </div>

            {/* Prior Sightings */}
            {priorSightings && (() => {
              const platesWithHistory = Object.entries(priorSightings).filter(([, s]) => s.length > 0);
              return (
                <div className="prior-sightings">
                  <h4 className="prior-sightings-title">
                    🔁 Prior Sightings
                    <span className="prior-sightings-count">
                      {platesWithHistory.length === 0
                        ? 'No plates from this batch have been seen before'
                        : `${platesWithHistory.length} plate${platesWithHistory.length !== 1 ? 's' : ''} seen before`}
                    </span>
                  </h4>
                  {platesWithHistory.map(([plate, sightings]) => (
                    <div key={plate} className="prior-plate-group">
                      <button
                        className="prior-plate-header"
                        onClick={() => togglePlate(plate)}
                      >
                        <span>
                          <strong>{plate}</strong>
                          <span className="prior-plate-meta">{sightings[0]?.state} · {sightings[0]?.make} {sightings[0]?.model}</span>
                        </span>
                        <span className="prior-plate-badge">
                          {sightings.length} prior sighting{sightings.length !== 1 ? 's' : ''}
                          <span className="vc-chevron" style={{ marginLeft: 6 }}>{expandedPlates.has(plate) ? '▲' : '▼'}</span>
                        </span>
                      </button>
                      {expandedPlates.has(plate) && (
                        <table className="data-table prior-plate-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Location</th>
                              <th>ICE</th>
                              <th>Matches Reg.?</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sightings.map(s => (
                              <tr key={s.id}>
                                <td>{s.date ? new Date(s.date).toLocaleDateString() : '—'}</td>
                                <td>{s.location || '—'}</td>
                                <td>
                                  <span className={`badge ${s.ice === 'Y' || s.ice === 'HS' ? 'badge-warning' : 'badge-muted'}`}>
                                    {s.ice || '—'}
                                  </span>
                                </td>
                                <td>
                                  <span className={`badge ${s.match_status === 'N' ? 'badge-warning' : 'badge-muted'}`}>
                                    {s.match_status || '—'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            <button
              className="btn btn-ghost"
              style={{ marginTop: 'var(--space-lg)' }}
              onClick={() => { setResult(null); setPriorSightings(null); setExpandedPlates(new Set()); }}
            >
              Upload Another CSV
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

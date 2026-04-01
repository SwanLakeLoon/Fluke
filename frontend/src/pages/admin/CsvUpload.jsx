import { useState } from 'react';
import Papa from 'papaparse';
import { pb } from '../../api/client';
import { processBatch } from '../../utils/ingestPipeline';
import { useAuth } from '../../hooks/useAuth';
import './AdminPages.css';

import { mapRow, validateRow } from '../../utils/csvUtils';

export default function CsvUpload() {
  const { user, isAdmin, isApprover } = useAuth();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [validationErrors, setValidationErrors] = useState([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [priorSightings, setPriorSightings] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [expandedPlates, setExpandedPlates] = useState(new Set());
  const [showAllPreview, setShowAllPreview] = useState(false);

  const handleRemovePreviewRow = (index) => {
    const next = preview.filter(r => r.index !== index);
    setPreview(next);
    setValidationErrors(next.filter(r => r.errors.length > 0));
  };

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
    const validRows = preview.filter(r => r.errors.length === 0);

    // Frontend check for missing location/date
    const hasMissingData = validRows.some(r => !r.mapped.location || !r.mapped.date);
    if (hasMissingData) {
      const proceed = window.confirm("Reminder: Some valid records are missing a Location or Date. These fields aren't strictly required, but are highly recommended to include. Do you want to proceed with the upload anyway?");
      if (!proceed) return;
    }

    setImporting(true);
    const batchName = file.name;

    if (!isAdmin && !isApprover) {
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

    const batchLabel = `${batchName} (by ${user.name || user.username || user.email || 'Admin'})`;
    const { inserted, dupsQueued, errors: rejectedCount } = await processBatch(pb, validRows.map(r => r.mapped), batchLabel);
    const rejected = preview.filter(r => r.errors.length > 0).length + rejectedCount;

    setResult({ inserted, dupsQueued, rejected });

    // Trigger prior sightings lookup for imported plates
    const mappedValidRows = validRows.map(r => r.mapped);
    const uniquePlates = [...new Set(mappedValidRows.map(r => r.plate).filter(Boolean))];
    lookupPriorSightings(uniquePlates, mappedValidRows);

    setImporting(false);
    setPreview([]);
    setValidationErrors([]);
    setFile(null);
  };

  const lookupPriorSightings = async (plates, currentBatch) => {
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

      // Group by plate, but EXCLUDE sightings that are part of the current batch
      const grouped = {};
      const batchMap = new Map(); // plate -> Set of "YYYY-MM-DD|location"
      for (const row of currentBatch) {
        if (!batchMap.has(row.plate)) batchMap.set(row.plate, []);
        batchMap.get(row.plate).push(`${(row.date || '').substring(0, 10)}|${row.location || ''}`);
      }

      for (const s of sightRes) {
        const plate = s.expand?.vehicle?.plate;
        if (!plate) continue;

        // Check if this sighting matches a row in the current batch
        const sKey = `${(s.date || '').substring(0, 10)}|${s.location || ''}`;
        const bKeys = batchMap.get(plate) || [];
        const matchIdx = bKeys.indexOf(sKey);
        
        if (matchIdx !== -1) {
          // "Consume" one instance of this sighting from the batch record
          // so that if there are REAL duplicates in the DB, they still show up.
          bKeys.splice(matchIdx, 1);
          continue; 
        }

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
                    <th></th>
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
                  {(showAllPreview ? preview : preview.slice(0, 50)).map(r => (
                    <tr key={r.index} className={r.errors.length > 0 ? 'row-error' : ''}>
                      <td>
                        <button
                          title="Remove this row"
                          onClick={() => handleRemovePreviewRow(r.index)}
                          disabled={importing}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '1rem', padding: '0 4px', lineHeight: 1 }}
                        >✕</button>
                      </td>
                      <td>{r.index}</td>
                      <td>
                        {r.errors.length > 0
                          ? <span className="badge badge-danger">Invalid</span>
                          : <span className="badge badge-success">Valid</span>}
                      </td>
                      <td>{r.mapped.plate}</td>
                      <td>{r.mapped.state}</td>
                      <td>{r.mapped.date || '—'}</td>
                      <td>{r.mapped.make}</td>
                      <td>{r.mapped.model}</td>
                      <td>{r.mapped.ice}</td>
                      <td>{r.mapped.searchable ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.length > 50 && (
              <div style={{ textAlign: 'center', padding: 'var(--space-sm)' }}>
                {showAllPreview ? (
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowAllPreview(false)}>Hide expanded rows</button>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowAllPreview(true)}>
                    Show all {preview.length} rows
                  </button>
                )}
              </div>
            )}
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
                                <td>{s.date ? s.date.substring(0, 10) : '—'}</td>
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

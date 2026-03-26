import React, { useState, useEffect } from 'react';
import { pb } from '../../api/client';
import './AdminPages.css';

const VALID_COLORS = ['BR', 'GR', 'BK', 'BL', 'TN', 'SL', 'R', 'WH', 'GN', 'GD', 'PU'];
const VALID_ICE = ['Y', 'N', 'HS'];
const VALID_MATCH = ['Y', 'N', ''];

export default function RecordManager() {
  const [records, setRecords] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [filterPlate, setFilterPlate] = useState('');
  const [sortBy, setSortBy] = useState('-date');
  const [expandedPlates, setExpandedPlates] = useState(new Set());
  const [editingId, setEditingId] = useState(null);
  const [editingVehicleId, setEditingVehicleId] = useState(null);
  const [editData, setEditData] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null); // 'single:id' or 'bulk'

  const getStatsSort = (sb) => {
    switch (sb) {
      case '-date': return '-latest_sighting';
      case 'date': return 'latest_sighting';
      case '-location': return '-location_list';
      case 'location': return 'location_list';
      case '-searchable': return '-searchable';
      case 'searchable': return 'searchable';
      default: return sb; // plate, -plate
    }
  };

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const statsFilter = filterPlate ? `plate ~ "${filterPlate}"` : '';
      const statsRes = await pb.collection('enhanced_plate_stats').getList(page, 25, {
        filter: statsFilter || undefined,
        sort: getStatsSort(sortBy),
      });

      setTotalPages(statsRes.totalPages);
      setTotalItems(statsRes.totalItems);

      const vehicleIds = statsRes.items.map(s => s.id);
      if (vehicleIds.length > 0) {
        const vehFilterStr = vehicleIds.map(id => `id = "${id}"`).join(' || ');
        const vehRes = await pb.collection('vehicles').getFullList({ filter: vehFilterStr });
        const sightFilterStr = vehicleIds.map(id => `vehicle = "${id}"`).join(' || ');
        const sightRes = await pb.collection('sightings').getFullList({ filter: sightFilterStr, sort: '-date' });

        const vmap = new Map();
        for (const v of vehRes) { vmap.set(v.id, { ...v, sightings: [] }); }
        for (const s of sightRes) {
          if (vmap.has(s.vehicle)) vmap.get(s.vehicle).sightings.push(s);
        }
        
        const grouped = statsRes.items.map(s => vmap.get(s.id)).filter(Boolean);
        setRecords(grouped);
      } else {
        setRecords([]);
      }
    } catch (e) {
      console.error('Fetch error:', e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchRecords(); }, [page, filterPlate, sortBy]);

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const allRecordIds = records.flatMap(v => v.sightings.map(s => s.id));
    if (selected.size === allRecordIds.length && allRecordIds.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allRecordIds));
    }
  };

  const toggleVehicleSelect = (vehicle) => {
    const vehicleIds = vehicle.sightings.map(s => s.id);
    const allSelected = vehicleIds.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      vehicleIds.forEach(id => {
        if (allSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  const toggleExpand = (plate) => {
    setExpandedPlates(prev => {
      const next = new Set(prev);
      next.has(plate) ? next.delete(plate) : next.add(plate);
      return next;
    });
  };

  const bulkSetSearchable = async (value) => {
    const vIds = new Set();
    records.forEach(v => {
      v.sightings.forEach(s => {
        if (selected.has(s.id)) vIds.add(v.id);
      });
    });
    for (const id of vIds) {
      try {
        await pb.collection('vehicles').update(id, { searchable: value });
      } catch (e) {
        console.error(`Failed to update vehicle ${id}:`, e);
      }
    }
    setSelected(new Set());
    fetchRecords();
  };

  // --- Inline Edit ---
  const startEditSubrow = (v, r) => {
    setEditingId(r.id);
    setEditingVehicleId(v.id);
    setEditData({
      plate: v.plate || '',
      state: v.state || '',
      make: v.make || '',
      model: v.model || '',
      color: v.color || '',
      ice: r.ice || '',
      match_status: r.match_status || '',
      registration: v.registration || '',
      vin: v.vin || '',
      title_issues: v.title_issues || '',
      notes: r.notes || '',
      location: r.location || '',
      date: r.date || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingVehicleId(null);
    setEditData({});
  };

  const saveEdit = async () => {
    try {
      const vData = {
        plate: editData.plate, state: editData.state, make: editData.make,
        model: editData.model, color: editData.color, registration: editData.registration,
        vin: editData.vin, title_issues: editData.title_issues,
      };
      const sData = {
        location: editData.location, date: editData.date, ice: editData.ice,
        match_status: editData.match_status, notes: editData.notes,
      };
      await pb.collection('vehicles').update(editingVehicleId, vData);
      await pb.collection('sightings').update(editingId, sData);
      
      setEditingId(null);
      setEditingVehicleId(null);
      setEditData({});
      fetchRecords(); // Refetch to rebuild grouping cleanly
    } catch (e) {
      console.error('Save failed:', e);
      alert('Save failed: ' + (e.message || 'Unknown error'));
    }
  };

  const updateEditField = (field, value) => {
    setEditData(prev => ({ ...prev, [field]: value }));
  };

  // --- Delete ---
  const deleteSingle = async (id) => {
    try {
      // Read vehicle FK before deleting
      const sighting = await pb.collection('sightings').getOne(id);
      const vehicleId = sighting.vehicle;
      await pb.collection('sightings').delete(id);
      // Cleanup: remove orphaned vehicle if no sightings remain
      const remaining = await pb.collection('sightings').getList(1, 1, { filter: `vehicle = "${vehicleId}"` });
      if (remaining.totalItems === 0) {
        await pb.collection('vehicles').delete(vehicleId);
      }
      setConfirmDelete(null);
      fetchRecords();
    } catch (e) {
      console.error('Delete failed:', e);
      alert('Delete failed: ' + (e.message || 'Unknown error'));
    }
  };

  const bulkDelete = async () => {
    // Collect vehicle IDs before deleting so we can check for orphans
    const vehicleIdsToCheck = new Set();
    for (const id of selected) {
      try {
        const sighting = await pb.collection('sightings').getOne(id);
        vehicleIdsToCheck.add(sighting.vehicle);
        await pb.collection('sightings').delete(id);
      } catch (e) {
        console.error(`Delete ${id} failed:`, e);
      }
    }
    // Cleanup orphaned vehicles
    for (const vehicleId of vehicleIdsToCheck) {
      try {
        const remaining = await pb.collection('sightings').getList(1, 1, { filter: `vehicle = "${vehicleId}"` });
        if (remaining.totalItems === 0) {
          await pb.collection('vehicles').delete(vehicleId);
        }
      } catch (e) {
        console.error(`Orphan cleanup for vehicle ${vehicleId} failed:`, e);
      }
    }
    setSelected(new Set());
    setConfirmDelete(null);
    fetchRecords();
  };

  const handleSearchableToggle = async (vehicle, currentSearchable) => {
    try {
      await pb.collection('vehicles').update(vehicle.id, { searchable: !currentSearchable });
      fetchRecords(); // Refetch to correctly bubble searchable state to vehicle root
    } catch (e) {
      console.error('Toggle failed:', e);
    }
  };

  return (
    <div className="page">
      <div className="container">
        <h1 className="admin-title">Records Manager</h1>

        {/* Toolbar */}
        <div className="records-toolbar">
          <div className="records-toolbar-left">
            <input
              className="input"
              placeholder="Filter by plate..."
              value={filterPlate}
              onChange={(e) => { setFilterPlate(e.target.value); setPage(1); }}
              style={{ maxWidth: 200 }}
            />
            <select
              className="select"
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
            >
              <option value="-date">Sighting Date (Newest)</option>
              <option value="date">Sighting Date (Oldest)</option>
              <option value="plate">Plate (A-Z)</option>
              <option value="-plate">Plate (Z-A)</option>
              <option value="location">Location (A-Z)</option>
              <option value="-location">Location (Z-A)</option>
              <option value="-searchable">Searchable (Yes first)</option>
              <option value="searchable">Searchable (No first)</option>
            </select>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {totalItems} total records
            </span>
          </div>
          {selected.size > 0 && (
            <div className="flex gap-sm">
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {selected.size} selected
              </span>
              <button className="btn btn-primary btn-sm" onClick={() => bulkSetSearchable(true)}>
                Set Searchable
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => bulkSetSearchable(false)}>
                Set Hidden
              </button>
              <button
                className="btn btn-sm"
                style={{ background: 'var(--danger)', color: '#fff' }}
                onClick={() => setConfirmDelete('bulk')}
              >
                Delete {selected.size}
              </button>
            </div>
          )}
        </div>

        {/* Confirm Delete Modal */}
        {confirmDelete && (
          <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
            <div className="modal-card glass-card animate-fadeIn" onClick={e => e.stopPropagation()}>
              <h3 style={{ marginBottom: 'var(--space-md)' }}>⚠️ Confirm Delete</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)' }}>
                {confirmDelete === 'bulk'
                  ? `Are you sure you want to permanently delete ${selected.size} selected record${selected.size !== 1 ? 's' : ''}? This cannot be undone.`
                  : 'Are you sure you want to permanently delete this record? This cannot be undone.'}
              </p>
              <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>
                  Cancel
                </button>
                <button
                  className="btn"
                  style={{ background: 'var(--danger)', color: '#fff' }}
                  onClick={() => {
                    if (confirmDelete === 'bulk') {
                      bulkDelete();
                    } else {
                      deleteSingle(confirmDelete.replace('single:', ''));
                    }
                  }}
                >
                  Delete Permanently
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="glass-card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}><input type="checkbox" onChange={selectAll} checked={selected.size > 0 && selected.size === records.flatMap(v => v.sightings).length} /></th>
                <th>Plate</th>
                <th>State</th>
                <th>Date</th>
                <th>Make</th>
                <th>Model</th>
                <th>ICE</th>
                <th>Matches Reg.?</th>
                <th>Location</th>
                <th>Searchable</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: '2rem' }}>Loading...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: '2rem' }}>No records found</td></tr>
              ) : records.map(v => (
                <React.Fragment key={v.plate}>
                  {/* ===== VEHICLE SUMMARY ROW ===== */}
                  <tr className="vehicle-summary-row" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <td>
                      <input
                        type="checkbox"
                        checked={v.sightings.length > 0 && v.sightings.every(s => selected.has(s.id))}
                        ref={el => { if (el) el.indeterminate = v.sightings.some(s => selected.has(s.id)) && !v.sightings.every(s => selected.has(s.id)) }}
                        onChange={() => toggleVehicleSelect(v)}
                      />
                    </td>
                    <td>
                      <div><strong>{v.plate}</strong></div>
                      {v.sightings.length > 1 && (
                        <div style={{ marginTop: '4px' }}>
                          <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                            {v.sightings.length} sightings
                          </span>
                        </div>
                      )}
                    </td>
                    <td>{v.state}</td>
                    <td>{v.sightings[0]?.date ? new Date(v.sightings[0].date).toLocaleDateString() : '—'}</td>
                    <td>{v.make}</td>
                    <td>{v.model}</td>
                    <td>
                      <span className={`badge ${v.sightings[0]?.ice === 'Y' || v.sightings[0]?.ice === 'HS' ? 'badge-warning' : 'badge-muted'}`}>
                        {v.sightings[0]?.ice || '—'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${v.sightings[0]?.match_status === 'N' ? 'badge-warning' : 'badge-muted'}`}>
                        {v.sightings[0]?.match_status || '—'}
                      </span>
                    </td>
                    <td>
                      {(() => {
                        const locs = new Set(v.sightings.map(s => s.location).filter(Boolean));
                        if (locs.size > 1) return <span className="badge badge-warning">Multiple</span>;
                        return locs.size === 1 ? [...locs][0] : '—';
                      })()}
                    </td>
                    <td>
                      <button
                        className={`btn btn-sm ${v.sightings[0]?.searchable ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => handleSearchableToggle(v, v.sightings[0]?.searchable)}
                      >
                        {v.sightings[0]?.searchable ? '✓ Yes' : '✕ No'}
                      </button>
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleExpand(v.plate)}>
                        {expandedPlates.has(v.plate) ? '▲ Hide' : '▼ Expand'}
                      </button>
                    </td>
                  </tr>

                  {/* ===== EXPANDED SIGHTINGS SUB-ROWS ===== */}
                  {expandedPlates.has(v.plate) && v.sightings.map(r => (
                    editingId === r.id ? (
                      /* === INLINE EDIT SIGHTING === */
                      <tr key={r.id} className="editing-row">
                        <td colSpan={11}>
                          <div className="inline-edit-form">
                            <div className="edit-grid">
                              <label>Plate<input className="input input-sm" value={editData.plate} onChange={e => updateEditField('plate', e.target.value)} maxLength={10} /></label>
                              <label>State<input className="input input-sm" value={editData.state} onChange={e => updateEditField('state', e.target.value.toUpperCase())} maxLength={2} /></label>
                              <label>Make<input className="input input-sm" value={editData.make} onChange={e => updateEditField('make', e.target.value)} /></label>
                              <label>Model<input className="input input-sm" value={editData.model} onChange={e => updateEditField('model', e.target.value)} /></label>
                              <label>Color
                                <select className="select select-sm" value={editData.color} onChange={e => updateEditField('color', e.target.value)}>
                                  <option value="">—</option>
                                  {VALID_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                              </label>
                              <label>ICE
                                <select className="select select-sm" value={editData.ice} onChange={e => updateEditField('ice', e.target.value)}>
                                  <option value="">—</option>
                                  {VALID_ICE.map(v => <option key={v} value={v}>{v}</option>)}
                                </select>
                              </label>
                              <label>Matches Reg.?
                                <select className="select select-sm" value={editData.match_status} onChange={e => updateEditField('match_status', e.target.value)}>
                                  {VALID_MATCH.map(v => <option key={v || '__blank'} value={v}>{v || '—'}</option>)}
                                </select>
                              </label>
                              <label>Location<input className="input input-sm" value={editData.location} onChange={e => updateEditField('location', e.target.value)} /></label>
                              <label>Date<input className="input input-sm" value={editData.date} onChange={e => updateEditField('date', e.target.value)} /></label>
                              <label>Registration<input className="input input-sm" value={editData.registration} onChange={e => updateEditField('registration', e.target.value)} /></label>
                              <label>VIN<input className="input input-sm" value={editData.vin} onChange={e => updateEditField('vin', e.target.value)} /></label>
                              <label>Notes<input className="input input-sm" value={editData.notes} onChange={e => updateEditField('notes', e.target.value)} /></label>
                            </div>
                            <div className="edit-actions">
                              <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
                              <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      /* === SIGHTING SUB-ROW === */
                      <tr key={r.id} className="sighting-sub-row" style={{ background: 'transparent' }}>
                        <td style={{ textAlign: 'right' }}>
                          <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} />
                        </td>
                        <td style={{ paddingLeft: '1.5rem', opacity: 0.6 }}>↳ Sighting</td>
                        <td style={{ opacity: 0.5 }}>—</td>
                        <td>{r.date ? new Date(r.date).toLocaleDateString() : '—'}</td>
                        <td style={{ opacity: 0.5 }}>—</td>
                        <td style={{ opacity: 0.5 }}>—</td>
                        <td>
                          <span className={`badge ${r.ice === 'Y' || r.ice === 'HS' ? 'badge-warning' : 'badge-muted'}`}>
                            {r.ice || '—'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${r.match_status === 'N' ? 'badge-warning' : 'badge-muted'}`}>
                            {r.match_status || '—'}
                          </span>
                        </td>
                        <td>{r.location || '—'}</td>
                        <td>
                          <button
                            className={`btn btn-sm ${v.searchable ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => handleSearchableToggle(v, v.searchable)}
                          >
                            {v.searchable ? '✓ Yes' : '✕ No'}
                          </button>
                        </td>
                        <td>
                          <div className="flex gap-sm">
                            <button className="btn btn-ghost btn-sm" onClick={() => startEditSubrow(v, r)} title="Edit">
                              ✏️
                            </button>
                            <button
                              className="btn btn-sm"
                              style={{ color: 'var(--danger)' }}
                              onClick={() => setConfirmDelete(`single:${r.id}`)}
                              title="Delete"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <button className="pagination-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Page {page} of {totalPages}</span>
            <button className="pagination-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}

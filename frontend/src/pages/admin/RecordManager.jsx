import React, { useState, useEffect } from 'react';
import { pb } from '../../api/client';
import { findOrCreateVin } from '../../utils/ingestPipeline';
import { VALID_COLORS, VALID_ICE, VALID_MATCH } from '../../utils/csvUtils';
import './AdminPages.css';

// Convert Sets to Arrays for .map() rendering in dropdowns
const COLORS_LIST = [...VALID_COLORS];
const ICE_LIST = [...VALID_ICE];
const MATCH_LIST = [...VALID_MATCH];

export default function RecordManager() {
  const [records, setRecords] = useState([]);
  const [viewMode, setViewMode] = useState('plate'); // 'plate' or 'vin'
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [filterPlate, setFilterPlate] = useState('');
  const [sortBy, setSortBy] = useState('-date');
  const [filterVehicleVinOnly, setFilterVehicleVinOnly] = useState(false);
  const [expandedPlates, setExpandedPlates] = useState(new Set());
  const [editingId, setEditingId] = useState(null);
  const [editingVehicleId, setEditingVehicleId] = useState(null);
  const [editData, setEditData] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null); // 'single:id' or 'bulk'

  const getStatsSort = (sb) => {
    switch (sb) {
      case '-date': return '-latest_sighting';
      case 'date': return 'latest_sighting';
      case '-location': return viewMode === 'vin' ? '-latest_sighting' : '-location_list';
      case 'location': return viewMode === 'vin' ? 'latest_sighting' : 'location_list';
      case '-searchable': return '-searchable';
      case 'searchable': return 'searchable';
      case '-sightings': return '-sighting_count';
      case 'sightings': return 'sighting_count';
      case 'plate': return viewMode === 'vin' ? 'plate_list' : 'plate';
      case '-plate': return viewMode === 'vin' ? '-plate_list' : '-plate';
      default: return sb; // plate, -plate
    }
  };

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const safePlate = filterPlate.replace(/"/g, '\\"');
      let statsFilter = safePlate ? (viewMode === 'vin' ? `vin ~ "${safePlate}" || plate_list ~ "${safePlate}"` : `plate ~ "${safePlate}"`) : '';
      // Filter to show only records that have a physical (Vehicle) VIN
      if (filterVehicleVinOnly) {
        const vinOnlyClause = viewMode === 'vin'
          ? 'is_physical_vin = 1'
          : 'physical_vin_relation != ""';
        statsFilter = statsFilter ? `${statsFilter} && ${vinOnlyClause}` : vinOnlyClause;
      }
      const statsCollection = viewMode === 'vin' ? 'enhanced_vin_stats' : 'enhanced_plate_stats';
      
      const statsRes = await pb.collection(statsCollection).getList(page, 25, {
        filter: statsFilter || undefined,
        sort: getStatsSort(sortBy),
      });

      setTotalPages(statsRes.totalPages);
      setTotalItems(statsRes.totalItems);

      const rootIds = statsRes.items.map(s => s.id);
      if (rootIds.length === 0) {
        setRecords([]);
        setLoading(false);
        return;
      }

      if (viewMode === 'plate') {
        const vehFilterStr = rootIds.map(id => `id = "${id}"`).join(' || ');
        const vehRes = await pb.collection('vehicles').getFullList({ filter: vehFilterStr, expand: 'vin_relation,physical_vin_relation' });
        const sightFilterStr = rootIds.map(id => `vehicle = "${id}"`).join(' || ');
        const sightRes = await pb.collection('sightings').getFullList({ filter: sightFilterStr, sort: '-date' });

        const vmap = new Map();
        for (const v of vehRes) {
          const vinRec = v.expand?.vin_relation;
          const physVinRec = v.expand?.physical_vin_relation;
          vmap.set(v.id, { 
            ...v, 
            _vin: vinRec?.vin || v.vin || '', 
            _physical_vin: physVinRec?.vin || '',
            _title_issues: vinRec?.title_issues || v.title_issues || '', 
            sightings: [] 
          });
        }
        for (const s of sightRes) {
          if (vmap.has(s.vehicle)) vmap.get(s.vehicle).sightings.push(s);
        }
        
        const grouped = statsRes.items.map(s => vmap.get(s.id)).filter(Boolean);
        setRecords(grouped);
      } else {
        // VIN Mode — match vehicles linked via either relation field
        const vehFilterStr = rootIds
          .map(id => `vin_relation = "${id}" || physical_vin_relation = "${id}"`)
          .join(' || ');
        const vehRes = await pb.collection('vehicles').getFullList({ filter: vehFilterStr });
        
        const vehicleMap = new Map();
        const vehicleIds = vehRes.map(v => v.id);
        for (const v of vehRes) vehicleMap.set(v.id, v);

        let sightRes = [];
        if (vehicleIds.length > 0) {
          const sightFilterStr = vehicleIds.map(id => `vehicle = "${id}"`).join(' || ');
          sightRes = await pb.collection('sightings').getFullList({ filter: sightFilterStr, sort: '-date' });
        }

        const vinMap = new Map();
        for (const vinItem of statsRes.items) {
           vinMap.set(vinItem.id, { 
             ...vinItem, 
             isVinMode: true,
             sightings: [] 
           });
        }

        for (const s of sightRes) {
           const v = vehicleMap.get(s.vehicle);
           if (!v) continue;
           const sightingData = { 
             ...s, 
             _plate: v.plate, _state: v.state, _make: v.make, _model: v.model, 
             _color: v.color, _registration: v.registration, _vehicleId: v.id 
           };
           // Associate sighting with VINs via both relation fields
           if (v.vin_relation) {
              const vinObj = vinMap.get(v.vin_relation);
              if (vinObj) {
                 vinObj.sightings.push({ ...sightingData, _title_issues: vinObj.title_issues });
              }
           }
           if (v.physical_vin_relation && v.physical_vin_relation !== v.vin_relation) {
              const physVinObj = vinMap.get(v.physical_vin_relation);
              if (physVinObj) {
                 physVinObj.sightings.push({ ...sightingData, _title_issues: physVinObj.title_issues });
              }
           }
        }
        
        const grouped = statsRes.items.map(s => vinMap.get(s.id)).filter(Boolean);
        setRecords(grouped);
      }
    } catch (e) {
      console.error('Fetch error:', e);
    }
    setLoading(false);
  };

  // eslint-disable-next-line
  useEffect(() => { fetchRecords(); }, [page, filterPlate, sortBy, viewMode, filterVehicleVinOnly]);

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

  const toggleExpand = (recordId) => {
    setExpandedPlates(prev => {
      const next = new Set(prev);
      next.has(recordId) ? next.delete(recordId) : next.add(recordId);
      return next;
    });
  };

  const bulkSetSearchable = async (value) => {
    const vIds = new Set();
    records.forEach(v => {
      v.sightings.forEach(s => {
        if (selected.has(s.id)) vIds.add(v.isVinMode ? s._vehicleId : v.id);
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
    setEditingVehicleId(v.isVinMode ? r._vehicleId : v.id);
    setEditData({
      plate: (v.isVinMode ? r._plate : v.plate) || '',
      state: (v.isVinMode ? r._state : v.state) || '',
      make: (v.isVinMode ? r._make : v.make) || '',
      model: (v.isVinMode ? r._model : v.model) || '',
      color: (v.isVinMode ? r._color : v.color) || '',
      ice: r.ice || '',
      match_status: r.match_status || '',
      registration: (v.isVinMode ? r._registration : v.registration) || '',
      vin:          v.isVinMode ? v.vin :          (v._vin          || ''),
      physical_vin: v.isVinMode ? ''   :          (v._physical_vin || ''),
      title_issues: v.isVinMode ? v.title_issues : (v._title_issues || ''),
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
      // Handle Plate VIN: find-or-create in vins collection
      let vinRelationId = null;
      if (editData.vin) {
        const vinRec = await findOrCreateVin(pb, editData.vin, editData.title_issues);
        vinRelationId = vinRec?.id || null;
      }
      // Handle Physical VIN separately
      let physVinRelationId = null;
      if (editData.physical_vin) {
        const physVinRec = await findOrCreateVin(pb, editData.physical_vin, '');
        physVinRelationId = physVinRec?.id || null;
      }

      const vData = {
        plate: editData.plate, state: editData.state, make: editData.make,
        model: editData.model, color: editData.color, registration: editData.registration,
        vin_relation:          vinRelationId     || '',
        physical_vin_relation: physVinRelationId || '',
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

  const handleSearchableToggle = async (v, currentSearchable) => {
    try {
      if (v.isVinMode) {
         const vehicles = await pb.collection('vehicles').getFullList({ filter: `vin_relation = "${v.id}"` });
         for (const veh of vehicles) {
            await pb.collection('vehicles').update(veh.id, { searchable: !currentSearchable });
         }
      } else {
         await pb.collection('vehicles').update(v.id, { searchable: !currentSearchable });
      }
      fetchRecords(); // Refetch to correctly bubble searchable state to vehicle root
    } catch (e) {
      console.error('Toggle failed:', e);
    }
  };

  return (
    <div className="page">
      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className="admin-title" style={{ margin: 0 }}>Records Manager</h1>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
            <div className="btn-group flex gap-sm bg-base-200 p-1" style={{ borderRadius: 'var(--radius-md)' }}>
              <button className={`btn btn-sm ${viewMode === 'plate' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setViewMode('plate'); setPage(1); }}>Plate View</button>
              <button className={`btn btn-sm ${viewMode === 'vin' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setViewMode('vin'); setPage(1); }}>VIN View</button>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {viewMode === 'plate' ? 'sort and search by plate' : 'sort and search by vin'}
            </span>
          </div>
        </div>

        {/* Toolbar */}
        <div className="records-toolbar">
          <div className="records-toolbar-left">
            <input
              className="input"
              placeholder={viewMode === 'vin' ? 'Filter by VIN...' : 'Filter by plate...'}
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
              <option value="-sightings">Sightings (Most)</option>
              <option value="sightings">Sightings (Least)</option>
              {viewMode === 'plate' && <option value="plate">Plate (A-Z)</option>}
              {viewMode === 'plate' && <option value="-plate">Plate (Z-A)</option>}
              <option value="location">Location (A-Z)</option>
              <option value="-location">Location (Z-A)</option>
              <option value="-searchable">Searchable (Yes first)</option>
              <option value="searchable">Searchable (No first)</option>
            </select>
            <button
              className={`btn btn-sm ${filterVehicleVinOnly ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setFilterVehicleVinOnly(v => !v); setPage(1); }}
              title="Show only vehicles with a physical (dash-inspected) VIN"
            >
              🚗 Vehicle VINs only
            </button>
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
                <th>{viewMode === 'vin' ? 'VIN' : 'Plate'}</th>
                {viewMode === 'vin' ? (
                  <>
                    <th>Plates</th>
                    <th>Title Issues</th>
                    <th>Latest Sighting</th>
                    <th colSpan={4}>Sightings</th>
                  </>
                ) : (
                  <>
                    <th>State</th>
                    <th>Date</th>
                    <th>Make</th>
                    <th>Model</th>
                    <th>ICE</th>
                    <th>Matches Reg.?</th>
                    <th>Location</th>
                  </>
                )}
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
                <React.Fragment key={v.id}>
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
                      <div><strong>{v.isVinMode ? (v.vin || 'Unknown VIN') : v.plate}</strong></div>
                      {!v.isVinMode && v._physical_vin && v._physical_vin !== v._vin && (
                        <span className="badge badge-warning" style={{ fontSize: '0.7rem', marginTop: '4px' }}>⚠️ VIN Discrepancy</span>
                      )}
                      {!v.isVinMode && v.sightings.length > 1 && (
                        <div style={{ marginTop: '4px' }}>
                          <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                            {v.sightings.length} sightings
                          </span>
                        </div>
                      )}
                    </td>
                    {v.isVinMode ? (
                      <>
                        <td>{v.plate_list ? v.plate_list.split(',').join(', ') : '—'}</td>
                        <td>{v.title_issues || '—'}</td>
                        <td>{v.latest_sighting ? new Date(v.latest_sighting).toLocaleDateString('en-US', { timeZone: 'UTC' }) : '—'}</td>
                        <td colSpan={4}>
                          <span className="badge badge-warning" style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem' }}>
                            {v.sightings.length} sighting{v.sightings.length !== 1 ? 's' : ''}
                          </span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{v.state}</td>
                        <td>{v.sightings[0]?.date ? new Date(v.sightings[0].date).toLocaleDateString('en-US', { timeZone: 'UTC' }) : '—'}</td>
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
                      </>
                    )}
                    <td>
                      <button
                        className={`btn btn-sm ${v.searchable ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => handleSearchableToggle(v, v.searchable)}
                      >
                        {v.searchable ? '✓ Yes' : '✕ No'}
                      </button>
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleExpand(v.id)}>
                        {expandedPlates.has(v.id) ? '▲ Hide' : '▼ Expand'}
                      </button>
                    </td>
                  </tr>

                  {/* ===== EXPANDED SIGHTINGS SUB-ROWS ===== */}
                  {expandedPlates.has(v.id) && v.sightings.map(r => (
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
                                  {COLORS_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                              </label>
                              <label>ICE
                                <select className="select select-sm" value={editData.ice} onChange={e => updateEditField('ice', e.target.value)}>
                                  <option value="">—</option>
                                  {ICE_LIST.map(v => <option key={v} value={v}>{v}</option>)}
                                </select>
                              </label>
                              <label>Matches Reg.?
                                <select className="select select-sm" value={editData.match_status} onChange={e => updateEditField('match_status', e.target.value)}>
                                  {MATCH_LIST.map(v => <option key={v || '__blank'} value={v}>{v || '—'}</option>)}
                                </select>
                              </label>
                              <label>Location<input className="input input-sm" value={editData.location} onChange={e => updateEditField('location', e.target.value)} /></label>
                              <label>Date<input className="input input-sm" value={editData.date} onChange={e => updateEditField('date', e.target.value)} /></label>
                              <label>Registration<input className="input input-sm" value={editData.registration} onChange={e => updateEditField('registration', e.target.value)} /></label>
                              <label>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                  VIN (Plate)
                                  <span
                                    title="The VIN returned by a license plate lookup (e.g. PlateToVin database). This is the VIN associated with the registered owner of the plate."
                                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '1rem', height: '1rem', borderRadius: '50%', background: 'var(--text-muted)', color: 'var(--bg-primary)', fontSize: '0.65rem', fontWeight: 700, cursor: 'help', flexShrink: 0 }}
                                  >?</span>
                                </span>
                                <input className="input input-sm" value={editData.vin} onChange={e => updateEditField('vin', e.target.value)} />
                              </label>
                              <label>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                  VIN (Vehicle / Physical)
                                  <span
                                    title="The VIN physically observed on the vehicle's dashboard or door jamb during an in-person inspection. Use this when the dash VIN differs from the plate lookup result — a common sign of a cloned or stolen plate."
                                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '1rem', height: '1rem', borderRadius: '50%', background: 'var(--text-muted)', color: 'var(--bg-primary)', fontSize: '0.65rem', fontWeight: 700, cursor: 'help', flexShrink: 0 }}
                                  >?</span>
                                </span>
                                <input className="input input-sm" value={editData.physical_vin} onChange={e => updateEditField('physical_vin', e.target.value)} placeholder="Leave blank if same as Plate VIN" />
                              </label>
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
                        {v.isVinMode ? (
                          <>
                            <td>{r._plate || '—'}</td>
                            <td style={{ opacity: 0.5 }}>—</td>
                            <td>{r.date ? new Date(r.date).toLocaleDateString('en-US', { timeZone: 'UTC' }) : '—'}</td>
                            <td colSpan={4}>{r.location || '—'}</td>
                          </>
                        ) : (
                          <>
                            <td style={{ opacity: 0.5 }}>—</td>
                            <td>{r.date ? new Date(r.date).toLocaleDateString('en-US', { timeZone: 'UTC' }) : '—'}</td>
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
                          </>
                        )}
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

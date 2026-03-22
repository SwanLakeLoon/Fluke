import { useState, useEffect } from 'react';
import { pb } from '../../api/client';
import './AdminPages.css';

const VALID_COLORS = ['BR', 'GR', 'BK', 'BL', 'TN', 'SL', 'R', 'WH', 'GN', 'GD'];
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
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null); // 'single:id' or 'bulk'

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const filter = filterPlate ? `plate ~ "${filterPlate}"` : '';
      const res = await pb.collection('alpr_records').getList(page, 25, {
        filter: filter || undefined,
        sort: '-plate',
      });
      setRecords(res.items);
      setTotalPages(res.totalPages);
      setTotalItems(res.totalItems);
    } catch (e) {
      console.error('Fetch error:', e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchRecords(); }, [page, filterPlate]);

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === records.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(records.map(r => r.id)));
    }
  };

  const bulkSetSearchable = async (value) => {
    for (const id of selected) {
      try {
        await pb.collection('alpr_records').update(id, { searchable: value });
      } catch (e) {
        console.error(`Failed to update ${id}:`, e);
      }
    }
    setSelected(new Set());
    fetchRecords();
  };

  // --- Inline Edit ---
  const startEdit = (record) => {
    setEditingId(record.id);
    setEditData({
      plate: record.plate || '',
      state: record.state || '',
      make: record.make || '',
      model: record.model || '',
      color: record.color || '',
      ice: record.ice || '',
      match_status: record.match_status || '',
      registration: record.registration || '',
      vin: record.vin || '',
      title_issues: record.title_issues || '',
      notes: record.notes || '',
      location: record.location || '',
      date: record.date || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  const saveEdit = async () => {
    try {
      await pb.collection('alpr_records').update(editingId, editData);
      setRecords(prev => prev.map(r => r.id === editingId ? { ...r, ...editData } : r));
      setEditingId(null);
      setEditData({});
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
      await pb.collection('alpr_records').delete(id);
      setConfirmDelete(null);
      fetchRecords();
    } catch (e) {
      console.error('Delete failed:', e);
      alert('Delete failed: ' + (e.message || 'Unknown error'));
    }
  };

  const bulkDelete = async () => {
    for (const id of selected) {
      try {
        await pb.collection('alpr_records').delete(id);
      } catch (e) {
        console.error(`Delete ${id} failed:`, e);
      }
    }
    setSelected(new Set());
    setConfirmDelete(null);
    fetchRecords();
  };

  const handleSearchableToggle = async (id, current) => {
    try {
      await pb.collection('alpr_records').update(id, { searchable: !current });
      setRecords(prev => prev.map(r => r.id === id ? { ...r, searchable: !current } : r));
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
                <th><input type="checkbox" onChange={selectAll} checked={selected.size === records.length && records.length > 0} /></th>
                <th>Plate</th>
                <th>State</th>
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
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem' }}>Loading...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem' }}>No records found</td></tr>
              ) : records.map(r => (
                editingId === r.id ? (
                  /* ===== INLINE EDIT ROW ===== */
                  <tr key={r.id} className="editing-row">
                    <td colSpan={10}>
                      <div className="inline-edit-form">
                        <div className="edit-grid">
                          <label>
                            Plate
                            <input className="input input-sm" value={editData.plate} onChange={e => updateEditField('plate', e.target.value)} maxLength={10} />
                          </label>
                          <label>
                            State
                            <input className="input input-sm" value={editData.state} onChange={e => updateEditField('state', e.target.value.toUpperCase())} maxLength={2} />
                          </label>
                          <label>
                            Make
                            <input className="input input-sm" value={editData.make} onChange={e => updateEditField('make', e.target.value)} />
                          </label>
                          <label>
                            Model
                            <input className="input input-sm" value={editData.model} onChange={e => updateEditField('model', e.target.value)} />
                          </label>
                          <label>
                            Color
                            <select className="select select-sm" value={editData.color} onChange={e => updateEditField('color', e.target.value)}>
                              <option value="">—</option>
                              {VALID_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </label>
                          <label>
                            ICE
                            <select className="select select-sm" value={editData.ice} onChange={e => updateEditField('ice', e.target.value)}>
                              <option value="">—</option>
                              {VALID_ICE.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                          </label>
                          <label>
                            Matches Reg.?
                            <select className="select select-sm" value={editData.match_status} onChange={e => updateEditField('match_status', e.target.value)}>
                              {VALID_MATCH.map(v => <option key={v || '__blank'} value={v}>{v || '—'}</option>)}
                            </select>
                          </label>
                          <label>
                            Location
                            <input className="input input-sm" value={editData.location} onChange={e => updateEditField('location', e.target.value)} />
                          </label>
                          <label>
                            Date
                            <input className="input input-sm" value={editData.date} onChange={e => updateEditField('date', e.target.value)} />
                          </label>
                          <label>
                            Registration
                            <input className="input input-sm" value={editData.registration} onChange={e => updateEditField('registration', e.target.value)} />
                          </label>
                          <label>
                            VIN
                            <input className="input input-sm" value={editData.vin} onChange={e => updateEditField('vin', e.target.value)} />
                          </label>
                          <label>
                            Notes
                            <input className="input input-sm" value={editData.notes} onChange={e => updateEditField('notes', e.target.value)} />
                          </label>
                        </div>
                        <div className="edit-actions">
                          <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
                          <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  /* ===== NORMAL ROW ===== */
                  <tr key={r.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                      />
                    </td>
                    <td><strong>{r.plate}</strong></td>
                    <td>{r.state}</td>
                    <td>{r.make}</td>
                    <td>{r.model}</td>
                    <td>
                      <span className={`badge ${r.ice === 'Y' || r.ice === 'HS' ? 'badge-warning' : 'badge-muted'}`}>
                        {r.ice}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${r.match_status === 'N' ? 'badge-warning' : 'badge-muted'}`}>
                        {r.match_status || '—'}
                      </span>
                    </td>
                    <td>{r.location}</td>
                    <td>
                      <button
                        className={`btn btn-sm ${r.searchable ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => handleSearchableToggle(r.id, r.searchable)}
                      >
                        {r.searchable ? '✓ Yes' : '✕ No'}
                      </button>
                    </td>
                    <td>
                      <div className="flex gap-sm">
                        <button className="btn btn-ghost btn-sm" onClick={() => startEdit(r)} title="Edit">
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

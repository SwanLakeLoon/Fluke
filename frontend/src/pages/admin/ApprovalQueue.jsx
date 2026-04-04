import { useState, useEffect } from 'react';
import { pb } from '../../api/client';
import { processBatch } from '../../utils/ingestPipeline';
import './AdminPages.css';

export default function ApprovalQueue({ embedded = false }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [showAllRowsId, setShowAllRowsId] = useState(null);
  const [removedRows, setRemovedRows] = useState({}); // { [batchId]: Set<index> }
  const [processing, setProcessing] = useState(null); // batch id being processed
  const [approvalResult, setApprovalResult] = useState(null);

  const fetchBatches = async () => {
    setLoading(true);
    try {
      const res = await pb.collection('upload_batches').getList(1, 50, {
        filter: 'status = "pending"',
        expand: 'uploaded_by',
      });
      setBatches(res.items);
    } catch (e) {
      console.error('Failed to fetch batches:', e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchBatches(); }, []);

  const handleRemoveRow = async (batch, rowIndex) => {
    // Remove from local state
    setRemovedRows(prev => {
      const next = { ...prev };
      next[batch.id] = new Set([...(prev[batch.id] || []), rowIndex]);
      return next;
    });

    // Persist trimmed rows back to PocketBase
    const removed = new Set([...(removedRows[batch.id] || []), rowIndex]);
    const newRows = (batch.rows || []).filter((_, i) => !removed.has(i));
    try {
      const updated = await pb.collection('upload_batches').update(batch.id, {
        rows: newRows,
        row_count: newRows.length,
      });
      // Sync local batch state
      setBatches(prev => prev.map(b => b.id === batch.id ? { ...b, rows: updated.rows, row_count: updated.row_count } : b));
      // Clear the removed-set since it's now persisted
      setRemovedRows(prev => { const next = { ...prev }; delete next[batch.id]; return next; });
    } catch (e) {
      console.error('Failed to save row removal:', e);
      // Revert local state on failure
      setRemovedRows(prev => {
        const next = { ...prev };
        const s = new Set(prev[batch.id] || []);
        s.delete(rowIndex);
        next[batch.id] = s;
        return next;
      });
    }
  };

  const handleApprove = async (batch) => {
    const rowCount = batch.rows?.length ?? batch.row_count;
    if (!window.confirm(`Approve this batch of ${rowCount} rows from "${batch.filename}"?`)) return;

    // Double-approval guard: re-fetch to confirm still pending
    try {
      const fresh = await pb.collection('upload_batches').getOne(batch.id);
      if (fresh.status !== 'pending') {
        alert('This batch has already been processed.');
        fetchBatches();
        return;
      }
    } catch (e) {
      alert('Failed to verify batch status: ' + e.message);
      return;
    }

    setProcessing(batch.id);
    setApprovalResult(null);

    const rows = batch.rows || [];
    const uploaderName = batch.expand?.uploaded_by?.name ||
      batch.expand?.uploaded_by?.username ||
      batch.expand?.uploaded_by?.email ||
      'Unknown';
    const batchLabel = `${batch.filename} (by ${uploaderName} - Batch ID: ${batch.id})`;

    const { inserted, dupsQueued, errors } = await processBatch(pb, rows, batchLabel);

    // Mark batch as approved
    try {
      await pb.collection('upload_batches').update(batch.id, { status: 'approved' });
    } catch (e) {
      console.error('Failed to update batch status:', e);
    }

    setApprovalResult({ batchId: batch.id, inserted, dupsQueued, errors });
    setProcessing(null);
    setBatches(prev => prev.filter(b => b.id !== batch.id));
  };

  const handleReject = async (batch) => {
    if (!window.confirm(`Reject this batch of ${batch.row_count} rows from "${batch.filename}"? No records will be ingested.`)) return;
    try {
      await pb.collection('upload_batches').update(batch.id, { status: 'rejected' });
      setBatches(prev => prev.filter(b => b.id !== batch.id));
    } catch (e) {
      alert('Failed to reject batch: ' + e.message);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  };

  const inner = (
    <>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)', fontSize: '0.95rem', maxWidth: '800px', lineHeight: 1.5 }}>
          CSV batches uploaded by non-admin users are held here for review.
          Approve a batch to run it through the standard ingestion pipeline (with duplicate detection),
          or reject it to discard entirely.
        </p>

        {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}

        {!loading && batches.length === 0 && !approvalResult && (
          <div className="search-empty animate-fadeIn">
            <div className="search-empty-icon">✅</div>
            <h2>No pending batches</h2>
            <p>All uploaded batches have been reviewed.</p>
          </div>
        )}

        {/* Approval result summary */}
        {approvalResult && (
          <div className="import-result glass-card animate-fadeIn" style={{ marginBottom: 'var(--space-lg)' }}>
            <h3>Batch Approved</h3>
            <div className="result-stats">
              <div className="result-stat">
                <span className="result-num" style={{ color: 'var(--success)' }}>{approvalResult.inserted}</span>
                <span>Inserted</span>
              </div>
              <div className="result-stat">
                <span className="result-num" style={{ color: 'var(--warning)' }}>{approvalResult.dupsQueued}</span>
                <span>Duplicates Queued</span>
              </div>
              {approvalResult.errors > 0 && (
                <div className="result-stat">
                  <span className="result-num" style={{ color: 'var(--danger)' }}>{approvalResult.errors}</span>
                  <span>Errors</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Batch list */}
        {batches.map(batch => (
          <div key={batch.id} className="glass-card animate-fadeIn" style={{ marginBottom: 'var(--space-md)' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: expandedId === batch.id ? 'var(--space-md)' : 0 }}>
              <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === batch.id ? null : batch.id)}>
                <div className="flex items-center gap-sm" style={{ marginBottom: '4px' }}>
                  <span className="badge badge-warning">Pending</span>
                  <strong style={{ fontSize: '1rem' }}>{batch.filename}</strong>
                  <span style={{ fontSize: '0.85rem', color: 'var(--primary)', marginLeft: 'var(--space-sm)' }}>
                    {expandedId === batch.id ? '▼ Hide Preview' : '▶ View Records'}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Uploaded by <strong>{batch.expand?.uploaded_by?.name || batch.expand?.uploaded_by?.username || batch.expand?.uploaded_by?.email || '—'}</strong> • {formatDate(batch.created)} • {batch.row_count} rows
                </div>
              </div>
              <div className="flex gap-sm" style={{ flexShrink: 0 }}>
                <button 
                  className="btn btn-primary btn-sm" 
                  onClick={() => handleApprove(batch)}
                  disabled={processing === batch.id}
                >
                  {processing === batch.id ? 'Processing...' : '✅ Approve'}
                </button>
                <button 
                  className="btn btn-sm"
                  style={{ background: 'transparent', color: 'var(--danger)', border: '1px solid rgba(248,113,113,0.3)' }}
                  onClick={() => handleReject(batch)}
                  disabled={processing === batch.id}
                >
                  ✗ Reject
                </button>
              </div>
            </div>

            {/* Expanded row preview */}
            {expandedId === batch.id && batch.rows && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-md)', marginTop: 'var(--space-md)' }}>
                <div className="table-wrapper" style={{ padding: 0, overflow: 'auto', maxHeight: '400px' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                      <th></th>
                        <th>#</th>
                        <th>Plate</th>
                        <th>State</th>
                        <th>Make</th>
                        <th>Model</th>
                        <th>ICE</th>
                        <th>Location</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(showAllRowsId === batch.id ? batch.rows : batch.rows.slice(0, 50)).map((row, i) => (
                        <tr key={i}>
                            <td>
                              <button
                                title="Remove this row from batch"
                                onClick={(e) => { e.stopPropagation(); handleRemoveRow(batch, batch.rows.indexOf(row)); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '1rem', padding: '0 4px', lineHeight: 1 }}
                              >✕</button>
                            </td>
                          <td>{i + 1}</td>
                          <td><strong>{row.plate}</strong></td>
                          <td>{row.state}</td>
                          <td>{row.make}</td>
                          <td>{row.model}</td>
                          <td>{row.ice}</td>
                          <td>{row.location}</td>
                          <td>{row.date ? new Date(row.date).toLocaleDateString('en-US', { timeZone: 'UTC' }) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {batch.rows.length > 50 && (
                    <div style={{ textAlign: 'center', padding: 'var(--space-sm)' }}>
                      {showAllRowsId === batch.id ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => setShowAllRowsId(null)}>Hide expanded rows</button>
                      ) : (
                        <button className="btn btn-ghost btn-sm" onClick={() => setShowAllRowsId(batch.id)}>
                          Show all {batch.rows.length} rows
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
    </>
  );

  if (embedded) return inner;
  return (
    <div className="page">
      <div className="container" style={{ maxWidth: '1100px' }}>
        <h1 className="admin-title">Approval Queue</h1>
        {inner}
      </div>
    </div>
  );
}

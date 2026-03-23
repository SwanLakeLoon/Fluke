import { useState, useEffect } from 'react';
import { pb } from '../../api/client';
import './AdminPages.css';

export default function ApprovalQueue() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [processing, setProcessing] = useState(null); // batch id being processed
  const [approvalResult, setApprovalResult] = useState(null);

  const fetchBatches = async () => {
    setLoading(true);
    try {
      const res = await pb.collection('upload_batches').getList(1, 50, {
        filter: 'status = "pending"',
        sort: '-created',
        expand: 'uploaded_by',
      });
      setBatches(res.items);
    } catch (e) {
      console.error('Failed to fetch batches:', e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchBatches(); }, []);

  const handleApprove = async (batch) => {
    if (!window.confirm(`Approve this batch of ${batch.row_count} rows from "${batch.filename}"?`)) return;

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
    let inserted = 0, dupsQueued = 0, errors = 0;

    for (const record of rows) {
      // Duplicate check
      try {
        const filterParts = [`plate = "${record.plate}"`];
        if (record.date) {
          filterParts.push(`date = "${record.date}"`);
        } else {
          filterParts.push('date = ""');
        }
        if (record.location) {
          filterParts.push(`location = "${record.location}"`);
        } else {
          filterParts.push('location = ""');
        }
        const check = await pb.collection('alpr_records').getList(1, 1, {
          filter: filterParts.join(' && '),
        });

        if (check.totalItems > 0) {
          const uploaderName = batch.expand?.uploaded_by?.username || batch.expand?.uploaded_by?.email || 'Unknown';
          await pb.collection('duplicate_queue').create({
            raw_data: record,
            reason: `Duplicate: same plate+date+location (plate=${record.plate})`,
            status: 'pending',
            import_batch: `${batch.filename} (by ${uploaderName} - Batch ID: ${batch.id})`,
            existing_record_id: check.items[0]?.id,
          });
          dupsQueued++;
          continue;
        }
      } catch (e) {
        console.error('Dup check error:', e);
      }

      // Insert
      try {
        await pb.collection('alpr_records').create(record);
        inserted++;
      } catch (e) {
        console.error('Insert error:', e);
        errors++;
      }
    }

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

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: '1100px' }}>
        <h1 className="admin-title">Approval Queue</h1>

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
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Uploaded by <strong>{batch.expand?.uploaded_by?.username || batch.expand?.uploaded_by?.email || '—'}</strong> • {formatDate(batch.created)} • {batch.row_count} rows
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
                      {batch.rows.slice(0, 50).map((row, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td><strong>{row.plate}</strong></td>
                          <td>{row.state}</td>
                          <td>{row.make}</td>
                          <td>{row.model}</td>
                          <td>{row.ice}</td>
                          <td>{row.location}</td>
                          <td>{row.date ? new Date(row.date).toLocaleDateString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {batch.rows.length > 50 && (
                    <p style={{ padding: 'var(--space-sm)', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center' }}>
                      Showing first 50 of {batch.rows.length} rows
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

import React, { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import './HelpDrawer.css';

export default function HelpDrawer({ isOpen, onClose }) {
  const { isAdmin, isApprover, isUploader } = useAuth();

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="help-backdrop animate-fadeIn" onClick={onClose} />
      
      <div className={`help-drawer ${isOpen ? 'open' : ''}`}>
        <div className="help-header">
          <h2>Fluke User Guide</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} title="Close guide">
            ✕
          </button>
        </div>

        <div className="help-content">
          <p className="help-intro">
            Welcome to Fluke! Click any section below to learn how to use the platform.
          </p>

          <details className="help-section" open>
            <summary>🔍 Searching Records</summary>
            <div className="help-section-content">
              <ul>
                <li>Type a plate, state, make, or model — results update in real-time.</li>
                <li>All filters combine together (e.g. Plate + State).</li>
                <li>
                  <strong>Note on Searchability:</strong> Searchable records are those confirmed ICE or otherwise deemed suspicious.
                </li>
              </ul>
            </div>
          </details>

          <details className="help-section">
            <summary>🃏 Reading Results</summary>
            <div className="help-section-content">
              <ul>
                <li>Results are grouped by plate number.</li>
                <li>Expand the <strong>Sightings</strong> accordion to see all locations and dates a vehicle was spotted.</li>
                <li><span className="badge badge-warning" style={{display:'inline-block'}}>ICE</span> HIghlighted ICE badge means vehicle was found in defrost.</li>
                <li><span className="badge" style={{display:'inline-block', background:'var(--bg)', border:'1px solid var(--border)', color:'var(--text-muted)'}}>Matches Reg.?</span> badge indicates if the vehicle's registration matches its plate number.</li>
              </ul>
            </div>
          </details>

          {/* --- UPLOADER FEATURES --- */}
          {isUploader && (
            <>
              <div className="help-admin-divider">
                <span>{isAdmin ? 'Admin Features' : isApprover ? 'Approver Features' : 'Uploader Features'}</span>
              </div>

              <details className="help-section">
                <summary>📤 CSV Upload</summary>
                <div className="help-section-content">
                  <ul>
                    <li>Drag & drop or select a <code>.csv</code> file to import new records.</li>
                    <li>Need a template? Download the <a href="/template.csv" download style={{textDecoration: 'underline'}}>example CSV template</a>.</li>
                    <li>The preview table shows whether each row is <strong>Valid</strong> or <strong>Invalid</strong>.</li>
                    <li><strong>Important:</strong> Any row marked as Invalid will be completely discarded and not ingested.</li>
                    {isAdmin ? (
                      <li>As an admin, records are ingested <strong>directly</strong> into the database. The Prior Sightings panel will show you at a glance if plates in your batch have been spotted historically.</li>
                    ) : (
                      <li>Your upload will be <strong>staged for approval</strong>. An admin or approver must review and approve your batch before data enters the database.</li>
                    )}
                  </ul>
                </div>
              </details>
            </>
          )}

          {/* --- APPROVER FEATURES --- */}
          {isApprover && (
            <>
              <details className="help-section">
                <summary>📥 Queues</summary>
                <div className="help-section-content">
                  <p style={{ marginBottom: '0.75rem' }}>
                    The <strong>Queues</strong> page combines two review workflows in one place.
                    Use the toggle at the top of the page to switch between them.
                  </p>

                  <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>✅ Approvals</div>
                  <ul style={{ marginBottom: '1rem' }}>
                    <li>Batches uploaded by non-admin users appear here awaiting review.</li>
                    <li>Click a batch to see a preview of all rows before deciding.</li>
                    <li><strong>Approve:</strong> Runs the batch through the ingestion pipeline (with duplicate detection).</li>
                    <li><strong>Reject:</strong> Discards the entire batch — no records are ingested.</li>
                  </ul>

                  <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>🔄 Duplicates</div>
                  <p style={{ marginBottom: '0.5rem' }}>
                    Populated when an incoming row matches the exact <strong>Plate + Date + Location</strong> of an existing database record.
                    Records are <strong>not</strong> ingested until the conflict is resolved.
                  </p>
                  <div className="help-actions-list">
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Options for conflict resolution:</div>
                    <div><strong>➕ Keep Both:</strong> Inserts incoming as a new separate row.</div>
                    <div><strong>🔄 Replace Existing:</strong> Overwrites existing record with new data.</div>
                    <div><strong>🚫 Reject Incoming:</strong> Discards incoming; database remains unchanged.</div>
                  </div>
                </div>
              </details>
            </>
          )}

          {/* --- ADMIN-ONLY FEATURES --- */}
          {isAdmin && (
            <>
              <details className="help-section">
                <summary>📋 Records Manager</summary>
                <div className="help-section-content">
                  <ul>
                    <li>Browse all records, including hidden/non-searchable ones.</li>
                    <li>Inline-edit any field by clicking on it directly in the table row.</li>
                    <li>Toggle the <strong>Searchable</strong> switch to control whether a record appears in the public search.</li>
                    <li><strong>⬇️ Export CSV:</strong> Downloads a CSV of <em>all</em> records matching the current filters and sort — not just the current page. Works in both Plate and VIN view.</li>
                  </ul>
                </div>
              </details>

              <details className="help-section">
                <summary>👥 User Manager</summary>
                <div className="help-section-content">
                  <ul>
                    <li>Create new users with a username and password.</li>
                    <li>Reset any user's password if they forget it.</li>
                    <li>Assign one of four roles:</li>
                  </ul>
                  <div className="help-actions-list">
                    <div><strong>user:</strong> Search only</div>
                    <div><strong>uploader:</strong> Search + Upload CSV (staged for approval)</div>
                    <div><strong>approver:</strong> All of uploader + Queues (Approvals &amp; Duplicates)</div>
                    <div><strong>admin:</strong> Full access: direct ingest, approve, records, users</div>
                  </div>
                </div>
              </details>
            </>
          )}
        </div>
      </div>
    </>
  );
}

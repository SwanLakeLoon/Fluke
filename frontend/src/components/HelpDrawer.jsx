import React, { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import './HelpDrawer.css';

export default function HelpDrawer({ isOpen, onClose }) {
  const { isAdmin } = useAuth();

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

          {isAdmin && (
            <>
              <div className="help-admin-divider">
                <span>Admin Features</span>
              </div>

              <details className="help-section">
                <summary>📤 CSV Upload</summary>
                <div className="help-section-content">
                  <ul>
                    <li>Drag & drop or select a <code>.csv</code> file to import new records.</li>
                    <li>The preview table shows whether each row is <strong>Valid</strong> or <strong>Invalid</strong>.</li>
                    <li><strong>Important:</strong> Any row marked as Invalid will be completely discarded and not ingested.</li>
                    <li>Once imported, the Prior Sightings panel will show you at a glance if plates in your batch have been spotted historically.</li>
                  </ul>
                </div>
              </details>

              <details className="help-section">
                <summary>🔄 Duplicate Review</summary>
                <div className="help-section-content">
                  <p style={{marginBottom: '0.5rem'}}>
                    Populated when an incoming row matches the exact <strong>Plate + Date + Location</strong> of an existing database record.
                    <br/><br/>
                    <strong>Note:</strong> Records are not officially ingested into the database until the duplicate conflict is resolved.
                  </p>
                  <div className="help-actions-list">
                    <div style={{fontWeight: 600, color: 'var(--text-primary)'}}>Options for conflict resolution are:</div>
                    <div><strong>➕ Keep Both:</strong> Inserts incoming as a new separate row.</div>
                    <div><strong>🔄 Replace Existing:</strong> Overwrites existing record with new data.</div>
                    <div><strong>🚫 Reject Incoming:</strong> Discards incoming; database remains unchanged.</div>
                  </div>
                </div>
              </details>

              <details className="help-section">
                <summary>📋 Records Manager</summary>
                <div className="help-section-content">
                  <ul>
                    <li>Browse all records, including hidden/non-searchable ones.</li>
                    <li>Inline-edit any field by clicking on it directly in the table row.</li>
                    <li>Toggle the <strong>Searchable</strong> switch to control whether a record appears in the public search.</li>
                  </ul>
                </div>
              </details>

              <details className="help-section">
                <summary>👥 User Manager</summary>
                <div className="help-section-content">
                  <ul>
                    <li>Create new users using a username, email, and password.</li>
                    <li>Reset any user's password if they forget it.</li>
                    <li>Promote or demote users between <code>user</code> and <code>admin</code> roles.</li>
                  </ul>
                </div>
              </details>
            </>
          )}
        </div>
      </div>
    </>
  );
}

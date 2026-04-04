import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ApprovalQueue from './ApprovalQueue';
import DuplicateReview from './DuplicateReview';
import './AdminPages.css';

const TABS = [
  { key: 'approvals', label: '✅ Approvals' },
  { key: 'duplicates', label: '🔄 Duplicates' },
];

export default function Queues() {
  const location = useLocation();
  const navigate = useNavigate();

  // Allow ?tab=duplicates or ?tab=approvals in the URL to deep-link
  const params = new URLSearchParams(location.search);
  const initialTab = params.get('tab') === 'duplicates' ? 'duplicates' : 'approvals';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Keep the URL in sync when the tab changes so the user can share/bookmark
  useEffect(() => {
    const next = new URLSearchParams(location.search);
    next.set('tab', activeTab);
    navigate({ search: next.toString() }, { replace: true });
  }, [activeTab, navigate]);

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: '1100px' }}>
        {/* Page header */}
        <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-lg)' }}>
          <h1 className="admin-title" style={{ marginBottom: 0 }}>Queues</h1>

          {/* Toggle pill */}
          <div
            style={{
              display: 'flex',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '999px',
              padding: '3px',
              gap: '2px',
            }}
          >
            {TABS.map(tab => (
              <button
                key={tab.key}
                id={`queues-tab-${tab.key}`}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '0.35rem 1.1rem',
                  borderRadius: '999px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: activeTab === tab.key ? 600 : 400,
                  background: activeTab === tab.key ? 'var(--primary)' : 'transparent',
                  color: activeTab === tab.key ? '#fff' : 'var(--text-secondary)',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Render the active queue — mount both to preserve state, hide inactive */}
        <div style={{ display: activeTab === 'approvals' ? 'block' : 'none' }}>
          <ApprovalQueue embedded />
        </div>
        <div style={{ display: activeTab === 'duplicates' ? 'block' : 'none' }}>
          <DuplicateReview embedded />
        </div>
      </div>
    </div>
  );
}

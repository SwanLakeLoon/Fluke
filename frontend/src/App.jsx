import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { useTheme } from './hooks/useTheme';
import { useIceAlerts } from './hooks/useIceAlerts';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Search from './pages/Search';
import CsvUpload from './pages/admin/CsvUpload';
import DuplicateReview from './pages/admin/DuplicateReview';
import ApprovalQueue from './pages/admin/ApprovalQueue';
import Queues from './pages/admin/Queues';
import RecordManager from './pages/admin/RecordManager';
import UserManager from './pages/admin/UserManager';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>;
  return user ? children : <Navigate to="/login" replace />;
}

function AdminRoute({ children }) {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

function UploaderRoute({ children }) {
  const { user, isUploader, loading } = useAuth();
  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isUploader) return <Navigate to="/" replace />;
  return children;
}

function ApproverRoute({ children }) {
  const { user, isApprover, loading } = useAuth();
  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isApprover) return <Navigate to="/" replace />;
  return children;
}


function IceAlertModal() {
  const { alerts, dismiss } = useIceAlerts();
  if (!alerts.length) return null;

  return (
    <div className="modal-overlay" onClick={dismiss}>
      <div
        className="modal-card glass-card animate-fadeIn"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 520 }}
      >
        <h3 style={{ marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.2rem' }}>⚠️</span> ICE Status Changes Detected
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--space-md)' }}>
          The following plates changed status since the last nightly refresh:
        </p>
        <div style={{ maxHeight: 260, overflowY: 'auto', marginBottom: 'var(--space-lg)' }}>
          <table style={{ width: '100%', fontSize: '0.88rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '4px 8px' }}>Plate</th>
                <th style={{ padding: '4px 8px' }}>Change</th>
                <th style={{ padding: '4px 8px' }}>Sightings</th>
                <th style={{ padding: '4px 8px' }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map(a => (
                <tr key={a.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 600 }}>{a.plate}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{a.old_ice || '—'}</span>
                    {' → '}
                    <span style={{ color: (a.new_ice === 'Y' || a.new_ice === 'HS') ? 'var(--warning)' : 'var(--text-secondary)', fontWeight: 600 }}>
                      {a.new_ice}
                    </span>
                  </td>
                  <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{a.sightings_updated}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    {a.run_date ? new Date(a.run_date).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-md" style={{ justifyContent: 'flex-end' }}>
          <a
            href="/admin/records"
            className="btn btn-ghost btn-sm"
            onClick={dismiss}
          >
            View Records
          </a>
          <button className="btn btn-primary btn-sm" onClick={dismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { user } = useAuth();
  useTheme();

  return (
    <>
      <Navbar />
      <IceAlertModal />
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/" element={<ProtectedRoute><Search /></ProtectedRoute>} />
        <Route path="/upload" element={<UploaderRoute><CsvUpload /></UploaderRoute>} />
        <Route path="/queues" element={<ApproverRoute><Queues /></ApproverRoute>} />
        {/* Legacy redirects — keep old deep links working */}
        <Route path="/approval" element={<Navigate to="/queues?tab=approvals" replace />} />
        <Route path="/duplicates" element={<Navigate to="/queues?tab=duplicates" replace />} />
        <Route path="/admin/records" element={<AdminRoute><RecordManager /></AdminRoute>} />
        <Route path="/admin/users" element={<AdminRoute><UserManager /></AdminRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

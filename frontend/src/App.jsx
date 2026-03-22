import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Search from './pages/Search';
import CsvUpload from './pages/admin/CsvUpload';
import DuplicateReview from './pages/admin/DuplicateReview';
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

function AppRoutes() {
  const { user } = useAuth();

  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/" element={<ProtectedRoute><Search /></ProtectedRoute>} />
        <Route path="/admin/upload" element={<AdminRoute><CsvUpload /></AdminRoute>} />
        <Route path="/admin/duplicates" element={<AdminRoute><DuplicateReview /></AdminRoute>} />
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

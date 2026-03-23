import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import HelpDrawer from './HelpDrawer';

export default function Navbar() {
  const { user, logout, isAdmin, isApprover, isUploader } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [helpOpen, setHelpOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <nav className="navbar">
        <div className="navbar-content">
          <button 
            className="navbar-brand" 
            title="Open User Guide"
            onClick={() => setHelpOpen(true)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            Fluke
            <span style={{ fontSize: '1rem', opacity: 0.7 }}>❓</span>
          </button>
          <div className="navbar-links">
          <NavLink
            to="/"
            className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`}
            end
          >
            Search
          </NavLink>
          {isUploader && (
            <NavLink
              to="/upload"
              className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`}
            >
              Upload CSV
            </NavLink>
          )}
          {isApprover && (
            <>
              <NavLink
                to="/approval"
                className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`}
              >
                Approval Queue
              </NavLink>
              <NavLink
                to="/duplicates"
                className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`}
              >
                Duplicates
              </NavLink>
            </>
          )}
          {isAdmin && (
            <>
              <NavLink
                to="/admin/records"
                className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`}
              >
                Records
              </NavLink>
              <NavLink
                to="/admin/users"
                className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`}
              >
                Users
              </NavLink>
            </>
          )}
          <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 var(--space-xs)' }}></div>
          <button 
            className="btn btn-ghost btn-sm" 
            onClick={toggleTheme}
            style={{ padding: '0.4rem', border: 'none', fontSize: '1.2rem', background: 'transparent' }}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={logout}>
            Logout
          </button>
        </div>
      </div>
    </nav>
    <HelpDrawer isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
  </>
  );
}

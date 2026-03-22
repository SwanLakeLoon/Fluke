import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();

  if (!user) return null;

  return (
    <nav className="navbar">
      <div className="navbar-content">
        <div className="navbar-brand" title="Fluke — Open-source ALPR data explorer">
          Fluke
        </div>
        <div className="navbar-links">
          <NavLink
            to="/"
            className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`}
            end
          >
            Search
          </NavLink>
          {isAdmin && (
            <>
              <NavLink
                to="/admin/upload"
                className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`}
              >
                Upload CSV
              </NavLink>
              <NavLink
                to="/admin/duplicates"
                className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`}
              >
                Duplicates
              </NavLink>
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
          <button className="btn btn-ghost btn-sm" onClick={logout}>
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}

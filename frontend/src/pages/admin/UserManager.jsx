import { useState, useEffect } from 'react';
import { pb } from '../../api/client';
import './AdminPages.css';

export default function UserManager() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await pb.collection('users').getList(1, 50, {});
      setUsers(res.items);
    } catch (e) {
      console.error('Failed to fetch users:', e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    
    const isEmail = newUsername.includes('@');
    const payload = {
      password: newPassword,
      passwordConfirm: newPassword,
      role: newRole,
    };
    
    if (isEmail) {
      payload.email = newUsername.trim();
    } else {
      payload.username = newUsername.trim();
    }

    try {
      await pb.collection('users').create(payload);
      setNewUsername('');
      setNewPassword('');
      fetchUsers();
    } catch (err) {
      // Extract detailed validation errors from PocketBase
      const pbErrors = err?.data?.data || {};
      const detailedMessages = Object.entries(pbErrors)
        .map(([field, errObj]) => `${field}: ${errObj.message}`)
        .join(' | ');
      
      setError(detailedMessages || err?.message || 'Failed to create user');
    }
    setCreating(false);
  };

  const handleResetPassword = async (userId) => {
    const newPass = prompt('Enter new password (min 8 chars):');
    if (!newPass || newPass.length < 8) {
      alert('Password must be at least 8 characters');
      return;
    }
    try {
      await pb.collection('users').update(userId, {
        password: newPass,
        passwordConfirm: newPass,
      });
      alert('Password updated successfully');
    } catch (e) {
      alert('Failed to update password: ' + (e?.message || e));
    }
  };

  const handleChangeRole = async (targetUser, nextRole) => {
    if (targetUser.role === nextRole) return;
    
    // Prevent admin from demoting themselves
    const currentUser = pb.authStore.record;
    if (currentUser?.id === targetUser.id && targetUser.role === 'admin' && nextRole !== 'admin') {
      alert('You cannot demote yourself. Ask another admin to change your role.');
      return;
    }
    
    if (!window.confirm(`Change ${targetUser.username || targetUser.email}'s role from "${targetUser.role || 'user'}" to "${nextRole}"?`)) return;
    try {
      await pb.collection('users').update(targetUser.id, { role: nextRole });
      fetchUsers();
    } catch (e) {
      console.error('Role change failed:', e);
    }
  };

  return (
    <div className="page">
      <div className="container">
        <h1 className="admin-title">User Management</h1>

        {/* Create User */}
        <div className="glass-card" style={{ marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ marginBottom: 'var(--space-md)', fontSize: '1rem' }}>Create New User</h3>
          {error && <div className="login-error" style={{ marginBottom: 'var(--space-md)' }}>{error}</div>}
          <form onSubmit={handleCreate} className="user-form">
            <input
              className="input"
              placeholder="Username or Email"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              required
            />
            <input
              className="input"
              type="password"
              placeholder="Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
            <select className="select" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              <option value="user">User</option>
              <option value="uploader">Uploader</option>
              <option value="approver">Approver</option>
              <option value="admin">Admin</option>
            </select>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Creating...' : 'Create User'}
            </button>
          </form>
        </div>

        {/* Role Legend */}
        <div className="glass-card" style={{ marginBottom: 'var(--space-lg)' }}>
          <h3 style={{ marginBottom: 'var(--space-md)', fontSize: '1rem' }}>Role Permissions</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span className="badge badge-muted" style={{ justifySelf: 'start' }}>user</span>
            <span>Search only</span>
            <span className="badge" style={{ justifySelf: 'start', background: 'rgba(56,189,248,0.15)', color: 'var(--accent)' }}>uploader</span>
            <span>Search + Upload CSV (staged for approval)</span>
            <span className="badge" style={{ justifySelf: 'start', background: 'rgba(234,179,8,0.15)', color: 'var(--warning)' }}>approver</span>
            <span>All of uploader + Approval Queue + Duplicate Review</span>
            <span className="badge badge-accent" style={{ justifySelf: 'start' }}>admin</span>
            <span>Full access: direct ingest, approve, records, users</span>
          </div>
        </div>

        {/* Users Table */}
        <div className="glass-card" style={{ padding: 0, overflow: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Username / Email</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} style={{ textAlign: 'center', padding: '2rem' }}>Loading...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={3} style={{ textAlign: 'center', padding: '2rem' }}>No users found</td></tr>
              ) : users.map(u => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.username || u.email || '—'}</strong>
                    {u.email && u.username && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.email}</div>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${
                      u.role === 'admin' ? 'badge-accent' 
                      : u.role === 'approver' ? 'badge-warning'
                      : u.role === 'uploader' ? 'badge-info'
                      : 'badge-muted'
                    }`}>
                      {u.role || 'user'}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-sm">
                      <button className="btn btn-ghost btn-sm" onClick={() => handleResetPassword(u.id)}>
                        Reset Password
                      </button>
                      <select 
                        className="select select-sm" 
                        value={u.role || 'user'} 
                        onChange={(e) => handleChangeRole(u, e.target.value)}
                        style={{ paddingRight: '24px', fontSize: '0.8rem', background: 'transparent' }}
                      >
                        <option value="user">User</option>
                        <option value="uploader">Uploader</option>
                        <option value="approver">Approver</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

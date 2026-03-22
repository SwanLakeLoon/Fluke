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
    try {
      await pb.collection('users').create({
        username: newUsername,
        password: newPassword,
        passwordConfirm: newPassword,
        role: newRole,
      });
      setNewUsername('');
      setNewPassword('');
      fetchUsers();
    } catch (err) {
      setError(err?.response?.data?.username?.message || err?.message || 'Failed to create user');
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

  const handleToggleRole = async (user) => {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    try {
      await pb.collection('users').update(user.id, { role: newRole });
      fetchUsers();
    } catch (e) {
      console.error('Role toggle failed:', e);
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
              placeholder="Username"
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
              <option value="admin">Admin</option>
            </select>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Creating...' : 'Create User'}
            </button>
          </form>
        </div>

        {/* Users Table */}
        <div className="glass-card" style={{ padding: 0, overflow: 'auto' }}>
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
                    <span className={`badge ${u.role === 'admin' ? 'badge-accent' : 'badge-muted'}`}>
                      {u.role || 'user'}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-sm">
                      <button className="btn btn-ghost btn-sm" onClick={() => handleResetPassword(u.id)}>
                        Reset Password
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleToggleRole(u)}>
                        {u.role === 'admin' ? 'Demote' : 'Promote'}
                      </button>
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

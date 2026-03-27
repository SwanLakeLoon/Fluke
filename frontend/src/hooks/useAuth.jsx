import { createContext, useContext, useState, useEffect } from 'react';
import { pb } from '../api/client';
import { deriveRoles } from './authUtils';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(pb.authStore.record);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if existing auth is valid
    if (pb.authStore.isValid) {
      setUser(pb.authStore.record);
    } else {
      setUser(null);
    }
    setLoading(false);

    // Listen for auth changes
    const unsub = pb.authStore.onChange((token, record) => {
      setUser(record);
    });

    return () => unsub();
  }, []);

  const login = async (username, password) => {
    const authData = await pb.collection('users').authWithPassword(username, password);
    setUser(authData.record);
    return authData.record;
  };

  const logout = () => {
    pb.authStore.clear();
    setUser(null);
  };

  const { isAdmin, isApprover, isUploader } = deriveRoles(user);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin, isApprover, isUploader }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

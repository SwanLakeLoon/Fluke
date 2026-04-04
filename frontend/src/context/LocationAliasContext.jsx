import React, { createContext, useContext, useState, useEffect } from 'react';
import { pb } from '../api/client';
import { useAuth } from '../hooks/useAuth';

const LocationAliasContext = createContext();

export function LocationAliasProvider({ children }) {
  const [aliases, setAliases] = useState(new Map());
  const [loading, setLoading] = useState(true);

  const fetchAliases = async () => {
    try {
      const records = await pb.collection('location_aliases').getFullList({
        sort: 'location',
      });
      const mapping = new Map();
      records.forEach(r => {
        mapping.set(r.location, r.alias);
      });
      setAliases(mapping);
    } catch (e) {
      console.error('Failed to fetch location aliases:', e);
    }
    setLoading(false);
  };

  const { user } = useAuth();

  useEffect(() => {
    if (user) fetchAliases();
    else { setAliases(new Map()); setLoading(false); }
  }, [user]); // re-fetch if the logged-in user changes

  const getAlias = (location) => {
    if (!location) return null;
    return aliases.get(location.trim());
  };

  const redactLocation = (location) => {
    const alias = getAlias(location);
    return alias || location;
  };

  const value = {
    aliases,
    loading,
    getAlias,
    redactLocation,
    refreshAliases: fetchAliases
  };

  return (
    <LocationAliasContext.Provider value={value}>
      {children}
    </LocationAliasContext.Provider>
  );
}

export function useLocationAliases() {
  const context = useContext(LocationAliasContext);
  if (!context) {
    throw new Error('useLocationAliases must be used within a LocationAliasProvider');
  }
  return context;
}

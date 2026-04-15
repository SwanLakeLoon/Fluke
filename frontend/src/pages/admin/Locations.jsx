import React, { useState, useEffect } from 'react';
import { pb } from '../../api/client';
import { useLocationAliases } from '../../context/LocationAliasContext';
import './AdminPages.css';

export default function Locations() {
  const [locations, setLocations] = useState([]);
  const [aliases, setAliases] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name'); // 'name', 'count'
  const [saving, setSaving] = useState(null); // original_name of the one being saved
  const { refreshAliases } = useLocationAliases();

  const [error, setError] = useState(null);

  const fetchLocations = async () => {
    setLoading(true);
    setError(null);

    // Fetch stats — independent of aliases so a failure in one doesn't hide the other
    try {
      const stats = await pb.collection('location_stats').getFullList({
        sort: sortBy === 'name' ? 'location' : '-sighting_count',
      });
      setLocations(stats);
    } catch (e) {
      console.error('Failed to fetch location_stats:', e);
      setError(`Could not load locations: ${e?.message || e}`);
    }

    // Fetch aliases separately — non-fatal if this fails
    try {
      const aliasRecs = await pb.collection('location_aliases').getFullList();
      const aliasMap = {};
      aliasRecs.forEach(r => {
        aliasMap[r.location] = { id: r.id, alias: r.alias };
      });
      setAliases(aliasMap);
    } catch (e) {
      console.error('Failed to fetch location_aliases:', e);
      // Don't block the UI — aliases are optional display decoration
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchLocations();
  }, [sortBy]);

  const handleAliasChange = async (locationName, newAlias) => {
    setSaving(locationName);
    try {
      const existing = aliases[locationName];
      if (!newAlias) {
        // Delete if exists
        if (existing) {
          await pb.collection('location_aliases').delete(existing.id);
          setAliases(prev => {
            const next = { ...prev };
            delete next[locationName];
            return next;
          });
        }
      } else {
        if (existing) {
          await pb.collection('location_aliases').update(existing.id, { alias: newAlias });
          setAliases(prev => ({
            ...prev,
            [locationName]: { ...existing, alias: newAlias }
          }));
        } else {
          const created = await pb.collection('location_aliases').create({
            location: locationName,
            alias: newAlias
          });
          setAliases(prev => ({
            ...prev,
            [locationName]: { id: created.id, alias: newAlias }
          }));
        }
      }
      // Trigger global refresh so Search page sees the change immediately
      await refreshAliases();
    } catch (e) {
      console.error('Failed to update alias:', e);
      alert('Failed to update alias');
    }
    setSaving(null);
  };

  const filteredLocations = locations.filter(l => 
    l.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="page">
      <div className="container">
        <h1 className="admin-title">Location Management</h1>
        
        <div className="records-toolbar">
          <div className="records-toolbar-left">
            <input 
              className="input" 
              placeholder="Search locations..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ maxWidth: '300px' }}
            />
            <select 
              className="select" 
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
            >
              <option value="name">Sort by Name (A-Z)</option>
              <option value="count">Sort by Most Popular</option>
            </select>
          </div>
          <div className="text-muted" style={{ fontSize: '0.85rem' }}>
            {filteredLocations.length} locations found
          </div>
        </div>

        {error && (
          <div className="validation-summary" style={{ marginBottom: 'var(--space-md)' }}>
            <h3>⚠️ {error}</h3>
            <p style={{ fontSize: '0.8rem', marginTop: 4 }}>Check the browser console for details. This may be an access rule issue on the location_stats collection.</p>
          </div>
        )}

        <div className="glass-card" style={{ padding: 0, overflow: 'auto', maxHeight: 'calc(100vh - 250px)' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Original Location Name</th>
                <th>Sighting Count</th>
                <th>Redaction Alias</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="3" style={{ textAlign: 'center', padding: '2rem' }}>Loading locations...</td></tr>
              ) : filteredLocations.length === 0 ? (
                <tr><td colSpan="3" style={{ textAlign: 'center', padding: '2rem' }}>No locations found.</td></tr>
              ) : filteredLocations.map(l => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 500 }}>{l.location}</td>
                  <td>
                    <span className="badge badge-muted">{l.sighting_count} sightings</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <select 
                        className="select select-sm"
                        value={aliases[l.location]?.alias || ''}
                        onChange={e => handleAliasChange(l.location, e.target.value)}
                        disabled={saving === l.location}
                        style={{ minWidth: '220px' }}
                      >
                        <option value="">No Alias (Show real name)</option>
                        <option value="Known ICE HOTEL">Known ICE HOTEL</option>
                        <option value="Known ICE Business Suite">Known ICE Business Suite</option>
                      </select>
                      {saving === l.location && <span style={{ fontSize: '0.8rem' }}>⌛</span>}
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

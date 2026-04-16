import React, { useState, useEffect, useCallback } from 'react';
import { pb } from '../../api/client';
import { useLocationAliases } from '../../context/LocationAliasContext';
import './AdminPages.css';

const ALIAS_VALUES = ['Known ICE HOTEL', 'Known ICE Business Suite'];

export default function Locations() {
  const [tab, setTab] = useState('manage'); // 'manage' | 'aliases'

  // ── Shared state ──────────────────────────────────────────────────────────
  const [managedLocations, setManagedLocations] = useState([]); // from managed_locations
  const [locationMappings, setLocationMappings] = useState([]); // from location_mappings
  const [locationStats, setLocationStats] = useState([]);       // from location_stats
  const [aliases, setAliases] = useState({});                   // location → { id, alias }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { refreshAliases } = useLocationAliases();

  // ── Manage tab state ──────────────────────────────────────────────────────
  const [newLocName, setNewLocName] = useState('');
  const [expandedId, setExpandedId] = useState(null);     // managed_location id
  const [selectedRaw, setSelectedRaw] = useState(new Set());
  const [normalizing, setNormalizing] = useState(false);
  const [normProgress, setNormProgress] = useState(null);
  const [confirmNorm, setConfirmNorm] = useState(null);   // { managedId, managedName, rawValues, totalCount }
  const [renaming, setRenaming] = useState(null);         // { id, name }
  const [confirmDelete, setConfirmDelete] = useState(null); // managed_location id
  const [confirmUnmap, setConfirmUnmap] = useState(null); // { mappingId, rawValue, managedName }

  // ── Alias tab state ───────────────────────────────────────────────────────
  const [savingAlias, setSavingAlias] = useState(null);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Each collection is fetched independently — a missing collection (404)
    // should not prevent the rest of the page from loading.
    let managed = [], mappings = [], stats = [], aliasRecs = [];

    try {
      managed = await pb.collection('managed_locations').getFullList({ sort: 'name' });
    } catch (e) {
      console.warn('managed_locations not available:', e?.message);
    }

    try {
      mappings = await pb.collection('location_mappings').getFullList({ expand: 'managed_location' });
    } catch (e) {
      console.warn('location_mappings not available:', e?.message);
    }

    try {
      stats = await pb.collection('location_stats').getFullList({ sort: '-sighting_count' });
    } catch (e) {
      console.error('Failed to fetch location_stats:', e);
      setError(`Could not load location stats: ${e?.message || e}`);
    }

    try {
      aliasRecs = await pb.collection('location_aliases').getFullList();
    } catch (e) {
      console.warn('location_aliases not available:', e?.message);
    }

    setManagedLocations(managed);
    setLocationMappings(mappings);
    setLocationStats(stats);

    const am = {};
    aliasRecs.forEach(r => { am[r.location] = { id: r.id, alias: r.alias }; });
    setAliases(am);

    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const managedNames = new Set(managedLocations.map(m => m.name));
  const mappedRawValues = new Set(locationMappings.map(m => m.raw_value));

  // Unmapped = in location_stats but not a managed name and not already mapped
  const unmappedStats = locationStats.filter(
    s => !managedNames.has(s.location) && !mappedRawValues.has(s.location)
  );

  // Get sighting count for a managed location (canonical name in DB)
  const getSightingCount = (name) => {
    const stat = locationStats.find(s => s.location === name);
    return stat?.sighting_count || 0;
  };

  // Get mappings for a managed location
  const getMappingsFor = (managedId) =>
    locationMappings.filter(m => m.managed_location === managedId);

  // ── Manage: Create ────────────────────────────────────────────────────────
  const [creating, setCreating] = useState(false);
  const handleCreate = async () => {
    const name = newLocName.trim();
    if (!name) return;
    setCreating(true);
    try {
      console.log('[Locations] Creating managed location:', name);
      const created = await pb.collection('managed_locations').create({ name });
      console.log('[Locations] Created:', created);
      setNewLocName('');
      await fetchAll();
    } catch (e) {
      console.error('[Locations] Create failed:', e);
      alert(`Failed to create location: ${e?.data?.data?.name?.message || e?.message || JSON.stringify(e)}`);
    }
    setCreating(false);
  };

  // ── Manage: Rename ────────────────────────────────────────────────────────
  const handleRename = async () => {
    if (!renaming) return;
    const newName = renaming.name.trim();
    if (!newName) return;

    try {
      const managed = managedLocations.find(m => m.id === renaming.id);
      const oldName = managed.name;

      // 1. Update managed_locations record
      await pb.collection('managed_locations').update(renaming.id, { name: newName });

      // 2. Batch-update sightings with old canonical name
      const sightings = await pb.collection('sightings').getFullList({
        filter: `location = "${oldName.replace(/"/g, '\\"')}"`,
        fields: 'id',
      });
      const CHUNK = 50;
      for (let i = 0; i < sightings.length; i += CHUNK) {
        await Promise.all(
          sightings.slice(i, i + CHUNK).map(s =>
            pb.collection('sightings').update(s.id, { location: newName })
          )
        );
      }

      // 3. Update location_aliases key if one exists
      const aliasRec = aliases[oldName];
      if (aliasRec) {
        await pb.collection('location_aliases').update(aliasRec.id, { location: newName });
      }

      setRenaming(null);
      fetchAll();
      refreshAliases();
    } catch (e) {
      alert(`Rename failed: ${e?.message || e}`);
    }
  };

  // ── Manage: Delete ────────────────────────────────────────────────────────
  const handleDelete = async (managedId) => {
    try {
      // 1. Delete location_mappings pointing to this managed location
      const mappings = getMappingsFor(managedId);
      for (const m of mappings) {
        await pb.collection('location_mappings').delete(m.id);
      }

      // 2. Delete location_aliases for the canonical name
      const managed = managedLocations.find(m => m.id === managedId);
      if (managed && aliases[managed.name]) {
        await pb.collection('location_aliases').delete(aliases[managed.name].id);
      }

      // 3. Delete managed_locations record
      await pb.collection('managed_locations').delete(managedId);

      setConfirmDelete(null);
      fetchAll();
      refreshAliases();
    } catch (e) {
      alert(`Delete failed: ${e?.message || e}`);
    }
  };

  // ── Manage: Normalize (prepare confirmation) ──────────────────────────────
  const prepareNormalize = async (managedId, managedName) => {
    const rawValues = [...selectedRaw];
    let totalCount = 0;
    for (const rv of rawValues) {
      const stat = locationStats.find(s => s.location === rv);
      totalCount += stat?.sighting_count || 0;
    }
    setConfirmNorm({ managedId, managedName, rawValues, totalCount });
  };

  // ── Manage: Normalize (execute) ───────────────────────────────────────────
  const executeNormalize = async () => {
    if (!confirmNorm) return;
    const { managedId, managedName, rawValues, totalCount } = confirmNorm;
    setNormalizing(true);
    setNormProgress({ done: 0, total: totalCount });

    try {
      let done = 0;
      for (const rawValue of rawValues) {
        // 1. Create location_mapping
        await pb.collection('location_mappings').create({
          raw_value: rawValue,
          managed_location: managedId,
        });

        // 2. Fetch all sightings with this raw location
        const sightings = await pb.collection('sightings').getFullList({
          filter: `location = "${rawValue.replace(/"/g, '\\"')}"`,
          fields: 'id',
        });

        // 3. Batch PATCH sightings
        const CHUNK = 50;
        for (let i = 0; i < sightings.length; i += CHUNK) {
          await Promise.all(
            sightings.slice(i, i + CHUNK).map(s =>
              pb.collection('sightings').update(s.id, { location: managedName })
            )
          );
          done += sightings.slice(i, i + CHUNK).length;
          setNormProgress({ done, total: totalCount });
        }

        // 4. Clean up orphaned location_aliases for the raw value
        try {
          const orphanAlias = await pb.collection('location_aliases').getFirstListItem(
            `location = "${rawValue.replace(/"/g, '\\"')}"`
          );
          if (orphanAlias) {
            await pb.collection('location_aliases').delete(orphanAlias.id);
          }
        } catch { /* no alias for this raw value — fine */ }
      }

      setConfirmNorm(null);
      setSelectedRaw(new Set());
      fetchAll();
      refreshAliases();
    } catch (e) {
      alert(`Normalize failed: ${e?.message || e}`);
    }

    setNormalizing(false);
    setNormProgress(null);
  };

  // ── Manage: Unmap (remove a mapping, stop future auto-normalization) ─────
  const handleUnmap = async () => {
    if (!confirmUnmap) return;
    try {
      await pb.collection('location_mappings').delete(confirmUnmap.mappingId);
      setConfirmUnmap(null);
      fetchAll();
    } catch (e) {
      alert(`Failed to remove mapping: ${e?.message || e}`);
    }
  };

  // ── Aliases: Change ───────────────────────────────────────────────────────
  const handleAliasChange = async (locationName, newAlias) => {
    setSavingAlias(locationName);
    try {
      const existing = aliases[locationName];
      if (!newAlias) {
        if (existing) {
          await pb.collection('location_aliases').delete(existing.id);
          setAliases(prev => { const n = { ...prev }; delete n[locationName]; return n; });
        }
      } else if (existing) {
        await pb.collection('location_aliases').update(existing.id, { alias: newAlias });
        setAliases(prev => ({ ...prev, [locationName]: { ...existing, alias: newAlias } }));
      } else {
        const created = await pb.collection('location_aliases').create({ location: locationName, alias: newAlias });
        setAliases(prev => ({ ...prev, [locationName]: { id: created.id, alias: newAlias } }));
      }
      await refreshAliases();
    } catch (e) {
      alert('Failed to update alias: ' + (e?.message || e));
    }
    setSavingAlias(null);
  };

  // ── Toggle raw value selection ────────────────────────────────────────────
  const toggleRaw = (rawValue) => {
    setSelectedRaw(prev => {
      const next = new Set(prev);
      next.has(rawValue) ? next.delete(rawValue) : next.add(rawValue);
      return next;
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className="admin-title" style={{ margin: 0 }}>Location Management</h1>
          <div className="btn-group flex gap-sm bg-base-200 p-1" style={{ borderRadius: 'var(--radius-md)' }}>
            <button className={`btn btn-sm ${tab === 'manage' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('manage')}>Manage Locations</button>
            <button className={`btn btn-sm ${tab === 'aliases' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('aliases')}>Location Aliases</button>
          </div>
        </div>

        {error && (
          <div className="validation-summary" style={{ marginBottom: 'var(--space-md)', marginTop: 'var(--space-md)' }}>
            <h3>⚠️ {error}</h3>
          </div>
        )}

        {/* ══════════════ MANAGE LOCATIONS TAB ══════════════ */}
        {tab === 'manage' && (
          <>
            {/* Explanatory intro */}
            <div style={{
              margin: 'var(--space-md) 0',
              padding: 'var(--space-sm) var(--space-md)',
              background: 'rgba(var(--accent-rgb, 99, 102, 241), 0.06)',
              borderRadius: 'var(--radius-md)',
              borderLeft: '3px solid var(--accent)',
              fontSize: '0.88rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
            }}>
              <strong>How it works:</strong> Create your preferred location names below, then map messy raw values from imported data to them.
              When you normalize, all matching sighting records are rewritten to use your canonical name — and future imports will auto-normalize using your saved mappings.
            </div>

            {/* Add new location */}
            <div className="records-toolbar">
              <div className="records-toolbar-left">
                <input
                  className="input"
                  placeholder="New canonical location name..."
                  value={newLocName}
                  onChange={e => setNewLocName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  style={{ maxWidth: '350px' }}
                />
                <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={!newLocName.trim() || creating}>
                  {creating ? '⏳ Creating...' : '+ Add Location'}
                </button>
              </div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {managedLocations.length} managed · {unmappedStats.length} unmapped
              </span>
            </div>

            {/* Managed locations table */}
            <div className="glass-card" style={{ padding: 0, overflow: 'auto', maxHeight: 'calc(100vh - 320px)', marginTop: 'var(--space-md)' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>
                      <span className="th-label" title="The standardized location name you define. All sightings mapped to this location will display this exact name.">
                        Canonical Name <span className="th-hint">ⓘ</span>
                      </span>
                    </th>
                    <th>
                      <span className="th-label" title="The number of sighting records currently stored with this exact location name in the database.">
                        Sighting Count <span className="th-hint">ⓘ</span>
                      </span>
                    </th>
                    <th>
                      <span className="th-label" title="Raw location strings from imported data that have been mapped to this canonical name. Future imports containing these values will be auto-normalized.">
                        Mapped Raw Values <span className="th-hint">ⓘ</span>
                      </span>
                    </th>
                    <th>
                      <span className="th-label" title="Map: select raw values to absorb. Rename: update the canonical name across all records. Delete: remove this managed location.">
                        Actions <span className="th-hint">ⓘ</span>
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem' }}>Loading...</td></tr>
                  ) : managedLocations.length === 0 ? (
                    <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      No managed locations yet. Add one above to start normalizing your data.
                    </td></tr>
                  ) : managedLocations.map(ml => {
                    const mappings = getMappingsFor(ml.id);
                    const count = getSightingCount(ml.name);
                    const isExpanded = expandedId === ml.id;
                    const isRenaming = renaming?.id === ml.id;

                    return (
                      <React.Fragment key={ml.id}>
                        <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                          <td>
                            {isRenaming ? (
                              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                <input
                                  className="input input-sm"
                                  value={renaming.name}
                                  onChange={e => setRenaming({ ...renaming, name: e.target.value })}
                                  onKeyDown={e => e.key === 'Enter' && handleRename()}
                                  autoFocus
                                  style={{ maxWidth: '250px' }}
                                />
                                <button className="btn btn-primary btn-sm" onClick={handleRename}>Save</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setRenaming(null)}>Cancel</button>
                              </div>
                            ) : (
                              <strong>{ml.name}</strong>
                            )}
                          </td>
                          <td>
                            <span className="badge badge-muted">{count} sightings</span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                              {count > 0 && (
                                <span 
                                  className="badge" 
                                  style={{ background: 'var(--bg-accent)', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: '0.75rem' }} 
                                  title="Sightings natively perfectly match this canonical name."
                                >
                                  {ml.name} (Canonical match)
                                </span>
                              )}
                              {mappings.map(m => (
                                <span key={m.id} className="badge badge-accent" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem' }}>
                                  {m.raw_value}
                                  <button
                                    onClick={() => setConfirmUnmap({ mappingId: m.id, rawValue: m.raw_value, managedName: ml.name })}
                                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: '0.85rem', lineHeight: 1, opacity: 0.7 }}
                                    title="Remove this mapping"
                                  >✕</button>
                                </span>
                              ))}
                              {mappings.length === 0 && count === 0 && (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No mappings yet</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                              <button
                                className={`btn btn-sm ${isExpanded ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => { setExpandedId(isExpanded ? null : ml.id); setSelectedRaw(new Set()); }}
                              >
                                {isExpanded ? '▲ Close' : '▼ Map'}
                              </button>
                              {!isRenaming && (
                                <button className="btn btn-ghost btn-sm" onClick={() => setRenaming({ id: ml.id, name: ml.name })}>✏️</button>
                              )}
                              <button
                                className="btn btn-sm"
                                style={{ color: 'var(--danger)' }}
                                onClick={() => setConfirmDelete(ml.id)}
                              >🗑</button>
                            </div>
                          </td>
                        </tr>

                        {/* ── Expanded mapping panel ── */}
                        {isExpanded && (
                          <tr>
                            <td colSpan="4" style={{ padding: 'var(--space-md)', background: 'rgba(var(--accent-rgb, 99, 102, 241), 0.05)' }}>
                              <div style={{ marginBottom: 'var(--space-sm)' }}>
                                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.2rem' }}>
                                  Map unstandardized values to "{ml.name}"
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                  Select the raw imports below that should be rolled up into this canonical location. 
                                  Normalizing will permanently update the sighting records to use <strong>{ml.name}</strong>.
                                </div>
                              </div>
                              {unmappedStats.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                  All location values are already managed or mapped. 🎉
                                </p>
                              ) : (
                                <>
                                  <div style={{ maxHeight: '250px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-sm)' }}>
                                    <table className="data-table" style={{ margin: 0 }}>
                                      <thead>
                                        <tr>
                                          <th style={{ width: 40 }}>
                                            <input
                                              type="checkbox"
                                              checked={unmappedStats.length > 0 && selectedRaw.size === unmappedStats.length}
                                              onChange={() => {
                                                if (selectedRaw.size === unmappedStats.length) setSelectedRaw(new Set());
                                                else setSelectedRaw(new Set(unmappedStats.map(s => s.location)));
                                              }}
                                            />
                                          </th>
                                          <th>Raw Location Value</th>
                                          <th>Sightings</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {unmappedStats.map(s => (
                                          <tr key={s.id}>
                                            <td>
                                              <input
                                                type="checkbox"
                                                checked={selectedRaw.has(s.location)}
                                                onChange={() => toggleRaw(s.location)}
                                              />
                                            </td>
                                            <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{s.location}</td>
                                            <td><span className="badge badge-muted">{s.sighting_count}</span></td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                  <button
                                    className="btn btn-primary btn-sm"
                                    disabled={selectedRaw.size === 0 || normalizing}
                                    onClick={() => prepareNormalize(ml.id, ml.name)}
                                  >
                                    Normalize {selectedRaw.size} value{selectedRaw.size !== 1 ? 's' : ''} → "{ml.name}"
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* Unmapped values summary */}
                  {!loading && unmappedStats.length > 0 && (
                    <tr>
                      <td colSpan="4" style={{ padding: 'var(--space-md)', borderTop: '2px solid var(--border)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          ⚠️ {unmappedStats.length} raw location value{unmappedStats.length !== 1 ? 's' : ''} not yet mapped to any managed location.
                          Expand a managed location above and use the "Map" panel to absorb them.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ══════════════ LOCATION ALIASES TAB ══════════════ */}
        {tab === 'aliases' && (
          <>
            {/* Explanatory intro */}
            <div style={{
              margin: 'var(--space-md) 0',
              padding: 'var(--space-sm) var(--space-md)',
              background: 'rgba(var(--accent-rgb, 99, 102, 241), 0.06)',
              borderRadius: 'var(--radius-md)',
              borderLeft: '3px solid var(--accent)',
              fontSize: '0.88rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
            }}>
              <strong>How it works:</strong> Assign privacy redaction aliases to your managed locations.
              When non-admin users view records in the registry, the real canonical name will be hidden and replaced by the alias you select here.
            </div>

            <div className="glass-card" style={{ padding: 0, overflow: 'auto', maxHeight: 'calc(100vh - 270px)', marginTop: 'var(--space-md)' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>
                      <span className="th-label" title="Your standardized location name. When aliased, only admins can see this real name.">
                        Canonical Location <span className="th-hint">ⓘ</span>
                      </span>
                    </th>
                    <th>
                      <span className="th-label" title="The number of sighting records currently tied to this canonical location.">
                        Sighting Count <span className="th-hint">ⓘ</span>
                      </span>
                    </th>
                    <th>
                      <span className="th-label" title="The generic privacy label that regular users will see instead of the real location name.">
                        Redaction Alias <span className="th-hint">ⓘ</span>
                      </span>
                    </th>
                  </tr>
                </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="3" style={{ textAlign: 'center', padding: '2rem' }}>Loading...</td></tr>
                ) : managedLocations.length === 0 ? (
                  <tr><td colSpan="3" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No managed locations yet. Create them in the "Manage Locations" tab first.
                  </td></tr>
                ) : managedLocations.map(ml => (
                  <tr key={ml.id}>
                    <td style={{ fontWeight: 500 }}>{ml.name}</td>
                    <td><span className="badge badge-muted">{getSightingCount(ml.name)} sightings</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <select
                          className="select select-sm"
                          value={aliases[ml.name]?.alias || ''}
                          onChange={e => handleAliasChange(ml.name, e.target.value)}
                          disabled={savingAlias === ml.name}
                          style={{ minWidth: '220px' }}
                        >
                          <option value="">No Alias (Show real name)</option>
                          {ALIAS_VALUES.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                        {savingAlias === ml.name && <span style={{ fontSize: '0.8rem' }}>⌛</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}

        {/* ══════════════ MODALS ══════════════ */}

        {/* Normalize confirmation */}
        {confirmNorm && (
          <div className="modal-overlay" onClick={() => !normalizing && setConfirmNorm(null)}>
            <div className="modal-card glass-card animate-fadeIn" onClick={e => e.stopPropagation()}>
              <h3 style={{ marginBottom: 'var(--space-md)' }}>📍 Confirm Normalize</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>
                This will rewrite <strong>{confirmNorm.totalCount}</strong> sighting record{confirmNorm.totalCount !== 1 ? 's' : ''} to use
                the canonical name <strong>"{confirmNorm.managedName}"</strong>.
              </p>
              <div style={{ marginBottom: 'var(--space-md)', fontSize: '0.85rem' }}>
                <strong>Raw values being absorbed:</strong>
                <ul style={{ marginTop: '0.3rem' }}>
                  {confirmNorm.rawValues.map(rv => {
                    const stat = locationStats.find(s => s.location === rv);
                    return <li key={rv}><code>{rv}</code> ({stat?.sighting_count || 0} sightings)</li>;
                  })}
                </ul>
              </div>
              {normProgress && (
                <div style={{ marginBottom: 'var(--space-md)' }}>
                  <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${(normProgress.done / normProgress.total) * 100}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.2s' }} />
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {normProgress.done} / {normProgress.total} records updated
                  </span>
                </div>
              )}
              <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setConfirmNorm(null)} disabled={normalizing}>Cancel</button>
                <button className="btn btn-primary" onClick={executeNormalize} disabled={normalizing}>
                  {normalizing ? '⏳ Normalizing...' : 'Normalize'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete confirmation */}
        {confirmDelete && (
          <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
            <div className="modal-card glass-card animate-fadeIn" onClick={e => e.stopPropagation()}>
              <h3 style={{ marginBottom: 'var(--space-md)' }}>🗑 Delete Managed Location</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }}>
                This will remove the managed location, its mappings, and any associated alias.
                Existing sighting records will keep their current location value but become "unmanaged."
              </p>
              <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
                <button className="btn" style={{ background: 'var(--danger)', color: '#fff' }} onClick={() => handleDelete(confirmDelete)}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Unmap confirmation */}
        {confirmUnmap && (
          <div className="modal-overlay" onClick={() => setConfirmUnmap(null)}>
            <div className="modal-card glass-card animate-fadeIn" onClick={e => e.stopPropagation()}>
              <h3 style={{ marginBottom: 'var(--space-md)' }}>Remove Mapping</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)' }}>
                Remove the mapping for <strong>"{confirmUnmap.rawValue}"</strong>?
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 'var(--space-md)' }}>
                Future records with this location will no longer be auto-normalized to "{confirmUnmap.managedName}."
                Existing sightings already written as "{confirmUnmap.managedName}" will not be reverted.
              </p>
              <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setConfirmUnmap(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleUnmap}>Remove Mapping</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

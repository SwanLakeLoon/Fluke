import { useState, useEffect, useCallback } from 'react';
import { pb } from '../api/client';
import VehicleCard from '../components/VehicleCard';
import './Search.css';

const PER_PAGE = 25;
const DEBOUNCE_MS = 300;

export default function Search() {
  const [filters, setFilters] = useState({
    plate: '', state: '', ice: '', match_status: '', vin: '', location: '', sightings: '',
  });
  const [vehicles, setVehicles] = useState([]);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [heroCount, setHeroCount] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Fetch total searchable count for hero
  useEffect(() => {
    pb.collection('vehicles').getList(1, 1, { filter: 'searchable = true' })
      .then(res => setHeroCount(res.totalItems))
      .catch(() => setHeroCount(0));
  }, []);

  // Build filter string for enhanced_plate_stats view
  const buildFilter = useCallback(() => {
    const esc = (s) => s.replace(/"/g, '\\"');
    const parts = ['searchable = true'];
    if (filters.plate)        parts.push(`plate ~ "${esc(filters.plate)}"`);
    if (filters.state)         parts.push(`state_list ~ "${esc(filters.state)}"`);
    if (filters.ice)           parts.push(`ice_list ~ "${esc(filters.ice)}"`);
    if (filters.match_status)  parts.push(`match_status_list ~ "${esc(filters.match_status)}"`);
    if (filters.vin)           parts.push(`(vin_list ~ "${esc(filters.vin)}" || physical_vin_list ~ "${esc(filters.vin)}")`);
    if (filters.location)      parts.push(`location_list ~ "${esc(filters.location)}"`);
    if (filters.sightings)     parts.push(`sighting_count >= ${parseInt(filters.sightings, 10) || 0}`);
    return parts.join(' && ');
  }, [filters]);

  // Debounced search
  useEffect(() => {
    const anyFilter = Object.values(filters).some(v => v.trim() !== '');
    if (!anyFilter) {
      setHasSearched(false);
      setVehicles([]);
      setTotalItems(0);
      setTotalPages(0);
      return;
    }

    setHasSearched(true);
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        // Query the plate_stats view first to paginate by unique plate
        const res = await pb.collection('enhanced_plate_stats').getList(page, PER_PAGE, {
          filter: buildFilter(),
          sort: '-latest_sighting',
        });
        setTotalItems(res.totalItems);
        setTotalPages(res.totalPages);

        if (res.items.length === 0) {
          setVehicles([]);
        } else {
          const vehicleIds = res.items.map(s => s.id);
          const vehFilterStr = vehicleIds.map(id => `id = "${id}"`).join(' || ');
          const vehRes = await pb.collection('vehicles').getFullList({ filter: vehFilterStr, expand: 'vin_relation,physical_vin_relation' });
          
          const sightFilterStr = vehicleIds.map(id => `vehicle = "${id}"`).join(' || ');
          const sightRes = await pb.collection('sightings').getFullList({ filter: sightFilterStr, sort: '-date' });

          const vmap = new Map();
          for (const v of vehRes) {
            vmap.set(v.id, { ...v, sightings: [] });
          }
          for (const s of sightRes) {
            if (vmap.has(s.vehicle)) vmap.get(s.vehicle).sightings.push(s);
          }

          // Sort grouped records to match the paginated stats view order
          const grouped = res.items.map(s => vmap.get(s.id)).filter(Boolean);
          setVehicles(grouped);
        }
      } catch (err) {
        console.error('Search error:', err);
        setVehicles([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [filters, page, buildFilter]);

  const updateFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const isHeroState = !hasSearched;

  return (
    <div className="page">
      <div className="container">
        {/* Hero State */}
        {isHeroState && (
          <div className="search-hero animate-slideUp">
            <div className="search-hero-icon">🔍</div>
            <h1>Search the Vehicle Registry</h1>
            <p>
              {heroCount !== null
                ? `${heroCount.toLocaleString()} searchable records available`
                : 'Loading...'}
            </p>
          </div>
        )}

        {/* Filter Bar */}
        <div className={`search-filters glass-card ${isHeroState ? 'animate-slideUp' : ''}`}>
          <div className="filter-grid">
            <input
              className="input"
              placeholder="Plate #"
              value={filters.plate}
              onChange={(e) => updateFilter('plate', e.target.value)}
            />
            <input
              className="input"
              placeholder="State (e.g. MN)"
              maxLength={2}
              value={filters.state}
              onChange={(e) => updateFilter('state', e.target.value.toUpperCase())}
            />
            <select
              className="select"
              value={filters.ice}
              onChange={(e) => updateFilter('ice', e.target.value)}
            >
              <option value="">ICE — All</option>
              <option value="Y">Y</option>
              <option value="N">N</option>
              <option value="HS">HS</option>
            </select>
            <select
              className="select"
              value={filters.match_status}
              onChange={(e) => updateFilter('match_status', e.target.value)}
            >
              <option value="">Matches Reg.? — All</option>
              <option value="Y">Y</option>
              <option value="N">N</option>
            </select>
            <input
              className="input"
              placeholder="VIN"
              value={filters.vin}
              onChange={(e) => updateFilter('vin', e.target.value)}
            />
            <input
              className="input"
              placeholder="Location"
              value={filters.location}
              onChange={(e) => updateFilter('location', e.target.value)}
            />
            <select
              className="select"
              value={filters.sightings}
              onChange={(e) => updateFilter('sightings', e.target.value)}
            >
              <option value="">Sightings — All</option>
              <option value="2">2+ Sightings</option>
              <option value="3">3+ Sightings</option>
              <option value="4">4+ Sightings</option>
              <option value="5">5+ Sightings</option>
            </select>
          </div>
        </div>

        {/* Results */}
        {loading && (
          <div className="search-loading">
            <div className="skeleton" style={{ height: 120, marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 120, marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 120 }} />
          </div>
        )}

        {!loading && hasSearched && vehicles.length === 0 && (
          <div className="search-empty animate-fadeIn">
            <div className="search-empty-icon">🔎</div>
            <h2>No results found</h2>
            <p>Try adjusting your filters or search a different plate number.</p>
          </div>
        )}

        {!loading && vehicles.length > 0 && (
          <>
            <div className="search-results-header">
              <span>{totalItems} record{totalItems !== 1 ? 's' : ''} found</span>
              <span className="text-muted">
                Page {page} of {totalPages}
              </span>
            </div>

            <div className="search-results">
              {vehicles.map(v => (
                <VehicleCard key={v.id} vehicle={v} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="pagination-btn"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  ← Prev
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                  const p = start + i;
                  if (p > totalPages) return null;
                  return (
                    <button
                      key={p}
                      className={`pagination-btn ${p === page ? 'active' : ''}`}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  className="pagination-btn"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

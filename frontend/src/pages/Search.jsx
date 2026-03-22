import { useState, useEffect, useCallback } from 'react';
import { pb } from '../api/client';
import { groupBySightings } from '../utils/groupSightings';
import VehicleCard from '../components/VehicleCard';
import './Search.css';

const PER_PAGE = 25;
const DEBOUNCE_MS = 300;

export default function Search() {
  const [filters, setFilters] = useState({
    plate: '', state: '', ice: '', match_status: '', vin: '', location: '',
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
    pb.collection('alpr_records').getList(1, 1, { filter: 'searchable = true' })
      .then(res => setHeroCount(res.totalItems))
      .catch(() => setHeroCount(0));
  }, []);

  // Build filter string
  const buildFilter = useCallback(() => {
    const parts = ['searchable = true'];
    if (filters.plate)        parts.push(`plate ~ "${filters.plate}"`);
    if (filters.state)         parts.push(`state = "${filters.state}"`);
    if (filters.ice)           parts.push(`ice = "${filters.ice}"`);
    if (filters.match_status)  parts.push(`match_status = "${filters.match_status}"`);
    if (filters.vin)           parts.push(`vin ~ "${filters.vin}"`);
    if (filters.location)      parts.push(`location ~ "${filters.location}"`);
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
        const res = await pb.collection('alpr_records').getList(page, PER_PAGE, {
          filter: buildFilter(),
          sort: '-plate',
        });
        setTotalItems(res.totalItems);
        setTotalPages(res.totalPages);
        setVehicles(groupBySightings(res.items));
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
                <VehicleCard key={v.plate} vehicle={v} />
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

import { getColorInfo } from '../utils/colorMap';
import { useState } from 'react';
import './VehicleCard.css';

export default function VehicleCard({ vehicle }) {
  const [expanded, setExpanded] = useState(vehicle.sightings.length <= 3);
  const colorInfo = getColorInfo(vehicle.color);
  const regNotFound = !vehicle.registration || vehicle.registration.toLowerCase().includes('not found');

  // Resolve VIN from expanded relation or fallback to direct fields
  const vinDisplay = vehicle._vin || vehicle.expand?.vin_relation?.vin || vehicle.vin || '';
  const titleIssuesDisplay = vehicle._title_issues || vehicle.expand?.vin_relation?.title_issues || vehicle.title_issues || '';

  return (
    <div className="vehicle-card glass-card animate-fadeIn">
      {/* Identity Block */}
      <div className="vc-identity">
        <div className="vc-plate-row">
          <div className="vc-plate">{vehicle.plate}</div>
          <span className="badge badge-accent">{vehicle.state}</span>
        </div>

        <div className="vc-details">
          <div className="vc-detail">
            <span className="vc-label">Make / Model</span>
            <span className="vc-value">{vehicle.make} {vehicle.model}</span>
          </div>
          <div className="vc-detail">
            <span className="vc-label">Color</span>
            <span className="vc-value">
              <span className="color-swatch" style={{ backgroundColor: colorInfo.hex }} />
              {colorInfo.name}
            </span>
          </div>
          {vinDisplay && (
            <div className="vc-detail">
              <span className="vc-label">VIN</span>
              <span className="vc-value vc-vin">{vinDisplay}</span>
            </div>
          )}
          <div className="vc-detail">
            <span className="vc-label">Registration</span>
            {regNotFound ? (
              <span className="badge badge-muted">Not Found</span>
            ) : (
              <span className="vc-value">{vehicle.registration}</span>
            )}
          </div>
          {titleIssuesDisplay && (
            <div className="vc-detail">
              <span className="vc-label">Title Issues</span>
              <span className="vc-value vc-title-issues">{titleIssuesDisplay}</span>
            </div>
          )}
        </div>
      </div>

      {/* Sightings Accordion */}
      <div className="vc-sightings">
        <button
          className="vc-sightings-toggle"
          onClick={() => setExpanded(!expanded)}
        >
          <span>📍 {vehicle.sightings.length} Sighting{vehicle.sightings.length !== 1 ? 's' : ''}</span>
          <span className={`vc-chevron ${expanded ? 'open' : ''}`}>▼</span>
        </button>

        {expanded && (
          <div className="vc-sightings-list">
            {vehicle.sightings.map((s, i) => (
              <div key={s.id || i} className="vc-sighting">
                <div className="vc-sighting-header">
                  <span className="vc-sighting-location">{s.location || 'Unknown location'}</span>
                  <span className="vc-sighting-date">
                    {s.date ? new Date(s.date).toLocaleDateString('en-US', { timeZone: 'UTC' }) : 'No date'}
                  </span>
                </div>
                <div className="vc-sighting-meta">
                  <span className={`badge ${s.ice === 'Y' || s.ice === 'HS' ? 'badge-warning' : 'badge-muted'}`}>
                    ICE: {s.ice || '—'}
                  </span>
                  <span className={`badge ${s.match_status === 'N' ? 'badge-warning' : 'badge-muted'}`}>
                    Matches Reg.? {s.match_status || '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

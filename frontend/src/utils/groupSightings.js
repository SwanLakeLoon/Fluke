/**
 * Groups flat API rows by plate into vehicle profiles with sightings arrays.
 *
 * Input:  [{ plate, make, model, ..., location, date }, ...]
 * Output: [{ plate, make, model, ..., sightings: [{ location, date, ice, ... }] }, ...]
 */
export function groupBySightings(records) {
  const map = new Map();

  for (const record of records) {
    const key = record.plate;

    if (!map.has(key)) {
      map.set(key, {
        plate: record.plate,
        state: record.state,
        make: record.make,
        model: record.model,
        color: record.color,
        registration: record.registration,
        vin: record.vin,
        title_issues: record.title_issues,
        sightings: [],
      });
    }

    const vehicle = map.get(key);
    vehicle.sightings.push({
      id: record.id,
      location: record.location,
      date: record.date,
      ice: record.ice,
      match_status: record.match_status,
      plate_confidence: record.plate_confidence,
      notes: record.notes,
      searchable: record.searchable,
    });
  }

  // Sort sightings by date descending within each vehicle
  for (const vehicle of map.values()) {
    vehicle.sightings.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(b.date) - new Date(a.date);
    });
  }

  return Array.from(map.values());
}

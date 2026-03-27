export const COLUMN_MAP = {
  'Plate': 'plate',
  'State': 'state',
  'Make': 'make',
  'Model': 'model',
  'Color': 'color',
  'ICE': 'ice',
  'Match': 'match_status',
  'Registration': 'registration',
  'VIN Associated to Plate (if available)': 'vin',
  'Title Issues Associated to VIN (if available)': 'title_issues',
  'Notes': 'notes',
  'Location': 'location',
  'Date': 'date',
  'Plate Confidence': 'plate_confidence',
};

export const VALID_COLORS = new Set(['BR', 'GR', 'BK', 'BL', 'TN', 'SL', 'R', 'WH', 'GN', 'GD', 'PU', 'OR']);
export const VALID_ICE = new Set(['Y', 'N', 'HS']);
export const VALID_MATCH = new Set(['Y', 'N', '']);

export function mapRow(csvRow) {
  const mapped = {};
  for (const [csvCol, dbField] of Object.entries(COLUMN_MAP)) {
    mapped[dbField] = (csvRow[csvCol] || '').trim();
  }
  // searchable: if column exists in CSV, use it; otherwise derive
  const searchableRaw = (csvRow['searchable'] || csvRow['Searchable'] || '').trim().toUpperCase();
  if (searchableRaw) {
    mapped.searchable = ['Y', 'TRUE', '1', 'YES'].includes(searchableRaw);
  } else {
    mapped.searchable = ['Y', 'HS'].includes(mapped.ice);
  }
  // plate_confidence
  mapped.plate_confidence = parseFloat(mapped.plate_confidence) || 0;
  // Fallback for plural "Dates" column
  if (!mapped.date) {
    mapped.date = (csvRow['Dates'] || '').trim();
  }
  // blank date → null
  if (!mapped.date) mapped.date = null;
  return mapped;
}

export function validateRow(row) {
  const errors = [];
  if (!row.plate) errors.push('plate required');
  else if (row.plate.length > 20) errors.push('plate too long');
  
  if (row.state && row.state.length > 2) errors.push('state must be at most 2 chars');
  if (row.color && !VALID_COLORS.has(row.color)) errors.push(`invalid color: ${row.color}`);
  if (row.ice && !VALID_ICE.has(row.ice)) errors.push(`invalid ICE: ${row.ice}`);
  if (row.match_status && !VALID_MATCH.has(row.match_status)) errors.push(`invalid match: ${row.match_status}`);
  
  return errors;
}

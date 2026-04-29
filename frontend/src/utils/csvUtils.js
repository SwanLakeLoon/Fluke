import makeAliases from './makeAliases.json';

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
  'VIN Source': 'vin_source',
};

export const VALID_COLORS = new Set(['BR', 'GR', 'BK', 'BL', 'TN', 'SL', 'R', 'WH', 'GN', 'GD', 'PU', 'OR']);
export const VALID_ICE = new Set(['Y', 'N', 'HS']);
export const VALID_MATCH = new Set(['Y', 'N', '']);

export const COLOR_ALIASES = {
  'silver': 'SL',
  'white': 'WH',
  'black': 'BK',
  'red': 'R',
  'blue': 'BL',
  'brown': 'BR',
  'gray': 'GR',
  'grey': 'GR',
  'tan': 'TN',
  'green': 'GN',
  'gold': 'GD',
  'purple': 'PU',
  'orange': 'OR'
};

export function normalizeMake(makeStr) {
  if (!makeStr) return '';
  const upperMake = makeStr.trim().toUpperCase();
  for (const [canonical, aliases] of Object.entries(makeAliases)) {
    if (upperMake === canonical.toUpperCase() || aliases.includes(upperMake)) {
      return canonical;
    }
  }
  return makeStr.trim();
}

export function parseDateString(dateStr) {
  if (!dateStr) return null;
  // Convert to string and strip invisible characters (like zero-width space)
  dateStr = dateStr.toString().replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  
  // Try YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  let m = dateStr.match(/^(\d{4})[/\-. ](\d{1,2})[/\-. ](\d{1,2})(?:[T\s].*)?$/);
  if (m) {
    const year = m[1];
    const month = m[2].padStart(2, '0');
    const day = m[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Try MM/DD/YYYY or MM-DD-YYYY or MM.DD.YYYY
  m = dateStr.match(/^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{2,4})(?:[T\s].*)?$/);
  if (m) {
    let year = m[3];
    if (year.length === 2) {
      const currentYear = new Date().getFullYear();
      const century = Math.floor(currentYear / 100) * 100;
      year = parseInt(year);
      year = String((year < 50 ? century : century - 100) + year);
    }
    const month = m[1].padStart(2, '0');
    const day = m[2].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Fallback to JS Date
  const parsedDate = new Date(dateStr);
  if (!isNaN(parsedDate.getTime())) {
    let year, month, day;
    // JS parses "YYYY-MM-DD" natively as UTC midnight.
    // So for purely ISO-like dates lacking a time, we must extract using UTC methods 
    // to prevent the "one day behind" bug in negative timezones.
    const isIsoLike = /^\d{4}-\d{2}-\d{2}/.test(dateStr);
    
    if (isIsoLike || dateStr.toUpperCase().endsWith('Z')) {
       year = parsedDate.getUTCFullYear();
       month = String(parsedDate.getUTCMonth() + 1).padStart(2, '0');
       day = String(parsedDate.getUTCDate()).padStart(2, '0');
    } else {
       // Values like "Oct 15, 2025" are parsed as Local midnight
       year = parsedDate.getFullYear();
       month = String(parsedDate.getMonth() + 1).padStart(2, '0');
       day = String(parsedDate.getDate()).padStart(2, '0');
    }
    return `${year}-${month}-${day}`;
  }

  return null;
}

export function mapRow(csvRow) {
  const mapped = {};
  
  // Map CSV columns case-insensitively to tolerate header variations
  const lowerRow = {};
  for (const [k, v] of Object.entries(csvRow)) {
    const cleanKey = (k || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase();
    lowerRow[cleanKey] = v;
  }
  
  for (const [csvCol, dbField] of Object.entries(COLUMN_MAP)) {
    mapped[dbField] = (lowerRow[csvCol.toLowerCase()] || '').toString().trim();
  }
  
  // Normalize missing plates
  const noPlatesVariants = ['no plates', 'no', 'missing', 'none', 'nothing'];
  if (noPlatesVariants.includes(mapped.plate.toLowerCase())) {
    mapped.plate = 'NO PLATES';
  }

  // Normalize Make
  mapped.make = normalizeMake(mapped.make);

  // Normalize enum fields to uppercase early so downstream logic is consistent
  if (mapped.color) {
    const rawColor = mapped.color.toLowerCase();
    mapped.color = COLOR_ALIASES[rawColor] || mapped.color.toUpperCase();
  }
  if (mapped.ice) mapped.ice = mapped.ice.toUpperCase();
  if (mapped.match_status) mapped.match_status = mapped.match_status.toUpperCase();
  
  // searchable: if column exists in CSV, use it; otherwise derive
  const searchableRaw = (lowerRow['searchable'] || '').toString().trim().toUpperCase();
  if (searchableRaw) {
    mapped.searchable = ['Y', 'TRUE', '1', 'YES'].includes(searchableRaw);
  } else {
    mapped.searchable = ['Y', 'HS'].includes(mapped.ice);
  }
  
  // plate_confidence
  mapped.plate_confidence = parseFloat(mapped.plate_confidence) || 0;
  
  // Fallback for plural "Dates" column
  if (!mapped.date) {
    mapped.date = (lowerRow['dates'] || '').toString().trim();
  }
  
  // Date Normalization
  mapped.date = parseDateString(mapped.date);

  // VIN Source: normalize — only 'Vehicle VIN' is special, everything else defaults to 'Plate VIN'
  const rawVinSource = (mapped.vin_source || '').trim();
  mapped.vin_source = rawVinSource === 'Vehicle VIN' ? 'Vehicle VIN' : 'Plate VIN';

  // Normalize VIN: trim whitespace and uppercase
  if (mapped.vin) mapped.vin = mapped.vin.trim().toUpperCase();

  return mapped;
}

// Valid VIN: alphanumeric characters only, 1–50 chars
const VIN_RE = /^[A-Z0-9]+$/;

export function validateRow(row) {
  const errors = {};
  if (!row.plate) errors.plate = 'required';
  else if (row.plate.length > 20) errors.plate = 'too long (max 20)';

  if (row.state && row.state.length > 2) errors.state = 'at most 2 chars';
  if (row.color && !VALID_COLORS.has(row.color.toUpperCase())) errors.color = `invalid: ${row.color}`;
  if (row.ice && !VALID_ICE.has(row.ice.toUpperCase())) errors.ice = `invalid: ${row.ice}`;
  if (row.match_status && !VALID_MATCH.has(row.match_status.toUpperCase())) errors.match_status = `invalid: ${row.match_status}`;

  if (row.vin) {
    const v = row.vin.trim().toUpperCase();
    if (v.length > 50) errors.vin = 'too long (max 50 characters)';
    else if (!VIN_RE.test(v)) errors.vin = 'only letters and numbers allowed';
  }

  return errors;
}

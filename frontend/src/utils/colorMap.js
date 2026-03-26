/**
 * Color abbreviation → full name + hex swatch mapping.
 */
export const COLOR_MAP = {
  BR: { name: 'Brown',  hex: '#8B4513' },
  GR: { name: 'Gray',   hex: '#808080' },
  BK: { name: 'Black',  hex: '#1a1a1a' },
  BL: { name: 'Blue',   hex: '#3B82F6' },
  TN: { name: 'Tan',    hex: '#D2B48C' },
  SL: { name: 'Silver', hex: '#C0C0C0' },
  R:  { name: 'Red',    hex: '#EF4444' },
  WH: { name: 'White',  hex: '#F8FAFC' },
  GN: { name: 'Green',  hex: '#22C55E' },
  GD: { name: 'Gold',   hex: '#EAB308' },
  PU: { name: 'Purple', hex: '#A855F7' },
  OR: { name: 'Orange', hex: '#F97316' },
};

export function getColorInfo(abbr) {
  return COLOR_MAP[abbr] || { name: abbr || 'Unknown', hex: '#666' };
}

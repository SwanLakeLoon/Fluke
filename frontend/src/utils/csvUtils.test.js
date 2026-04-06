import { describe, it, expect } from 'vitest';
import { mapRow, validateRow } from './csvUtils';

describe('csvUtils', () => {
  describe('mapRow', () => {
    it('maps canonical column names accurately', () => {
      const row = {
        'Plate': 'ABC 123',
        'State': ' CA ',
        'Make': 'Ford',
        'Color': 'WH',
        'ICE': 'N',
      };
      const result = mapRow(row);
      
      expect(result.plate).toBe('ABC 123');
      expect(result.state).toBe('CA');
      expect(result.make).toBe('Ford');
      expect(result.color).toBe('WH');
      expect(result.ice).toBe('N');
    });

    it('derives searchable from explicit column if present', () => {
      expect(mapRow({ 'Searchable': 'Y' }).searchable).toBe(true);
      expect(mapRow({ 'searchable': 'TRUE' }).searchable).toBe(true);
      expect(mapRow({ 'Searchable': '1' }).searchable).toBe(true);
      expect(mapRow({ 'searchable': 'YES' }).searchable).toBe(true);
      expect(mapRow({ 'Searchable': 'N' }).searchable).toBe(false);
      expect(mapRow({ 'Searchable': 'FOO' }).searchable).toBe(false);
    });

    it('derives searchable from ICE column if searchable column is missing', () => {
      expect(mapRow({ 'ICE': 'Y' }).searchable).toBe(true);
      expect(mapRow({ 'ICE': 'HS' }).searchable).toBe(true);
      expect(mapRow({ 'ICE': 'N' }).searchable).toBe(false);
      expect(mapRow({ 'ICE': '' }).searchable).toBe(false);
    });

    it('handles Dates plural column fallback', () => {
      expect(mapRow({ 'Dates': '2024-01-01' }).date).toBe('2024-01-01');
      expect(mapRow({ 'Date': '2024-02-02', 'Dates': '2024-01-01' }).date).toBe('2024-02-02');
    });

    it('normalizes various date formats to ISO', () => {
      // MM/DD/YYYY — parsed as local time, verify the date prefix
      expect(mapRow({ 'Date': '03/13/2026' }).date).toContain('2026-03-13');
      // M/D/YYYY
      expect(mapRow({ 'Date': '3/13/2026' }).date).toContain('2026-03-13');
      // Already ISO
      expect(mapRow({ 'Date': '2026-03-13' }).date).toContain('2026-03-13');
      // Date with time
      expect(mapRow({ 'Date': '2026-03-13 14:30:00' }).date).not.toBeNull();
      // All normalized dates should be purely YYYY-MM-DD
      expect(mapRow({ 'Date': '03/13/2026' }).date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Gibberish → null
      expect(mapRow({ 'Date': 'not-a-date-xyz' }).date).toBeNull();
    });

    it('forces blank dates to null', () => {
      expect(mapRow({ 'Date': '   ' }).date).toBeNull();
      expect(mapRow({}).date).toBeNull();
    });

    it('parses plate_confidence', () => {
      expect(mapRow({ 'Plate Confidence': '0.99' }).plate_confidence).toBe(0.99);
      expect(mapRow({ 'Plate Confidence': 'invalid' }).plate_confidence).toBe(0);
      expect(mapRow({}).plate_confidence).toBe(0);
    });
  });

  describe('validateRow', () => {
    it('validates a pristine mapped row', () => {
      const valid = { plate: 'ABC', state: 'CA', color: 'WH', ice: 'N', match_status: 'Y' };
      expect(Object.keys(validateRow(valid))).toHaveLength(0);
    });

    it('enforces plate constraints', () => {
      expect(validateRow({})).toHaveProperty('plate', 'required');
      expect(validateRow({ plate: '' })).toHaveProperty('plate', 'required');
      expect(validateRow({ plate: '123456789012345678901' })).toHaveProperty('plate', 'too long (max 20)');
      expect(Object.keys(validateRow({ plate: '12345678901234567890' }))).toHaveLength(0); // 20 chars allowed
    });

    it('enforces state constraints', () => {
      expect(validateRow({ plate: 'A', state: 'CAL' })).toHaveProperty('state', 'at most 2 chars');
      expect(Object.keys(validateRow({ plate: 'A', state: '' }))).toHaveLength(0); // optional
      expect(Object.keys(validateRow({ plate: 'A', state: 'CA' }))).toHaveLength(0); // exact 2
    });

    it('enforces valid enums', () => {
      const result = validateRow({ plate: 'A', color: 'XX', ice: 'MAYBE', match_status: 'IDK' });
      expect(Object.keys(result)).toHaveLength(3);
      expect(result).toHaveProperty('color', 'invalid: XX');
      expect(result).toHaveProperty('ice', 'invalid: MAYBE');
      expect(result).toHaveProperty('match_status', 'invalid: IDK');
    });

    it('validates OR as a valid color', () => {
      expect(Object.keys(validateRow({ plate: 'A', color: 'OR' }))).toHaveLength(0);
    });

    it('does NOT mutate the input row object', () => {
      const row = { plate: 'A', color: 'wh', ice: 'n', match_status: 'y' };
      validateRow(row);
      // These must remain lowercase — validateRow must be a pure function
      expect(row.color).toBe('wh');
      expect(row.ice).toBe('n');
      expect(row.match_status).toBe('y');
    });

    it('validates case-insensitively (lowercase enum values pass)', () => {
      // validateRow checks .toUpperCase() internally, so lowercase valid values should pass
      const result = validateRow({ plate: 'A', color: 'wh', ice: 'n', match_status: 'y' });
      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  describe('mapRow (edge cases)', () => {
    it('trims whitespace on all fields', () => {
      const row = { 'Plate': '  XYZ 789  ', 'State': ' MN ', 'Make': ' Toyota ' };
      const result = mapRow(row);
      expect(result.plate).toBe('XYZ 789');
      expect(result.state).toBe('MN');
      expect(result.make).toBe('Toyota');
    });

    it('normalizes missing plate variations to NO PLATES', () => {
      expect(mapRow({ 'Plate': 'No Plates' }).plate).toBe('NO PLATES');
      expect(mapRow({ 'Plate': 'no' }).plate).toBe('NO PLATES');
      expect(mapRow({ 'Plate': 'Missing' }).plate).toBe('NO PLATES');
      expect(mapRow({ 'Plate': 'NONE' }).plate).toBe('NO PLATES');
      expect(mapRow({ 'Plate': 'nothing' }).plate).toBe('NO PLATES');
      expect(mapRow({ 'Plate': '  no plates  ' }).plate).toBe('NO PLATES');
    });

    it('handles completely empty CSV row', () => {
      const result = mapRow({});
      expect(result.plate).toBe('');
      expect(result.date).toBeNull();
      expect(result.plate_confidence).toBe(0);
      expect(result.searchable).toBe(false);
    });

    it('uppercases enum fields (color, ice, match_status) during mapping', () => {
      const row = { 'Plate': 'ABC', 'Color': 'wh', 'ICE': 'y', 'Match': 'n' };
      const result = mapRow(row);
      expect(result.color).toBe('WH');
      expect(result.ice).toBe('Y');
      expect(result.match_status).toBe('N');
    });

    it('maps full color names to accepted abbreviations', () => {
      expect(mapRow({ 'Color': 'silver' }).color).toBe('SL');
      expect(mapRow({ 'Color': 'White' }).color).toBe('WH');
      expect(mapRow({ 'Color': 'BLACK' }).color).toBe('BK');
      expect(mapRow({ 'Color': ' rEd ' }).color).toBe('R');
      expect(mapRow({ 'Color': 'Grey' }).color).toBe('GR');
      // Fallback for unknown
      expect(mapRow({ 'Color': 'Magenta' }).color).toBe('MAGENTA');
    });

    it('maps VIN and title_issues columns', () => {
      const row = {
        'VIN Associated to Plate (if available)': '1HGCM82633A004352',
        'Title Issues Associated to VIN (if available)': 'Salvage title',
      };
      const result = mapRow(row);
      expect(result.vin).toBe('1HGCM82633A004352');
      expect(result.title_issues).toBe('Salvage title');
    });

    it('defaults vin_source to Plate VIN if missing, blank, or invalid', () => {
      // Missing column entirely
      expect(mapRow({}).vin_source).toBe('Plate VIN');
      
      // Blank or whitespace
      expect(mapRow({ 'VIN Source': '' }).vin_source).toBe('Plate VIN');
      expect(mapRow({ 'VIN Source': '   ' }).vin_source).toBe('Plate VIN');
      
      // Invalid or unrecognized string
      expect(mapRow({ 'VIN Source': 'N/A' }).vin_source).toBe('Plate VIN');
      expect(mapRow({ 'VIN Source': 'Unknown' }).vin_source).toBe('Plate VIN');
    });

    it('maps Vehicle VIN correctly when specified', () => {
      expect(mapRow({ 'VIN Source': 'Vehicle VIN' }).vin_source).toBe('Vehicle VIN');
      // Case-insensitive header match, but the value must be exact
      expect(mapRow({ 'vin source': 'Vehicle VIN' }).vin_source).toBe('Vehicle VIN');
    });

    it('normalizes VIN to uppercase and trims whitespace', () => {
      const result = mapRow({ 'VIN Associated to Plate (if available)': '  1hgcm82633a004352  ' });
      expect(result.vin).toBe('1HGCM82633A004352');
    });

    it('preserves empty VIN as empty string', () => {
      expect(mapRow({}).vin).toBe('');
    });
  });
});

describe('validateRow — VIN validation', () => {
  it('accepts a valid 17-character alphanumeric VIN', () => {
    const errors = validateRow({ plate: 'ABC123', vin: '1HGCM82633A004352' });
    expect(errors.vin).toBeUndefined();
  });

  it('accepts a VIN up to 50 characters', () => {
    const longVin = 'A'.repeat(50);
    const errors = validateRow({ plate: 'ABC123', vin: longVin });
    expect(errors.vin).toBeUndefined();
  });

  it('rejects a VIN exceeding 50 characters', () => {
    const tooLong = 'A'.repeat(51);
    const errors = validateRow({ plate: 'ABC123', vin: tooLong });
    expect(errors.vin).toMatch(/too long/);
  });

  it('rejects a VIN with special characters', () => {
    const errors = validateRow({ plate: 'ABC123', vin: '1HGC-M826!33A004' });
    expect(errors.vin).toMatch(/only letters and numbers/);
  });

  it('allows a missing (empty) VIN with no error', () => {
    const errors = validateRow({ plate: 'ABC123', vin: '' });
    expect(errors.vin).toBeUndefined();
  });
});

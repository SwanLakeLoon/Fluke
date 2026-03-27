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
      expect(validateRow(valid)).toHaveLength(0);
    });

    it('enforces plate constraints', () => {
      expect(validateRow({})).toContain('plate required');
      expect(validateRow({ plate: '' })).toContain('plate required');
      expect(validateRow({ plate: '123456789012345678901' })).toContain('plate too long');
      expect(validateRow({ plate: '12345678901234567890' })).toHaveLength(0); // 20 chars allowed
    });

    it('enforces state constraints', () => {
      expect(validateRow({ plate: 'A', state: 'CAL' })).toContain('state must be at most 2 chars');
      expect(validateRow({ plate: 'A', state: '' })).toHaveLength(0); // optional
      expect(validateRow({ plate: 'A', state: 'CA' })).toHaveLength(0); // exact 2
    });

    it('enforces valid enums', () => {
      const result = validateRow({ plate: 'A', color: 'XX', ice: 'MAYBE', match_status: 'IDK' });
      expect(result).toHaveLength(3);
      expect(result.some(e => e.includes('invalid color'))).toBe(true);
      expect(result.some(e => e.includes('invalid ICE'))).toBe(true);
      expect(result.some(e => e.includes('invalid match'))).toBe(true);
    });
  });
});

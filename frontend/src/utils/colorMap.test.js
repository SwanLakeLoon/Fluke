import { describe, it, expect } from 'vitest';
import { getColorInfo, COLOR_MAP } from './colorMap';

describe('colorMap', () => {
  it('returns correctly mapped color for known code', () => {
    const result = getColorInfo('BK');
    expect(result.name).toBe('Black');
    expect(result.hex).toBe('#1a1a1a');
  });

  it('returns fallback for unknown code', () => {
    const result = getColorInfo('XYZ');
    expect(result.name).toBe('XYZ');
    expect(result.hex).toBe('#666');
  });

  it('returns Unknown for null/undefined input', () => {
    const res1 = getColorInfo(null);
    expect(res1.name).toBe('Unknown');
    expect(res1.hex).toBe('#666');

    const res2 = getColorInfo(undefined);
    expect(res2.name).toBe('Unknown');
    expect(res2.hex).toBe('#666');
  });

  it('contains all 12 expected color constants', () => {
    const expectedKeys = ['BR', 'GR', 'BK', 'BL', 'TN', 'SL', 'R', 'WH', 'GN', 'GD', 'PU', 'OR'];
    expect(Object.keys(COLOR_MAP)).toEqual(expect.arrayContaining(expectedKeys));
    expect(Object.keys(COLOR_MAP)).toHaveLength(12);
  });
});

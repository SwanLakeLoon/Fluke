import { describe, it, expect } from 'vitest';
import { groupBySightings } from './groupSightings';

describe('groupBySightings', () => {
  it('returns empty array for empty input', () => {
    expect(groupBySightings([])).toEqual([]);
  });

  it('groups multiple rows with the same plate into one vehicle', () => {
    const input = [
      { id: '1', plate: 'ABC', location: 'Loc 1', date: '2024-01-01', make: 'Ford' },
      { id: '2', plate: 'ABC', location: 'Loc 2', date: '2024-01-02', make: 'Ford' },
    ];
    
    const result = groupBySightings(input);
    
    expect(result).toHaveLength(1);
    expect(result[0].plate).toBe('ABC');
    expect(result[0].make).toBe('Ford');
    expect(result[0].sightings).toHaveLength(2);
  });

  it('creates separate vehicles for unique plates', () => {
    const input = [
      { id: '1', plate: 'P1', location: 'L1' },
      { id: '2', plate: 'P2', location: 'L1' },
    ];
    
    const result = groupBySightings(input);
    
    expect(result).toHaveLength(2);
    expect(result[0].plate).toBe('P1');
    expect(result[1].plate).toBe('P2');
  });

  it('sorts sightings newest-first within a vehicle', () => {
    const input = [
      { id: '1', plate: 'P1', date: '2024-01-01' },
      { id: '2', plate: 'P1', date: '2024-01-03' },
      { id: '3', plate: 'P1', date: '2024-01-02' },
    ];
    
    const result = groupBySightings(input);
    const sightings = result[0].sightings;
    
    expect(sightings[0].date).toBe('2024-01-03');
    expect(sightings[1].date).toBe('2024-01-02');
    expect(sightings[2].date).toBe('2024-01-01');
  });

  it('sorts sightings with null date to the bottom', () => {
    const input = [
      { id: '1', plate: 'P1', date: null },
      { id: '2', plate: 'P1', date: '2024-01-01' },
    ];
    
    const result = groupBySightings(input);
    const sightings = result[0].sightings;
    
    expect(sightings[0].date).toBe('2024-01-01');
    expect(sightings[1].date).toBe(null);
  });
});

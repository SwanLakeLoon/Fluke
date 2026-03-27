// @vitest-environment jsdom
/**
 * Tests for the ICE Refresh pipeline logic.
 *
 * We don't test ice_refresh.py directly (it's Python) — these tests cover
 * the JS-side concerns: the useIceAlerts hook behavior and the ice_change_log
 * collection interaction.
 *
 * For the Python script, key behaviors to verify manually with --dry-run:
 *   - Changed plate prints "plate: OLD → NEW"
 *   - Unchanged plate prints nothing
 *   - Failed defrost lookup does not print a change (skip)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock PocketBase client ────────────────────────────────────────────────────
const mockGetList = vi.fn();
const mockUpdate  = vi.fn();

vi.mock('../api/client', () => ({
  pb: {
    collection: () => ({
      getList: mockGetList,
      update:  mockUpdate,
    }),
  },
}));

// ── Mock useAuth ──────────────────────────────────────────────────────────────
let mockAuthState = { user: { id: 'u1' }, isAdmin: true, isApprover: false };

vi.mock('./useAuth', () => ({
  useAuth: () => mockAuthState,
}));

// ── Import after mocks ────────────────────────────────────────────────────────
import { renderHook, act } from '@testing-library/react';
import { useIceAlerts } from './useIceAlerts';

// ── Helpers ───────────────────────────────────────────────────────────────────
const makeAlert = (overrides = {}) => ({
  id: 'log1',
  plate: 'ABC123',
  old_ice: 'N',
  new_ice: 'Y',
  sightings_updated: 3,
  run_date: '2026-03-26 10:00:00',
  acknowledged: false,
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('useIceAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState = { user: { id: 'u1' }, isAdmin: true, isApprover: false };
  });

  it('returns empty alerts when no unacknowledged changes exist', async () => {
    mockGetList.mockResolvedValueOnce({ items: [] });
    const { result } = renderHook(() => useIceAlerts());
    await act(async () => {});
    expect(result.current.alerts).toEqual([]);
  });

  it('returns alerts when unacknowledged changes exist', async () => {
    const alert = makeAlert();
    mockGetList.mockResolvedValueOnce({ items: [alert] });
    const { result } = renderHook(() => useIceAlerts());
    await act(async () => {});
    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0].plate).toBe('ABC123');
    expect(result.current.alerts[0].new_ice).toBe('Y');
  });

  it('returns multiple alerts sorted newest first', async () => {
    const alerts = [
      makeAlert({ id: 'log1', plate: 'AAA111', run_date: '2026-03-26 10:00:00' }),
      makeAlert({ id: 'log2', plate: 'BBB222', run_date: '2026-03-25 10:00:00' }),
    ];
    mockGetList.mockResolvedValueOnce({ items: alerts });
    const { result } = renderHook(() => useIceAlerts());
    await act(async () => {});
    expect(result.current.alerts[0].plate).toBe('AAA111');
  });

  it('does not fetch when user is not logged in', async () => {
    mockAuthState = { user: null, isAdmin: false, isApprover: false };
    renderHook(() => useIceAlerts());
    await act(async () => {});
    expect(mockGetList).not.toHaveBeenCalled();
  });

  it('does not fetch when user is a plain uploader', async () => {
    mockAuthState = { user: { id: 'u2' }, isAdmin: false, isApprover: false };
    renderHook(() => useIceAlerts());
    await act(async () => {});
    expect(mockGetList).not.toHaveBeenCalled();
  });

  it('fetches for approver role', async () => {
    mockAuthState = { user: { id: 'u3' }, isAdmin: false, isApprover: true };
    mockGetList.mockResolvedValueOnce({ items: [] });
    renderHook(() => useIceAlerts());
    await act(async () => {});
    expect(mockGetList).toHaveBeenCalledOnce();
  });

  it('dismiss patches all alerts as acknowledged and clears state', async () => {
    const alerts = [makeAlert({ id: 'log1' }), makeAlert({ id: 'log2', plate: 'XYZ789' })];
    mockGetList.mockResolvedValueOnce({ items: alerts });
    mockUpdate.mockResolvedValue({});

    const { result } = renderHook(() => useIceAlerts());
    await act(async () => {});
    expect(result.current.alerts).toHaveLength(2);

    await act(async () => {
      await result.current.dismiss();
    });

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenCalledWith('log1', { acknowledged: true });
    expect(mockUpdate).toHaveBeenCalledWith('log2', { acknowledged: true });
    expect(result.current.alerts).toHaveLength(0);
  });

  it('handles ice_change_log API error silently (collection may not exist)', async () => {
    mockGetList.mockRejectedValueOnce(new Error('404: collection not found'));
    const { result } = renderHook(() => useIceAlerts());
    await act(async () => {});
    // Should not throw — just returns empty alerts
    expect(result.current.alerts).toEqual([]);
  });

  it('reflects downgrade (Y → N) in alert data', async () => {
    const alert = makeAlert({ old_ice: 'Y', new_ice: 'N' });
    mockGetList.mockResolvedValueOnce({ items: [alert] });
    const { result } = renderHook(() => useIceAlerts());
    await act(async () => {});
    expect(result.current.alerts[0].old_ice).toBe('Y');
    expect(result.current.alerts[0].new_ice).toBe('N');
  });

  it('reflects HS upgrade in alert data', async () => {
    const alert = makeAlert({ old_ice: 'N', new_ice: 'HS' });
    mockGetList.mockResolvedValueOnce({ items: [alert] });
    const { result } = renderHook(() => useIceAlerts());
    await act(async () => {});
    expect(result.current.alerts[0].new_ice).toBe('HS');
  });
});

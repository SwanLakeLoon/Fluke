import { useState, useEffect } from 'react';
import { pb } from '../api/client';
import { useAuth } from './useAuth';

/**
 * useIceAlerts — checks for unacknowledged ICE status changes on mount.
 *
 * Returns:
 *   alerts   — array of ice_change_log records (pending acknowledgement)
 *   dismiss  — async fn to mark all alerts acknowledged
 */
export function useIceAlerts() {
  const { user, isAdmin, isApprover } = useAuth();
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    // Only check for admin/approver users who are logged in
    if (!user || (!isAdmin && !isApprover)) return;

    const fetchAlerts = async () => {
      try {
        const res = await pb.collection('ice_change_log').getList(1, 100, {
          filter: 'acknowledged = false',
          sort:   '-run_date',
        });
        setAlerts(res.items);
      } catch (e) {
        // ice_change_log might not exist on older instances — fail silently
        console.warn('[useIceAlerts] Could not fetch ICE alerts:', e.message);
      }
    };

    fetchAlerts();
  }, [user, isAdmin, isApprover]);

  const dismiss = async () => {
    try {
      await Promise.all(
        alerts.map(a =>
          pb.collection('ice_change_log').update(a.id, { acknowledged: true })
        )
      );
      setAlerts([]);
    } catch (e) {
      console.error('[useIceAlerts] Dismiss failed:', e);
    }
  };

  return { alerts, dismiss };
}

import { describe, it, expect } from 'vitest';
import { deriveRoles } from './authUtils';

describe('authUtils', () => {
  describe('deriveRoles', () => {
    it('returns all false for null user', () => {
      const roles = deriveRoles(null);
      expect(roles.isAdmin).toBe(false);
      expect(roles.isApprover).toBe(false);
      expect(roles.isUploader).toBe(false);
      expect(roles.isFullViewer).toBe(false);
    });

    it('returns all false for user without role', () => {
      const roles = deriveRoles({ id: '123' });
      expect(roles.isAdmin).toBe(false);
      expect(roles.isApprover).toBe(false);
      expect(roles.isUploader).toBe(false);
      expect(roles.isFullViewer).toBe(false);
    });

    it('grants all permissions to admin', () => {
      const roles = deriveRoles({ role: 'admin' });
      expect(roles.isAdmin).toBe(true);
      expect(roles.isApprover).toBe(true);
      expect(roles.isUploader).toBe(true);
      expect(roles.isFullViewer).toBe(true);
    });

    it('grants approver and uploader to approver, denies admin', () => {
      const roles = deriveRoles({ role: 'approver' });
      expect(roles.isAdmin).toBe(false);
      expect(roles.isApprover).toBe(true);
      expect(roles.isUploader).toBe(true);
      expect(roles.isFullViewer).toBe(false);
    });

    it('grants only uploader to uploader', () => {
      const roles = deriveRoles({ role: 'uploader' });
      expect(roles.isAdmin).toBe(false);
      expect(roles.isApprover).toBe(false);
      expect(roles.isUploader).toBe(true);
      expect(roles.isFullViewer).toBe(false);
    });

    it('denies everything for unknown roles', () => {
      const roles = deriveRoles({ role: 'guest' });
      expect(roles.isAdmin).toBe(false);
      expect(roles.isApprover).toBe(false);
      expect(roles.isUploader).toBe(false);
      expect(roles.isFullViewer).toBe(false);
    });

    it('grants only full viewer to full_viewer', () => {
      const roles = deriveRoles({ role: 'full_viewer' });
      expect(roles.isAdmin).toBe(false);
      expect(roles.isApprover).toBe(false);
      expect(roles.isUploader).toBe(false);
      expect(roles.isFullViewer).toBe(true);
    });
  });
});

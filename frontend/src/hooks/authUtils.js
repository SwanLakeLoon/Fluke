/**
 * Pure function to derive boolean permissions from a user record.
 * Extracted from useAuth.jsx for testability.
 * 
 * @param {object|null} user - The PocketBase user record
 * @returns {{ isAdmin: boolean, isApprover: boolean, isUploader: boolean }}
 */
export function deriveRoles(user) {
  if (!user || !user.role) {
    return { isAdmin: false, isApprover: false, isUploader: false };
  }

  return {
    isAdmin:    user.role === 'admin',
    isApprover: ['approver', 'admin'].includes(user.role),
    isUploader: ['uploader', 'approver', 'admin'].includes(user.role),
  };
}

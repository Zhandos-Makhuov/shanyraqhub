import { EncryptedChatRoom, UserRole } from '../types';

/** Role hierarchy. Mirrors private.role_rank() in the proposed Supabase schema. */
export const ROLE_RANK: Record<UserRole, number> = {
  member: 0,
  organizer: 1,
  moderator: 2,
  admin: 3,
  super_admin: 4,
};

export const hasRole = (role: UserRole, minRole: UserRole): boolean =>
  ROLE_RANK[role] >= ROLE_RANK[minRole];

/** Staff = anyone who can open the admin panel / create events. */
export const isStaffRole = (role: UserRole): boolean => hasRole(role, 'organizer');

/**
 * Can `actor` change `target`'s role to `newRole`?
 * Admins manage roles strictly below their own; super admins manage everyone except themselves.
 */
export const canAssignRole = (
  actorRole: UserRole,
  actorId: string,
  targetId: string,
  targetRole: UserRole,
  newRole: UserRole
): boolean => {
  if (actorId === targetId) return false;
  if (!hasRole(actorRole, 'admin')) return false;
  if (actorRole === 'super_admin') return true;
  return ROLE_RANK[targetRole] < ROLE_RANK[actorRole] && ROLE_RANK[newRole] < ROLE_RANK[actorRole];
};

/** Closed rooms: 'moderators' rooms are for moderator+; other rooms for every member. */
export const canAccessRoom = (room: Pick<EncryptedChatRoom, 'accessLevel'>, role: UserRole): boolean =>
  room.accessLevel === 'moderators' ? hasRole(role, 'moderator') : true;

/**
 * The two kinds of admin, and what each is called on screen.
 *
 * Super admins are named in admins.json and can only be changed there; they
 * manage the normal admins from the admin page. Both can watch the fleet and
 * edit translations. The labels are the society's own words for the two.
 */
export type AdminRole = 'super' | 'normal';

export const ROLE_LABEL: Record<AdminRole, string> = {
  super: 'ලොකු Admin',
  normal: 'පොඩි admin',
};

export function isAdminRole(value: unknown): value is AdminRole {
  return value === 'super' || value === 'normal';
}

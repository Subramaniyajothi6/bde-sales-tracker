import type { User } from '@prisma/client';
import { ymd } from './time.js';

/** What the app may see about a user. Never includes the password hash. */
export function publicUser(u: User) {
  return {
    id: u.id,
    employeeId: u.employeeId,
    name: u.name,
    phone: u.phone,
    email: u.email,
    role: u.role,
    active: u.active,
    dailyTarget: u.dailyTarget,
    joinedOn: ymd(u.joinedOn),
    lastLoginAt: u.lastLoginAt,
    mustChangePassword: u.mustChangePassword
  };
}

/** Short reference to a user, for lists. */
export const userRef = (u: Pick<User, 'id' | 'employeeId' | 'name'>) => ({ id: u.id, employeeId: u.employeeId, name: u.name });

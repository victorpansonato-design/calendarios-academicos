import crypto from 'node:crypto';
import type { Role, User } from '@calendarios/core';
import type { Database } from '../db/database';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export function findUserByEmail(db: Database, email: string): User | undefined {
  return db.get<UserRow>('SELECT id, email, name, role FROM users WHERE email = ?', [email.toLowerCase()]);
}

export function upsertUser(db: Database, email: string, name: string, role: Role): User {
  const existing = findUserByEmail(db, email);
  if (existing) return existing;
  const user: User = { id: crypto.randomUUID(), email: email.toLowerCase(), name, role };
  db.run('INSERT INTO users (id, email, name, role, created_at) VALUES (?, ?, ?, ?, ?)', [user.id, user.email, user.name, user.role, new Date().toISOString()]);
  return user;
}

export function createSession(db: Database, userId: string, hours: number): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  db.run('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', [
    token,
    userId,
    now.toISOString(),
    new Date(now.getTime() + hours * 3600_000).toISOString(),
  ]);
  return token;
}

export function userForSession(db: Database, token: string): User | undefined {
  return db.get<UserRow>(
    `SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`,
    [token, new Date().toISOString()],
  );
}

export function deleteSession(db: Database, token: string) {
  db.run('DELETE FROM sessions WHERE token = ?', [token]);
}

import type { User } from '@supabase/supabase-js';

import { getDatabase } from '@/database/database';
import { supabase } from '@/services/supabase';

export type DirectoryUser = {
  id: string;
  name: string;
};

export async function syncCurrentUserDirectoryProfile(user: User): Promise<void> {
  if (!supabase) {
    return;
  }
  await syncDirectoryProfileName(user.id, getUserDisplayName(user));
}

export async function syncDirectoryProfileName(userId: string, name: string): Promise<void> {
  if (!supabase) {
    return;
  }
  const displayName = name.trim() || 'Usuario';
  const { error } = await supabase.from('user_profiles').upsert({ id: userId, display_name: displayName, updated_at: new Date().toISOString() });
  if (error) {
    throw new Error(error.message);
  }
  await upsertLocalDirectoryUsers([{ id: userId, name: displayName }]);
}

export async function getDirectoryUsers(): Promise<DirectoryUser[]> {
  if (!supabase) {
    return [];
  }
  const { data, error } = await supabase.from('user_profiles').select('id, display_name').order('display_name');
  if (error) {
    throw new Error(error.message);
  }
  const users = (data ?? []).map((profile) => ({ id: profile.id, name: profile.display_name.trim() || 'Usuario' }));
  await upsertLocalDirectoryUsers(users);
  return users;
}

function getUserDisplayName(user: User): string {
  return String(user.user_metadata.full_name ?? user.user_metadata.name ?? user.email?.split('@')[0] ?? 'Usuario').trim() || 'Usuario';
}

async function upsertLocalDirectoryUsers(users: DirectoryUser[]): Promise<void> {
  if (!users.length) {
    return;
  }
  const database = await getDatabase();
  const now = new Date().toISOString();
  for (const user of users) {
    await database.runAsync(
      `INSERT INTO profiles (id, display_name, email, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?)
       ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at`,
      user.id, user.name, now, now,
    );
  }
}

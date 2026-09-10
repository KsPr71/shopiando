import type { User } from '@supabase/supabase-js';

import { getDatabase } from '@/database/database';
import { supabase } from '@/services/supabase';

export type DirectoryUser = {
  id: string;
  name: string;
};

type RemoteDirectoryProfile = {
  display_name: string;
  full_name: string;
  phone: string;
  birth_date: string;
  address: string;
  gender: '' | 'male' | 'female';
};

export async function syncCurrentUserDirectoryProfile(user: User): Promise<void> {
  if (!supabase) {
    return;
  }
  const { data, error } = await supabase
    .from('user_profiles')
    .select('display_name, full_name, phone, birth_date, address, gender')
    .eq('id', user.id)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }

  const profile = data as RemoteDirectoryProfile | null;
  const existingName = profile?.display_name.trim();
  if (existingName) {
    await upsertLocalDirectoryUsers([{ id: user.id, name: existingName }]);
    await upsertLocalProfileDetails(user.id, profile);
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

export async function syncDirectoryProfileDetails(userId: string, profile: {
  fullName: string;
  phone: string;
  birthDate: string;
  address: string;
  gender: '' | 'male' | 'female';
}): Promise<void> {
  if (!supabase) {
    return;
  }
  const displayName = profile.fullName.trim() || 'Usuario';
  const { error } = await supabase.from('user_profiles').upsert({
    id: userId,
    display_name: displayName,
    full_name: profile.fullName.trim(),
    phone: profile.phone.trim(),
    birth_date: profile.birthDate.trim(),
    address: profile.address.trim(),
    gender: profile.gender,
    updated_at: new Date().toISOString(),
  });
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

async function upsertLocalProfileDetails(userId: string, profile: RemoteDirectoryProfile | null): Promise<void> {
  if (!profile || (!profile.full_name && !profile.phone && !profile.birth_date && !profile.address && !profile.gender)) {
    return;
  }
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO local_profile_details (user_id, full_name, phone, birth_date, address, gender, avatar_uri, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       full_name = excluded.full_name, phone = excluded.phone, birth_date = excluded.birth_date,
       address = excluded.address, gender = excluded.gender, updated_at = excluded.updated_at`,
    userId,
    profile.full_name || profile.display_name,
    profile.phone,
    profile.birth_date,
    profile.address,
    profile.gender,
    new Date().toISOString(),
  );
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

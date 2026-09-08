import { File, Paths } from 'expo-file-system';

import { getDatabase } from '@/database/database';
import { syncDirectoryProfileName } from '@/services/user-directory';

export type LocalProfile = {
  fullName: string;
  phone: string;
  birthDate: string;
  address: string;
  avatarUri: string | null;
};

type LocalProfileRow = {
  full_name: string;
  phone: string;
  birth_date: string;
  address: string;
  avatar_uri: string | null;
};

export async function getLocalProfile(userId: string): Promise<LocalProfile | null> {
  const database = await getDatabase();
  const profile = await database.getFirstAsync<LocalProfileRow>(
    `SELECT full_name, phone, birth_date, address, avatar_uri
     FROM local_profile_details
     WHERE user_id = ?`,
    userId
  );

  if (!profile) {
    return null;
  }

  return {
    fullName: profile.full_name,
    phone: profile.phone,
    birthDate: profile.birth_date,
    address: profile.address,
    avatarUri: profile.avatar_uri,
  };
}

export async function saveLocalProfile(userId: string, profile: LocalProfile): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO local_profile_details (
      user_id, full_name, phone, birth_date, address, avatar_uri, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      full_name = excluded.full_name,
      phone = excluded.phone,
      birth_date = excluded.birth_date,
      address = excluded.address,
      avatar_uri = excluded.avatar_uri,
      updated_at = excluded.updated_at`,
    userId,
    profile.fullName,
    profile.phone,
    profile.birthDate,
    profile.address,
    profile.avatarUri,
    new Date().toISOString()
  );
  void syncDirectoryProfileName(userId, profile.fullName).catch(() => {});
}

export async function persistAvatar(userId: string, sourceUri: string): Promise<string> {
  const source = new File(sourceUri);
  const extension = source.extension || '.jpg';
  const destination = new File(Paths.document, `profile-avatar-${userId}${extension}`);

  if (destination.exists) {
    destination.delete();
  }

  source.copy(destination);
  return destination.uri;
}

import { getDatabase } from '@/database/database';

const TRUE_VALUE = 'true';

export async function getUserBooleanPreference(
  userId: string,
  preferenceKey: string,
  fallback = false,
): Promise<boolean> {
  const database = await getDatabase();
  const preference = await database.getFirstAsync<{ preference_value: string }>(
    `SELECT preference_value
     FROM user_preferences
     WHERE user_id = ? AND preference_key = ?`,
    [userId, preferenceKey],
  );

  return preference ? preference.preference_value === TRUE_VALUE : fallback;
}

export async function setUserBooleanPreference(
  userId: string,
  preferenceKey: string,
  value: boolean,
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO user_preferences (user_id, preference_key, preference_value, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, preference_key) DO UPDATE SET
       preference_value = excluded.preference_value,
       updated_at = excluded.updated_at`,
    [userId, preferenceKey, value ? TRUE_VALUE : 'false', new Date().toISOString()],
  );
}

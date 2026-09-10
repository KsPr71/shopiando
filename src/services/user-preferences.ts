export async function getUserBooleanPreference(
  _userId: string,
  _preferenceKey: string,
  fallback = false,
): Promise<boolean> {
  return fallback;
}

export async function setUserBooleanPreference(
  _userId: string,
  _preferenceKey: string,
  _value: boolean,
): Promise<void> {}

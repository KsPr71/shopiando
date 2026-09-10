export type LocalProfile = {
  fullName: string;
  phone: string;
  birthDate: string;
  address: string;
  gender: ProfileGender;
  avatarUri: string | null;
};

export type ProfileGender = '' | 'male' | 'female';

export async function getLocalProfile(_userId: string): Promise<LocalProfile | null> {
  return null;
}

export async function saveLocalProfile(_userId: string, _profile: LocalProfile): Promise<void> {}

export async function syncProfileToSupabase(_userId: string, profile: LocalProfile): Promise<LocalProfile> {
  return profile;
}

export async function persistAvatar(_userId: string, sourceUri: string): Promise<string> {
  return sourceUri;
}

export type LocalProfile = {
  fullName: string;
  phone: string;
  birthDate: string;
  address: string;
  avatarUri: string | null;
};

export async function getLocalProfile(_userId: string): Promise<LocalProfile | null> {
  return null;
}

export async function saveLocalProfile(_userId: string, _profile: LocalProfile): Promise<void> {}

export async function persistAvatar(_userId: string, sourceUri: string): Promise<string> {
  return sourceUri;
}

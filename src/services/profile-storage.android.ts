import * as FileSystem from 'expo-file-system/legacy';

import { getDatabase } from '@/database/database';
import { supabase } from '@/services/supabase';

export type LocalProfile = {
  fullName: string;
  phone: string;
  birthDate: string;
  address: string;
  gender: ProfileGender;
  avatarUri: string | null;
};

export type ProfileGender = '' | 'male' | 'female';

type LocalProfileRow = {
  full_name: string;
  phone: string;
  birth_date: string;
  address: string;
  gender: ProfileGender;
  avatar_uri: string | null;
};

export async function getLocalProfile(userId: string): Promise<LocalProfile | null> {
  const database = await getDatabase();
  const profile = await database.getFirstAsync<LocalProfileRow>(
    `SELECT full_name, phone, birth_date, address, gender, avatar_uri
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
    gender: profile.gender,
    avatarUri: profile.avatar_uri,
  };
}

export async function saveLocalProfile(userId: string, profile: LocalProfile): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO local_profile_details (
      user_id, full_name, phone, birth_date, address, gender, avatar_uri, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      full_name = excluded.full_name,
      phone = excluded.phone,
      birth_date = excluded.birth_date,
      address = excluded.address,
      gender = excluded.gender,
      avatar_uri = excluded.avatar_uri,
      updated_at = excluded.updated_at`,
    userId,
    profile.fullName,
    profile.phone,
    profile.birthDate,
    profile.address,
    profile.gender,
    profile.avatarUri,
    new Date().toISOString()
  );
}

export async function syncProfileToSupabase(userId: string, profile: LocalProfile): Promise<LocalProfile> {
  if (!supabase) {
    throw new Error('Configura Supabase para sincronizar el perfil.');
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || userData.user?.id !== userId) {
    throw new Error(userError?.message ?? 'Inicia sesiÃ³n para sincronizar el perfil.');
  }

  const { data: remoteProfile, error: remoteError } = await supabase
    .from('user_profiles')
    .select('avatar_path')
    .eq('id', userId)
    .maybeSingle();
  if (remoteError) {
    throw new Error(remoteError.message);
  }

  let avatarPath = getAvatarPath(profile.avatarUri) ?? remoteProfile?.avatar_path ?? null;
  if (profile.avatarUri && !avatarPath) {
    const extension = getAvatarExtension(profile.avatarUri);
    avatarPath = `${userId}/${Date.now()}.${extension}`;
    const content = base64ToArrayBuffer(await FileSystem.readAsStringAsync(profile.avatarUri, {
      encoding: FileSystem.EncodingType.Base64,
    }));
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(avatarPath, content, { cacheControl: '31536000', contentType: getAvatarContentType(extension) });
    if (uploadError) {
      throw new Error(uploadError.message);
    }
  }

  const { data: savedProfile, error: profileError } = await supabase
    .from('user_profiles')
    .upsert({
      id: userId,
      display_name: profile.fullName.trim() || 'Usuario',
      full_name: profile.fullName.trim(),
      phone: profile.phone.trim(),
      birth_date: profile.birthDate.trim(),
      address: profile.address.trim(),
      gender: profile.gender,
      avatar_path: avatarPath,
      updated_at: new Date().toISOString(),
    })
    .select('full_name, phone, birth_date, address, gender, avatar_path')
    .single();
  if (profileError) {
    throw new Error(profileError.message);
  }

  if (
    savedProfile.full_name !== profile.fullName.trim()
    || savedProfile.phone !== profile.phone.trim()
    || savedProfile.birth_date !== profile.birthDate.trim()
    || savedProfile.address !== profile.address.trim()
    || savedProfile.gender !== profile.gender
  ) {
    throw new Error('Supabase no confirmó todos los cambios del perfil. Revisa las políticas RLS de user_profiles.');
  }

  return { ...profile, avatarUri: getAvatarUrl(savedProfile.avatar_path) };
}

export async function persistAvatar(userId: string, sourceUri: string): Promise<string> {
  if (!FileSystem.documentDirectory) {
    throw new Error('No se encontró el almacenamiento local de la aplicación.');
  }
  const destinationUri = `${FileSystem.documentDirectory}profile-avatar-${userId}-${Date.now()}.${getAvatarExtension(sourceUri)}`;
  await FileSystem.copyAsync({ from: sourceUri, to: destinationUri });
  return destinationUri;
}

function getAvatarPath(uri: string | null): string | null {
  if (!uri) {
    return null;
  }
  const marker = '/storage/v1/object/public/avatars/';
  const position = uri.indexOf(marker);
  return position === -1 ? null : decodeURIComponent(uri.slice(position + marker.length).split('?')[0]);
}

function getAvatarUrl(path: string | null): string | null {
  if (!path || !supabase) {
    return null;
  }
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl || null;
}

function getAvatarContentType(extension: string): string {
  if (extension === 'png') {
    return 'image/png';
  }
  if (extension === 'webp') {
    return 'image/webp';
  }
  return 'image/jpeg';
}

function getAvatarExtension(uri: string): string {
  const match = uri.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
  const extension = match?.[1]?.toLowerCase();
  return extension === 'png' || extension === 'webp' || extension === 'jpg' || extension === 'jpeg' ? extension : 'jpg';
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

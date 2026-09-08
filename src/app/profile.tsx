import * as ImagePicker from 'expo-image-picker';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SideMenu } from '@/components/side-menu';
import { DateInput } from '@/components/date-input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import {
  getLocalProfile,
  persistAvatar,
  saveLocalProfile,
  type LocalProfile,
} from '@/services/profile-storage';

export default function ProfileScreen() {
  const { isReady, user, signOut } = useAuth();
  const theme = useTheme();
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [address, setAddress] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [selectedAvatar, setSelectedAvatar] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [savedProfile, setSavedProfile] = useState<LocalProfile | null>(null);
  const [failedAvatarUri, setFailedAvatarUri] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAndroid = Platform.OS === 'android';

  useEffect(() => {
    if (!user) {
      return;
    }

    const fallbackProfile = getProfileDefaults(user);
    let isMounted = true;
    setProfileState(fallbackProfile);
    setSelectedAvatar(null);
    setFailedAvatarUri(null);
    setSavedProfile(fallbackProfile);

    if (!isAndroid) {
      return () => {
        isMounted = false;
      };
    }

    getLocalProfile(user.id)
      .then((localProfile) => {
        if (!isMounted || !localProfile) {
          return;
        }

        setProfileState(localProfile);
        setSavedProfile(localProfile);
      })
      .catch(() => {
        if (isMounted) {
          setError('No se pudo cargar el perfil guardado en este dispositivo.');
        }
      });

    return () => {
      isMounted = false;
    };

    function setProfileState(profile: LocalProfile) {
      setFullName(profile.fullName);
      setPhone(profile.phone);
      setBirthDate(profile.birthDate);
      setAddress(profile.address);
      setAvatarUri(profile.avatarUri);
    }
  }, [isAndroid, user]);

  if (!isReady) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (!user) {
    return <Redirect href="/" />;
  }

  const profileUser = user;
  const displayName = fullName.trim() || profileUser.email?.split('@')[0] || 'Usuario';
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  const currentAvatarUri = selectedAvatar?.uri ?? avatarUri;
  const showAvatar = Boolean(currentAvatarUri && currentAvatarUri !== failedAvatarUri);
  const avatarSource = currentAvatarUri ? { uri: currentAvatarUri } : undefined;

  async function chooseAvatar() {
    if (!isAndroid) {
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Necesitamos permiso para acceder a tus fotos y actualizar el avatar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setSelectedAvatar(result.assets[0]);
      setFailedAvatarUri(null);
      setError(null);
    }
  }

  async function saveProfile() {
    if (!isAndroid) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const nextAvatarUri = selectedAvatar
        ? await persistAvatar(profileUser.id, selectedAvatar.uri)
        : avatarUri;
      const nextProfile: LocalProfile = {
        fullName: fullName.trim(),
        phone: phone.trim(),
        birthDate: birthDate.trim(),
        address: address.trim(),
        avatarUri: nextAvatarUri,
      };

      await saveLocalProfile(profileUser.id, nextProfile);
      setProfileState(nextProfile);
      setSavedProfile(nextProfile);
      setSelectedAvatar(null);
      setFailedAvatarUri(null);
      setIsEditing(false);
      setMessage('Tu perfil se actualizó en este dispositivo.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo actualizar tu perfil.');
    } finally {
      setIsSaving(false);
    }

    function setProfileState(profile: LocalProfile) {
      setFullName(profile.fullName);
      setPhone(profile.phone);
      setBirthDate(profile.birthDate);
      setAddress(profile.address);
      setAvatarUri(profile.avatarUri);
    }
  }

  function cancelEditing() {
    if (savedProfile) {
      setFullName(savedProfile.fullName);
      setPhone(savedProfile.phone);
      setBirthDate(savedProfile.birthDate);
      setAddress(savedProfile.address);
      setAvatarUri(savedProfile.avatarUri);
    }
    setSelectedAvatar(null);
    setFailedAvatarUri(null);
    setError(null);
    setIsEditing(false);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboard}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.topBar}>
              <Pressable
                accessibilityLabel="Abrir menú"
                accessibilityRole="button"
                onPress={() => setIsMenuVisible(true)}
                style={[styles.menuButton, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText style={styles.menuIcon}>≡</ThemedText>
              </Pressable>
              <ThemedText style={styles.topBarTitle}>Perfil</ThemedText>
              <View style={styles.topBarSpacer} />
            </View>

            <View style={[styles.hero, { backgroundColor: theme.primary }]}>
              <View style={styles.avatarContainer}>
                <View style={[styles.avatar, { borderColor: theme.secondary }]}>
                  {showAvatar ? (
                    <Image
                      onError={() => setFailedAvatarUri(currentAvatarUri)}
                      source={avatarSource}
                      style={styles.avatarImage}
                    />
                  ) : (
                    <View style={[styles.avatarFallback, { backgroundColor: theme.secondary }]}>
                      <ThemedText style={[styles.avatarText, { color: theme.text }]}>{initials}</ThemedText>
                    </View>
                  )}
                </View>
                {isEditing && isAndroid ? (
                  <Pressable
                    accessibilityLabel="Cambiar foto de perfil"
                    accessibilityRole="button"
                    onPress={chooseAvatar}
                    style={[styles.avatarEditButton, { backgroundColor: theme.secondary }]}>
                    <ThemedText style={[styles.avatarEditIcon, { color: theme.text }]}>✎</ThemedText>
                  </Pressable>
                ) : null}
              </View>
              <ThemedText style={styles.heroName}>{displayName}</ThemedText>
              <ThemedText style={styles.heroEmail}>{profileUser.email}</ThemedText>
            </View>

            <ThemedView type="backgroundElement" style={styles.infoCard}>
              <View style={styles.cardHeader}>
                <View>
                  <ThemedText style={styles.sectionTitle}>Información personal</ThemedText>
                  <ThemedText themeColor="textSecondary" style={styles.sectionCopy}>
                    {isEditing ? 'Edita tus datos personales.' : 'Tus datos registrados en este dispositivo.'}
                  </ThemedText>
                </View>
                {isAndroid ? (
                  <Pressable accessibilityRole="button" onPress={() => (isEditing ? cancelEditing() : setIsEditing(true))}>
                    <ThemedText themeColor="info" style={styles.editAction}>
                      {isEditing ? 'Cancelar' : 'Editar'}
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>

              {isEditing ? (
                <View style={styles.fields}>
                  <ProfileInput label="Nombre completo" onChangeText={setFullName} placeholder="Tu nombre" theme={theme} value={fullName} />
                  <ProfileInput label="Teléfono" keyboardType="phone-pad" onChangeText={setPhone} placeholder="Tu teléfono" theme={theme} value={phone} />
                  <DateInput label="Fecha de nacimiento" onChange={setBirthDate} theme={theme} value={birthDate} />
                  <ProfileInput label="Dirección personal" multiline onChangeText={setAddress} placeholder="Tu dirección" theme={theme} value={address} />
                  <ProfileInput editable={false} label="Correo electrónico" theme={theme} value={profileUser.email ?? ''} />
                </View>
              ) : (
                <View style={styles.infoRows}>
                  <ProfileInfoRow icon="○" label="Nombre completo" value={displayName} />
                  <ProfileInfoRow icon="⌁" label="Teléfono" value={phone || 'No registrado'} />
                  <ProfileInfoRow icon="□" label="Fecha de nacimiento" value={birthDate || 'No registrada'} />
                  <ProfileInfoRow icon="⌂" label="Dirección personal" value={address || 'No registrada'} />
                  <ProfileInfoRow icon="✉" label="Correo electrónico" value={profileUser.email ?? 'No registrado'} />
                </View>
              )}

              {error ? <ThemedText style={[styles.feedback, { color: theme.info }]}>{error}</ThemedText> : null}
              {message ? <ThemedText style={[styles.feedback, { color: theme.success }]}>{message}</ThemedText> : null}
            </ThemedView>

            {isEditing && isAndroid ? (
              <Pressable
                accessibilityRole="button"
                disabled={isSaving}
                onPress={saveProfile}
                style={({ pressed }) => [styles.saveButton, { backgroundColor: theme.primary }, isSaving && styles.disabled, pressed && styles.pressed]}>
                {isSaving ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.saveText}>Guardar cambios</ThemedText>}
              </Pressable>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <SideMenu onClose={() => setIsMenuVisible(false)} onSignOut={signOut} userEmail={profileUser.email} visible={isMenuVisible} />
    </ThemedView>
  );
}

function getProfileDefaults(user: NonNullable<ReturnType<typeof useAuth>['user']>): LocalProfile {
  return {
    fullName: String(user.user_metadata.full_name ?? user.user_metadata.name ?? ''),
    phone: String(user.user_metadata.phone ?? user.phone ?? ''),
    birthDate: String(user.user_metadata.birth_date ?? ''),
    address: String(user.user_metadata.address ?? ''),
    avatarUri: null,
  };
}

function ProfileInfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  const theme = useTheme();

  return (
    <View style={[styles.infoRow, { borderBottomColor: theme.backgroundSelected }]}>
      <View style={[styles.infoIcon, { backgroundColor: theme.backgroundSelected }]}>
        <ThemedText style={[styles.infoIconText, { color: theme.textSecondary }]}>{icon}</ThemedText>
      </View>
      <View style={styles.infoText}>
        <ThemedText themeColor="textSecondary" style={styles.infoLabel}>{label}</ThemedText>
        <ThemedText numberOfLines={2} style={styles.infoValue}>{value}</ThemedText>
      </View>
    </View>
  );
}

type ProfileInputProps = {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>;
  onChangeText?: (value: string) => void;
  placeholder?: string;
  editable?: boolean;
  multiline?: boolean;
  keyboardType?: 'phone-pad' | 'number-pad';
};

function ProfileInput({ label, theme, editable = true, multiline = false, ...inputProps }: ProfileInputProps) {
  return (
    <View style={styles.fieldGroup}>
      <ThemedText style={styles.fieldLabel} themeColor="textSecondary">{label}</ThemedText>
      <TextInput
        {...inputProps}
        editable={editable}
        multiline={multiline}
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, multiline && styles.multilineInput, { backgroundColor: theme.background, borderColor: theme.backgroundSelected, color: theme.text }, !editable && styles.readOnlyInput]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  keyboard: { flex: 1 },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  content: { alignSelf: 'center', flexGrow: 1, maxWidth: MaxContentWidth, paddingBottom: Spacing.four, width: '100%' },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  menuButton: { alignItems: 'center', borderRadius: Spacing.two, height: 44, justifyContent: 'center', width: 44 },
  menuIcon: { fontSize: 26, lineHeight: 28 },
  topBarTitle: { fontSize: 18, fontWeight: '800' },
  topBarSpacer: { width: 44 },
  hero: { alignItems: 'center', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: Spacing.six, paddingHorizontal: Spacing.four, paddingTop: Spacing.three, width: '100%' },
  avatarContainer: { height: 124, position: 'relative', width: 124 },
  avatar: { borderRadius: 58, borderWidth: 4, height: 116, overflow: 'hidden', width: 116 },
  avatarImage: { height: '100%', width: '100%' },
  avatarFallback: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  avatarText: { fontSize: 38, fontWeight: '800' },
  avatarEditButton: { alignItems: 'center', borderRadius: 14, bottom: 2, elevation: 4, height: 28, justifyContent: 'center', position: 'absolute', right: 2, shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 4, width: 28 },
  avatarEditIcon: { fontSize: 15, fontWeight: '800' },
  heroName: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginTop: Spacing.three },
  heroEmail: { color: '#FFFFFF', fontSize: 14, marginTop: Spacing.one, opacity: 0.9 },
  infoCard: { borderRadius: Spacing.five, elevation: 4, gap: Spacing.three, marginHorizontal: Spacing.three, marginTop: -Spacing.four, padding: Spacing.four, shadowColor: '#000000', shadowOffset: { height: 4, width: 0 }, shadowOpacity: 0.12, shadowRadius: 10 },
  cardHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between' },
  sectionTitle: { fontSize: 20, fontWeight: '800' },
  sectionCopy: { fontSize: 14, lineHeight: 20, marginTop: Spacing.half },
  editAction: { fontSize: 15, fontWeight: '800', paddingVertical: Spacing.one },
  infoRows: { gap: Spacing.one },
  infoRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: Spacing.three, minHeight: 64, paddingVertical: Spacing.two },
  infoIcon: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  infoIconText: { fontSize: 18, fontWeight: '500' },
  infoText: { flex: 1, gap: 2 },
  infoLabel: { fontSize: 12, fontWeight: '700' },
  infoValue: { fontSize: 15, fontWeight: '600' },
  fields: { gap: Spacing.three },
  fieldGroup: { gap: Spacing.one },
  fieldLabel: { fontSize: 13, fontWeight: '700' },
  input: { borderRadius: Spacing.two, borderWidth: 1, fontSize: 16, minHeight: 52, paddingHorizontal: Spacing.three },
  multilineInput: { minHeight: 88, paddingTop: Spacing.three, textAlignVertical: 'top' },
  readOnlyInput: { opacity: 0.64 },
  feedback: { fontSize: 13, lineHeight: 19 },
  saveButton: { alignItems: 'center', borderRadius: Spacing.two, height: 52, justifyContent: 'center', marginHorizontal: Spacing.three, marginTop: Spacing.three },
  saveText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.86 },
});

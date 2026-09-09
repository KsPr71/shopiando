import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SideMenu } from '@/components/side-menu';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import {
  getPushNotificationDebugInfo,
  registerPushToken,
  type PushNotificationDebugInfo,
} from '@/services/push-notifications';

export default function SettingsScreen() {
  const { isReady, user, signOut } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [debugInfo, setDebugInfo] = useState<PushNotificationDebugInfo | null>(null);

  const refreshDebugInfo = useCallback(async () => {
    if (!user) {
      return;
    }
    setIsLoading(true);
    try {
      setDebugInfo(await getPushNotificationDebugInfo(user.id));
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refreshDebugInfo();
  }, [refreshDebugInfo]);

  if (!isReady) {
    return <ThemedView style={styles.centered}><ActivityIndicator /></ThemedView>;
  }
  if (!user) {
    return <Redirect href="/" />;
  }
  const currentUser = user;

  async function retryRegistration() {
    setIsRegistering(true);
    try {
      await registerPushToken(currentUser.id);
    } finally {
      setIsRegistering(false);
      await refreshDebugInfo();
    }
  }

  const isRegistered = debugInfo?.isRegisteredInSupabase === true;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <Pressable accessibilityLabel="Abrir menú" onPress={() => setIsMenuVisible(true)} style={[styles.iconButton, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={styles.menuIcon}>☰</ThemedText>
            </Pressable>
            <ThemedText style={styles.title}>Ajustes</ThemedText>
            <Pressable accessibilityLabel="Cerrar ajustes" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={[styles.iconButton, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={styles.closeIcon}>×</ThemedText>
            </Pressable>
          </View>

          <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}>
            <ThemedText style={styles.cardTitle}>Diagnóstico de notificaciones</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.cardCopy}>Comprueba la conexión de este dispositivo con FCM y Supabase.</ThemedText>

            {isLoading ? <ActivityIndicator color={theme.primary} style={styles.loader} /> : (
              <View style={styles.rows}>
                <DiagnosticRow label="Entorno" value={debugInfo?.environment ?? 'Desconocido'} tone={debugInfo?.isSupported ? 'success' : 'warning'} />
                <DiagnosticRow label="Permiso" value={debugInfo?.permission ?? 'Desconocido'} tone={debugInfo?.permission === 'granted' ? 'success' : 'warning'} />
                <DiagnosticRow label="Token Expo" value={maskToken(debugInfo?.token)} tone={debugInfo?.token ? 'success' : 'warning'} />
                <DiagnosticRow label="Registrado en Supabase" value={debugInfo?.isRegisteredInSupabase === true ? 'Sí' : debugInfo?.isRegisteredInSupabase === false ? 'No' : 'Pendiente'} tone={isRegistered ? 'success' : 'warning'} />
                {debugInfo?.message ? <ThemedText style={[styles.message, { color: theme.info }]}>{debugInfo.message}</ThemedText> : null}
              </View>
            )}

            <Pressable disabled={isLoading || isRegistering} onPress={retryRegistration} style={({ pressed }) => [styles.primaryButton, { backgroundColor: theme.primary }, (isLoading || isRegistering) && styles.disabled, pressed && styles.pressed]}>
              {isRegistering ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.primaryButtonText}>Registrar o actualizar token</ThemedText>}
            </Pressable>
            <Pressable disabled={isLoading} onPress={() => void refreshDebugInfo()} style={({ pressed }) => [styles.secondaryButton, { borderColor: theme.primary }, isLoading && styles.disabled, pressed && styles.pressed]}>
              <ThemedText style={[styles.secondaryButtonText, { color: theme.primary }]}>Actualizar diagnóstico</ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
      <SideMenu onClose={() => setIsMenuVisible(false)} onSignOut={signOut} userEmail={user.email} visible={isMenuVisible} />
    </ThemedView>
  );
}

function DiagnosticRow({ label, value, tone }: { label: string; value: string; tone: 'success' | 'warning' }) {
  const theme = useTheme();
  const color = tone === 'success' ? theme.success : theme.info;
  return (
    <View style={[styles.row, { borderBottomColor: theme.backgroundSelected }]}>
      <ThemedText themeColor="textSecondary" style={styles.rowLabel}>{label}</ThemedText>
      <View style={styles.rowValue}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <ThemedText numberOfLines={1} style={styles.rowText}>{value}</ThemedText>
      </View>
    </View>
  );
}

function maskToken(token: string | null | undefined): string {
  if (!token) {
    return 'No disponible';
  }
  return `${token.slice(0, 14)}…${token.slice(-8)}`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  content: { alignSelf: 'center', flexGrow: 1, maxWidth: MaxContentWidth, padding: Spacing.three, width: '100%' },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.four },
  iconButton: { alignItems: 'center', borderRadius: Spacing.two, height: 44, justifyContent: 'center', width: 44 },
  menuIcon: { fontSize: 24, lineHeight: 28 },
  closeIcon: { fontSize: 25, lineHeight: 28 },
  title: { fontSize: 19, fontWeight: '800' },
  card: { borderRadius: Spacing.three, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.three, padding: Spacing.three },
  cardTitle: { fontSize: 17, fontWeight: '800' },
  cardCopy: { fontSize: 13, lineHeight: 18, marginTop: -Spacing.two },
  loader: { marginVertical: Spacing.five },
  rows: { gap: Spacing.half },
  row: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 48 },
  rowLabel: { fontSize: 13, fontWeight: '700' },
  rowValue: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: Spacing.one, justifyContent: 'flex-end', marginLeft: Spacing.two },
  dot: { borderRadius: 4, height: 8, width: 8 },
  rowText: { fontSize: 13, fontWeight: '600', maxWidth: '85%' },
  message: { fontSize: 13, lineHeight: 19, marginTop: Spacing.one },
  primaryButton: { alignItems: 'center', borderRadius: Spacing.two, height: 48, justifyContent: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  secondaryButton: { alignItems: 'center', borderRadius: Spacing.two, borderWidth: 1, height: 46, justifyContent: 'center' },
  secondaryButtonText: { fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.86 },
});

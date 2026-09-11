import { Redirect } from 'expo-router';
import { useFonts } from 'expo-font';
import { MaterialSymbols_400Regular } from '@expo-google-fonts/material-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SideMenu } from '@/components/side-menu';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { addSupplier, getSuppliers, type Supplier } from '@/services/suppliers';

export default function SuppliersScreen() {
  const [symbolsLoaded] = useFonts({ MaterialSymbols: MaterialSymbols_400Regular });
  const { isReady, user, signOut } = useAuth();
  const theme = useTheme();
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isFormExpanded, setIsFormExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }
    void getSuppliers()
      .then(setSuppliers)
      .catch((supplierError) => setError(supplierError instanceof Error ? supplierError.message : 'No se pudieron cargar los proveedores.'))
      .finally(() => setIsLoading(false));
  }, [user]);

  if (!isReady) {
    return <ThemedView style={styles.centered}><ActivityIndicator /></ThemedView>;
  }
  if (!user) {
    return <Redirect href="/" />;
  }

  async function saveSupplier() {
    if (!name.trim()) {
      setError('Indica el nombre del proveedor.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const supplier = await addSupplier({ name, address, phone });
      setSuppliers((current) => [...current, supplier].sort((first, second) => first.name.localeCompare(second.name)));
      setName('');
      setAddress('');
      setPhone('');
      setMessage('Proveedor añadido correctamente.');
      setIsFormExpanded(false);
    } catch (supplierError) {
      setError(supplierError instanceof Error ? supplierError.message : 'No se pudo añadir el proveedor.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Abrir menú" onPress={() => setIsMenuVisible(true)} style={styles.menuButton}>
            <ThemedText style={[styles.menuIcon, { color: theme.text }]}>{symbolsLoaded ? 'menu' : '☰'}</ThemedText>
          </Pressable>
          <View>
            <ThemedText style={styles.title}>Proveedores</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>Gestiona la lista disponible para tus productos.</ThemedText>
          </View>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'android' ? 'height' : 'padding'} style={styles.keyboard}>
        <ScrollView contentContainerStyle={styles.content} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
          <View style={[styles.formCard, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
            <Pressable accessibilityRole="button" onPress={() => setIsFormExpanded((current) => !current)} style={styles.accordionHeader}>
              <View style={styles.accordionTitle}>
                <ThemedText style={[styles.accordionIcon, { color: theme.primary }]}>{symbolsLoaded ? 'add_business' : '+'}</ThemedText>
                <ThemedText style={styles.formTitle}>Añadir proveedor</ThemedText>
              </View>
              <ThemedText style={[styles.accordionIcon, { color: theme.textSecondary }]}>{symbolsLoaded ? (isFormExpanded ? 'expand_less' : 'expand_more') : '⌄'}</ThemedText>
            </Pressable>
            {isFormExpanded ? (
              <View style={styles.accordionContent}>
                <TextInput value={name} onChangeText={setName} placeholder="Nombre" placeholderTextColor={theme.textSecondary} style={[styles.input, { backgroundColor: theme.background, borderColor: theme.backgroundSelected, color: theme.text }]} />
                <TextInput value={address} onChangeText={setAddress} placeholder="Dirección" placeholderTextColor={theme.textSecondary} style={[styles.input, { backgroundColor: theme.background, borderColor: theme.backgroundSelected, color: theme.text }]} />
                <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Número telefónico" placeholderTextColor={theme.textSecondary} style={[styles.input, { backgroundColor: theme.background, borderColor: theme.backgroundSelected, color: theme.text }]} />
                {error ? <ThemedText style={[styles.feedback, { color: theme.info }]}>{error}</ThemedText> : null}
                <Pressable disabled={isSaving} onPress={saveSupplier} style={[styles.saveButton, { backgroundColor: theme.primary }, isSaving && styles.disabled]}>
                  {isSaving ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.saveButtonText}>Guardar proveedor</ThemedText>}
                </Pressable>
              </View>
            ) : null}
          </View>
          {message ? <ThemedText style={[styles.feedback, { color: theme.success }]}>{message}</ThemedText> : null}

          <ThemedText style={styles.listTitle}>Proveedores registrados</ThemedText>
          {isLoading ? <ActivityIndicator /> : suppliers.length ? suppliers.map((supplier) => (
            <View key={supplier.id} style={[styles.supplierCard, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
              <ThemedText style={styles.supplierName}>{supplier.name}</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.supplierDetail}>{supplier.address || 'Sin dirección'}</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.supplierDetail}>{supplier.phone || 'Sin teléfono'}</ThemedText>
            </View>
          )) : <ThemedText themeColor="textSecondary">Aún no hay proveedores registrados.</ThemedText>}
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <SideMenu onClose={() => setIsMenuVisible(false)} onSignOut={signOut} userEmail={user.email} visible={isMenuVisible} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#FAF9F6', flex: 1 },
  safeArea: { flex: 1 },
  keyboard: { flex: 1 },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  header: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  menuButton: { alignItems: 'center', borderRadius: Spacing.two, height: 42, justifyContent: 'center', width: 42 },
  menuIcon: { fontFamily: 'MaterialSymbols', fontSize: 26, lineHeight: 28, textAlign: 'center' },
  title: { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },
  content: { flexGrow: 1, gap: Spacing.three, padding: Spacing.four, paddingBottom: 140 },
  formCard: { borderRadius: Spacing.three, borderWidth: 1, overflow: 'hidden' },
  accordionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 54, paddingHorizontal: Spacing.three },
  accordionTitle: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  accordionIcon: { fontFamily: 'MaterialSymbols', fontSize: 22, lineHeight: 24, textAlign: 'center' },
  formTitle: { fontSize: 16, fontWeight: '800' },
  accordionContent: { gap: Spacing.two, padding: Spacing.three, paddingTop: 0 },
  input: { borderRadius: Spacing.two, borderWidth: 1, fontSize: 14, minHeight: 48, paddingHorizontal: Spacing.three },
  feedback: { fontSize: 13, fontWeight: '600' },
  saveButton: { alignItems: 'center', borderRadius: Spacing.two, justifyContent: 'center', minHeight: 48, marginTop: Spacing.one },
  saveButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  listTitle: { fontSize: 17, fontWeight: '800', marginTop: Spacing.one },
  supplierCard: { borderRadius: Spacing.three, borderWidth: 1, gap: 3, padding: Spacing.three },
  supplierName: { fontSize: 16, fontWeight: '800' },
  supplierDetail: { fontSize: 13 },
  disabled: { opacity: 0.5 },
});

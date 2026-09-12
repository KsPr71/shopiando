import { MaterialSymbols_400Regular } from '@expo-google-fonts/material-symbols';
import { Image } from 'expo-image';
import { useFonts } from 'expo-font';
import * as ImagePicker from 'expo-image-picker';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SideMenu } from '@/components/side-menu';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { addSupplier, deleteSupplier, getCachedSuppliers, getSuppliers, subscribeToSuppliers, updateSupplier, type Supplier } from '@/services/suppliers';

export default function SuppliersScreen() {
  const [symbolsLoaded] = useFonts({ MaterialSymbols: MaterialSymbols_400Regular });
  const { isReady, user, signOut } = useAuth();
  const theme = useTheme();
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [expandedSupplierId, setExpandedSupplierId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormExpanded, setIsFormExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    const refresh = () => void getSuppliers().then((next) => mounted && setSuppliers(next)).catch(() => {});
    void getCachedSuppliers().then((cached) => {
      if (mounted && cached.length) { setSuppliers(cached); setIsLoading(false); }
    });
    void getSuppliers()
      .then((next) => mounted && setSuppliers(next))
      .catch((loadError) => mounted && setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los proveedores.'))
      .finally(() => mounted && setIsLoading(false));
    const unsubscribe = subscribeToSuppliers(refresh);
    return () => { mounted = false; unsubscribe(); };
  }, [user]);

  if (!isReady) return <ThemedView style={styles.centered}><ActivityIndicator /></ThemedView>;
  if (!user) return <Redirect href="/" />;

  const canManage = (supplier: Supplier) => supplier.createdBy === user.id || user.app_metadata.role === 'admin';

  function resetForm() {
    setEditingSupplier(null); setName(''); setAddress(''); setPhone(''); setImage(null); setError(null);
  }

  function startEditing(supplier: Supplier) {
    setEditingSupplier(supplier); setName(supplier.name); setAddress(supplier.address); setPhone(supplier.phone);
    setImage(null); setExpandedSupplierId(null); setIsFormExpanded(true); setError(null);
  }

  async function chooseImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setError('Se necesita permiso para seleccionar una imagen.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) setImage(result.assets[0]);
  }

  async function saveSupplier() {
    if (!name.trim()) { setError('Indica el nombre del proveedor.'); return; }
    setIsSaving(true); setError(null); setMessage(null);
    try {
      const saved = editingSupplier
        ? await updateSupplier(editingSupplier.id, { name, address, phone, image })
        : await addSupplier({ name, address, phone, image });
      setSuppliers((current) => {
        const exists = current.some((supplier) => supplier.id === saved.id);
        return (exists ? current.map((supplier) => supplier.id === saved.id ? saved : supplier) : [...current, saved])
          .sort((first, second) => first.name.localeCompare(second.name));
      });
      setMessage(editingSupplier ? 'Proveedor actualizado.' : 'Proveedor añadido correctamente.');
      resetForm(); setIsFormExpanded(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el proveedor.');
    } finally { setIsSaving(false); }
  }

  function confirmDelete(supplier: Supplier) {
    setExpandedSupplierId(null);
    Alert.alert('Eliminar proveedor', `¿Eliminar ${supplier.name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => void removeSupplier(supplier) },
    ]);
  }

  async function removeSupplier(supplier: Supplier) {
    try {
      await deleteSupplier(supplier.id);
      setSuppliers((current) => current.filter((candidate) => candidate.id !== supplier.id));
      setMessage('Proveedor eliminado.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'No se pudo eliminar el proveedor.');
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Abrir menú" onPress={() => setIsMenuVisible(true)} style={styles.menuButton}>
            <ThemedText style={[styles.materialIcon, { color: theme.text }]}>{symbolsLoaded ? 'menu' : '☰'}</ThemedText>
          </Pressable>
          <View><ThemedText style={styles.title}>Proveedores</ThemedText><ThemedText themeColor="textSecondary" style={styles.subtitle}>Contactos disponibles para tus productos.</ThemedText></View>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'android' ? 'height' : 'padding'} style={styles.keyboard}>
          <ScrollView contentContainerStyle={styles.content} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
            <View style={[styles.formBox, { borderColor: theme.backgroundSelected }]}>
              <Pressable onPress={() => { if (isFormExpanded) resetForm(); setIsFormExpanded((current) => !current); }} style={styles.accordionHeader}>
                <View style={styles.accordionTitle}><ThemedText style={[styles.materialIcon, { color: theme.primary }]}>{symbolsLoaded ? (editingSupplier ? 'edit' : 'add_business') : '+'}</ThemedText><ThemedText style={styles.formTitle}>{editingSupplier ? 'Editar proveedor' : 'Añadir proveedor'}</ThemedText></View>
                <ThemedText style={[styles.materialIcon, { color: theme.textSecondary }]}>{symbolsLoaded ? (isFormExpanded ? 'expand_less' : 'expand_more') : '⌄'}</ThemedText>
              </Pressable>
              {isFormExpanded ? <View style={styles.formContent}>
                <Pressable onPress={chooseImage} style={[styles.imagePicker, { borderColor: theme.backgroundSelected }]}>
                  {image?.uri || editingSupplier?.imageUrl ? <Image source={{ uri: image?.uri ?? editingSupplier?.imageUrl ?? '' }} contentFit="cover" style={styles.imagePreview} /> : <ThemedText style={[styles.materialIcon, { color: theme.primary }]}>{symbolsLoaded ? 'add_photo_alternate' : '+'}</ThemedText>}
                  <ThemedText themeColor="textSecondary" style={styles.imagePickerText}>Seleccionar imagen</ThemedText>
                </Pressable>
                <TextInput value={name} onChangeText={setName} placeholder="Nombre" placeholderTextColor={theme.textSecondary} style={[styles.input, { borderColor: theme.backgroundSelected, color: theme.text }]} />
                <TextInput value={address} onChangeText={setAddress} placeholder="Dirección" placeholderTextColor={theme.textSecondary} style={[styles.input, { borderColor: theme.backgroundSelected, color: theme.text }]} />
                <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Número telefónico" placeholderTextColor={theme.textSecondary} style={[styles.input, { borderColor: theme.backgroundSelected, color: theme.text }]} />
                {error ? <ThemedText style={[styles.feedback, { color: theme.info }]}>{error}</ThemedText> : null}
                <Pressable disabled={isSaving} onPress={saveSupplier} style={[styles.saveButton, { backgroundColor: theme.primary }, isSaving && styles.disabled]}>{isSaving ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.saveButtonText}>Guardar proveedor</ThemedText>}</Pressable>
              </View> : null}
            </View>
            {message ? <ThemedText style={[styles.feedback, { color: theme.success }]}>{message}</ThemedText> : null}
            {!isFormExpanded && error ? <ThemedText style={[styles.feedback, { color: theme.info }]}>{error}</ThemedText> : null}

            {isLoading ? <ActivityIndicator /> : suppliers.length ? <View style={styles.list}>{suppliers.map((supplier) => {
              const expanded = expandedSupplierId === supplier.id;
              return <View key={supplier.id} style={[styles.supplierRow, { borderBottomColor: theme.backgroundSelected }]}>
                {supplier.imageUrl ? <Image source={{ uri: supplier.imageUrl }} contentFit="cover" recyclingKey={`${supplier.id}:${supplier.imagePath}`} style={styles.supplierImage} transition={180} /> : <View style={[styles.supplierFallback, { backgroundColor: theme.backgroundSelected }]}><ThemedText style={styles.supplierInitial}>{supplier.name.charAt(0).toUpperCase()}</ThemedText></View>}
                <View style={styles.supplierInfo}><ThemedText numberOfLines={1} style={styles.supplierName}>{supplier.name}</ThemedText><ThemedText numberOfLines={1} themeColor="textSecondary" style={styles.supplierDetail}>{supplier.phone || supplier.address || 'Sin datos de contacto'}</ThemedText></View>
                {expanded && canManage(supplier) ? <SupplierActions onDelete={() => confirmDelete(supplier)} onEdit={() => startEditing(supplier)} symbolsLoaded={symbolsLoaded} /> : null}
                {canManage(supplier) ? <Pressable accessibilityLabel="Opciones del proveedor" onPress={() => setExpandedSupplierId(expanded ? null : supplier.id)} style={styles.moreButton}><ThemedText style={[styles.materialIcon, { color: theme.textSecondary }]}>{symbolsLoaded ? 'more_horiz' : '•••'}</ThemedText></Pressable> : null}
              </View>;
            })}</View> : <ThemedText themeColor="textSecondary">Aún no hay proveedores registrados.</ThemedText>}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <SideMenu onClose={() => setIsMenuVisible(false)} onSignOut={signOut} userEmail={user.email} visible={isMenuVisible} />
    </ThemedView>
  );
}

function SupplierActions({ onDelete, onEdit, symbolsLoaded }: { onDelete: () => void; onEdit: () => void; symbolsLoaded: boolean }) {
  const theme = useTheme();
  const [translateX] = useState(() => new Animated.Value(34));
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, { duration: 190, toValue: 0, useNativeDriver: true }),
      Animated.timing(opacity, { duration: 150, toValue: 1, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateX]);

  return <Animated.View style={[styles.rowActions, { opacity, transform: [{ translateX }] }]}>
    <Pressable accessibilityLabel="Editar proveedor" onPress={onEdit} style={[styles.actionButton, { backgroundColor: theme.primary }]}><ThemedText style={styles.actionIcon}>{symbolsLoaded ? 'edit' : '✎'}</ThemedText></Pressable>
    <Pressable accessibilityLabel="Eliminar proveedor" onPress={onDelete} style={[styles.actionButton, { backgroundColor: theme.info }]}><ThemedText style={styles.actionIcon}>{symbolsLoaded ? 'delete' : '×'}</ThemedText></Pressable>
  </Animated.View>;
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#FAF9F6', flex: 1 }, safeArea: { flex: 1 }, keyboard: { flex: 1 }, centered: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  header: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three }, menuButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 }, materialIcon: { fontFamily: 'MaterialSymbols', fontSize: 24, lineHeight: 26, textAlign: 'center' }, title: { fontSize: 22, fontWeight: '800' }, subtitle: { fontSize: 13, marginTop: 2 },
  content: { flexGrow: 1, gap: Spacing.three, padding: Spacing.four, paddingBottom: 140 }, formBox: { borderBottomWidth: StyleSheet.hairlineWidth }, accordionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 52 }, accordionTitle: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two }, formTitle: { fontSize: 16, fontWeight: '700' }, formContent: { gap: Spacing.two, paddingBottom: Spacing.three },
  imagePicker: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: Spacing.two, borderWidth: 1, flexDirection: 'row', gap: Spacing.two, minHeight: 58, overflow: 'hidden', paddingHorizontal: Spacing.two }, imagePreview: { borderRadius: Spacing.one, height: 44, width: 44 }, imagePickerText: { fontSize: 13 }, input: { backgroundColor: '#FFFFFF', borderRadius: Spacing.two, borderWidth: 1, fontSize: 14, minHeight: 48, paddingHorizontal: Spacing.three }, feedback: { fontSize: 13, fontWeight: '600' }, saveButton: { alignItems: 'center', borderRadius: Spacing.two, justifyContent: 'center', minHeight: 48 }, saveButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' }, disabled: { opacity: 0.5 },
  list: { width: '100%' }, supplierRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 78, paddingVertical: Spacing.two }, supplierImage: { borderRadius: Spacing.one, height: 56, width: 56 }, supplierFallback: { alignItems: 'center', borderRadius: Spacing.one, height: 56, justifyContent: 'center', width: 56 }, supplierInitial: { fontSize: 20, fontWeight: '800' }, supplierInfo: { flex: 1, gap: 3, paddingHorizontal: Spacing.two }, supplierName: { fontSize: 16, fontWeight: '700' }, supplierDetail: { fontSize: 12 }, rowActions: { flexDirection: 'row', gap: Spacing.one }, actionButton: { alignItems: 'center', borderRadius: Spacing.two, height: 44, justifyContent: 'center', width: 44 }, actionIcon: { color: '#FFFFFF', fontFamily: 'MaterialSymbols', fontSize: 22, lineHeight: 24 }, moreButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 38 },
});

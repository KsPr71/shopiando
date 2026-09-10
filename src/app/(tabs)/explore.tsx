import { MaterialSymbols_400Regular } from '@expo-google-fonts/material-symbols';
import { Image } from 'expo-image';
import { useFonts } from 'expo-font';
import * as ImagePicker from 'expo-image-picker';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SideMenu } from '@/components/side-menu';
import { ImageZoomPreview } from '@/components/image-zoom-preview';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { getDirectoryUsers, type DirectoryUser } from '@/services/user-directory';
import { getLocalProfile } from '@/services/profile-storage';
import {
  addWarehouse,
  addWarehouseItem,
  deleteWarehouseItem,
  extractWarehouseItem,
  getCachedWarehouseInventory,
  getWarehouseInventory,
  isWarehouseAdmin,
  subscribeToWarehouseInventory,
  updateWarehouseItem,
  type Warehouse,
  type WarehouseItem,
  type WarehouseUnitType,
} from '@/services/warehouse-inventory';

export default function WarehouseScreen() {
  const [symbolsLoaded] = useFonts({ MaterialSymbols: MaterialSymbols_400Regular });
  const { isReady, user, signOut } = useAuth();
  const theme = useTheme();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [ownerAvatarUris, setOwnerAvatarUris] = useState<Record<string, string | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isItemModalVisible, setIsItemModalVisible] = useState(false);
  const [isWarehouseModalVisible, setIsWarehouseModalVisible] = useState(false);
  const [isExtractModalVisible, setIsExtractModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<WarehouseItem | null>(null);
  const [extractingItem, setExtractingItem] = useState<WarehouseItem | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemQuantity, setItemQuantity] = useState('1');
  const [itemUnitType, setItemUnitType] = useState<WarehouseUnitType>('unit');
  const [itemWarehouseId, setItemWarehouseId] = useState('');
  const [itemOwnerId, setItemOwnerId] = useState('');
  const [itemImage, setItemImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [warehouseName, setWarehouseName] = useState('');
  const [warehouseLocation, setWarehouseLocation] = useState('');
  const [extractedQuantity, setExtractedQuantity] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManageAll = Boolean(user && isWarehouseAdmin(user));

  useEffect(() => {
    if (!user) {
      return;
    }
    let mounted = true;
    let showedCache = false;
    void getCachedWarehouseInventory().then((cached) => {
      if (mounted && (cached.items.length || cached.warehouses.length)) {
        showedCache = true;
        setWarehouses(cached.warehouses);
        setItems(cached.items);
        setIsLoading(false);
      }
    });
    void Promise.all([getWarehouseInventory(), getDirectoryUsers().catch(() => [])])
      .then(([inventory, users]) => {
        if (mounted) {
          setWarehouses(inventory.warehouses);
          setItems(inventory.items);
          setDirectory(users);
        }
      })
      .catch((loadError) => {
        if (mounted && !showedCache) {
          setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el almacén.');
        }
      })
      .finally(() => mounted && setIsLoading(false));

    const unsubscribe = subscribeToWarehouseInventory(() => {
      void getWarehouseInventory().then((inventory) => {
        if (mounted) {
          setWarehouses(inventory.warehouses);
          setItems(inventory.items);
        }
      }).catch(() => {});
    }, (status) => mounted && setSyncStatus(status));

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    let mounted = true;
    const ownerIds = [...new Set(items.map((item) => item.ownerId))];
    void Promise.all(ownerIds.map(async (ownerId) => [ownerId, (await getLocalProfile(ownerId))?.avatarUri ?? null] as const))
      .then((avatars) => {
        if (mounted) {
          setOwnerAvatarUris(Object.fromEntries(avatars));
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [items]);

  if (!isReady) {
    return <ThemedView style={styles.centered}><ActivityIndicator /></ThemedView>;
  }
  if (!user) {
    return <Redirect href="/" />;
  }
  const currentUser = user;
  const ownerGroups = Array.from(
    items.reduce((groups, item) => {
      const ownerItems = groups.get(item.ownerId) ?? [];
      ownerItems.push(item);
      groups.set(item.ownerId, ownerItems);
      return groups;
    }, new Map<string, WarehouseItem[]>()),
  )
    .map(([ownerId, ownerItems]) => ({
      ownerId,
      ownerName: ownerItems[0]?.ownerName ?? 'Usuario',
      items: ownerItems.sort((first, second) => first.warehouseName.localeCompare(second.warehouseName) || first.name.localeCompare(second.name)),
    }))
    .sort((first, second) => first.ownerName.localeCompare(second.ownerName));

  function displayUserName() {
    return String(currentUser.user_metadata.full_name ?? currentUser.user_metadata.name ?? currentUser.email?.split('@')[0] ?? 'Usuario');
  }

  function openNewItem() {
    if (!warehouses.length) {
      setError('Primero crea un almacén.');
      return;
    }
    setEditingItem(null);
    setItemName('');
    setItemQuantity('1');
    setItemUnitType('unit');
    setItemWarehouseId(warehouses[0].id);
    setItemOwnerId(currentUser.id);
    setItemImage(null);
    setError(null);
    setIsItemModalVisible(true);
  }

  function openEditItem(item: WarehouseItem) {
    setEditingItem(item);
    setItemName(item.name);
    setItemQuantity(String(item.quantity));
    setItemUnitType(item.unitType);
    setItemWarehouseId(item.warehouseId);
    setItemOwnerId(item.ownerId);
    setItemImage(null);
    setError(null);
    setIsItemModalVisible(true);
  }

  async function chooseImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Necesitamos permiso para seleccionar la imagen.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) {
      setItemImage(result.assets[0]);
    }
  }

  async function saveItem() {
    const quantity = Number(itemQuantity.replace(',', '.'));
    if (!itemName.trim() || !itemWarehouseId || !itemOwnerId || !Number.isFinite(quantity) || quantity < 0) {
      setError('Completa el nombre, almacén, dueño y una cantidad válida.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const saved = editingItem
        ? await updateWarehouseItem(editingItem.id, { warehouseId: itemWarehouseId, ownerId: itemOwnerId, name: itemName, unitType: itemUnitType, quantity, image: itemImage })
        : await addWarehouseItem({ warehouseId: itemWarehouseId, ownerId: itemOwnerId, name: itemName, unitType: itemUnitType, quantity, image: itemImage });
      setItems((current) => editingItem ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
      setIsItemModalVisible(false);
      setMessage(editingItem ? 'Artículo actualizado y movimiento registrado.' : 'Artículo guardado en el almacén.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el artículo.');
    } finally {
      setIsSaving(false);
    }
  }

  async function saveWarehouse() {
    if (!warehouseName.trim()) {
      setError('Indica el nombre del almacén.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const warehouse = await addWarehouse(warehouseName, warehouseLocation);
      setWarehouses((current) => [...current, warehouse].sort((left, right) => left.name.localeCompare(right.name)));
      setWarehouseName('');
      setWarehouseLocation('');
      setIsWarehouseModalVisible(false);
      setMessage('Almacén creado.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo crear el almacén.');
    } finally {
      setIsSaving(false);
    }
  }

  async function saveExtraction() {
    if (!extractingItem) return;
    const quantity = Number(extractedQuantity.replace(',', '.'));
    setIsSaving(true);
    setError(null);
    try {
      const saved = await extractWarehouseItem(extractingItem, quantity);
      setItems((current) => current.map((item) => item.id === saved.id ? saved : item));
      setIsExtractModalVisible(false);
      setMessage(saved.status === 'extracted' ? 'Artículo extraído por completo.' : 'Extracción registrada.');
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : 'No se pudo registrar la extracción.');
    } finally {
      setIsSaving(false);
    }
  }

  function confirmDelete(item: WarehouseItem) {
    Alert.alert('Eliminar artículo', `¿Eliminar ${item.name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => void removeItem(item) },
    ]);
  }

  async function removeItem(item: WarehouseItem) {
    try {
      await deleteWarehouseItem(item.id);
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setIsItemModalVisible(false);
      setMessage('Artículo eliminado.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'No se pudo eliminar el artículo.');
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <Pressable accessibilityLabel="Abrir menú" onPress={() => setIsMenuVisible(true)} style={[styles.menuButton, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText style={styles.menuIcon}>☰</ThemedText>
          </Pressable>
          <View style={styles.titleBlock}>
            <ThemedText style={styles.title}>Almacén</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>{canManageAll ? 'Inventario de todos los usuarios.' : 'Tus artículos almacenados.'}</ThemedText>
            <View style={styles.syncIndicator}><View style={[styles.syncDot, { backgroundColor: syncStatus === 'live' ? theme.success : syncStatus === 'offline' ? theme.info : theme.primary }]} /><ThemedText themeColor="textSecondary" style={styles.syncText}>{syncStatus === 'live' ? 'Sincronizado' : syncStatus === 'offline' ? 'Sin conexión' : 'Sincronizando'}</ThemedText></View>
          </View>
          {canManageAll ? <Pressable accessibilityLabel="Crear almacén" onPress={() => { setError(null); setIsWarehouseModalVisible(true); }} style={[styles.iconButton, { borderColor: theme.backgroundSelected }]}><ThemedText style={styles.materialIcon}>{symbolsLoaded ? 'warehouse' : '+'}</ThemedText></Pressable> : null}
          <Pressable accessibilityLabel="Añadir artículo" onPress={openNewItem} style={[styles.addButton, { backgroundColor: theme.primary }]}><ThemedText style={styles.addButtonText}>+</ThemedText></Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.itemScroll}>
          {error ? <ThemedText style={[styles.feedback, { color: theme.info }]}>{error}</ThemedText> : null}
          {message ? <ThemedText style={[styles.feedback, { color: theme.success }]}>{message}</ThemedText> : null}
          {isLoading ? <View style={styles.centered}><ActivityIndicator /></View> : items.length ? <View style={styles.warehouseGroups}>{ownerGroups.map((group) => (
            <View key={group.ownerId} style={styles.warehouseGroup}>
              <View style={[styles.warehouseHeader, { borderBottomColor: theme.backgroundSelected }]}>
                <View style={styles.ownerGroupInfo}>
                  <View style={[styles.ownerGroupAvatar, { borderColor: theme.secondary }]}>
                    {ownerAvatarUris[group.ownerId] ? <Image source={{ uri: ownerAvatarUris[group.ownerId] ?? undefined }} contentFit="cover" style={styles.ownerGroupAvatarImage} /> : <ThemedText style={styles.ownerGroupAvatarInitial}>{group.ownerName.charAt(0).toUpperCase()}</ThemedText>}
                  </View>
                  <View>
                    <ThemedText style={styles.warehouseTitle}>{group.ownerName}</ThemedText>
                    <ThemedText themeColor="textSecondary" style={styles.warehouseLocation}>{group.items.length} {group.items.length === 1 ? 'artículo' : 'artículos'}</ThemedText>
                  </View>
                </View>
              </View>
              <View style={styles.itemList}>{group.items.map((item) => (
                <WarehouseItemCard key={item.id} item={item} canManageAll={canManageAll} symbolsLoaded={symbolsLoaded} onEdit={() => openEditItem(item)} onExtract={() => { setExtractingItem(item); setExtractedQuantity(''); setError(null); setIsExtractModalVisible(true); }} onDelete={() => confirmDelete(item)} />
              ))}</View>
            </View>
          ))}</View> : <ThemedText themeColor="textSecondary" style={styles.emptyState}>{warehouses.length ? 'No tienes artículos almacenados.' : 'Aún no hay almacenes disponibles.'}</ThemedText>}
        </ScrollView>
      </SafeAreaView>

      <SideMenu visible={isMenuVisible} userEmail={currentUser.email} onClose={() => setIsMenuVisible(false)} onSignOut={signOut} />

      <Modal transparent animationType="slide" visible={isItemModalVisible} onRequestClose={() => setIsItemModalVisible(false)}>
        <View style={styles.backdrop}><ThemedView type="backgroundElement" style={styles.modal}>
          <ThemedText style={styles.modalTitle}>{editingItem ? 'Editar artículo' : 'Nuevo artículo'}</ThemedText>
          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            <Pressable onPress={chooseImage} style={[styles.imagePicker, { borderColor: theme.backgroundSelected }]}>{itemImage ? <Image source={{ uri: itemImage.uri }} contentFit="cover" style={styles.imagePreview} /> : <ThemedText themeColor="textSecondary">Seleccionar imagen</ThemedText>}</Pressable>
            <TextInput value={itemName} onChangeText={setItemName} placeholder="Nombre del artículo" placeholderTextColor={theme.textSecondary} style={[styles.input, { backgroundColor: theme.background, borderColor: theme.backgroundSelected, color: theme.text }]} />
            <TextInput value={itemQuantity} onChangeText={setItemQuantity} keyboardType="decimal-pad" placeholder="Cantidad" placeholderTextColor={theme.textSecondary} style={[styles.input, { backgroundColor: theme.background, borderColor: theme.backgroundSelected, color: theme.text }]} />
            <View style={styles.unitRow}><ThemedText themeColor="textSecondary" style={styles.fieldLabel}>Unidades</ThemedText><Switch value={itemUnitType === 'pound'} onValueChange={(value) => setItemUnitType(value ? 'pound' : 'unit')} trackColor={{ false: theme.backgroundSelected, true: theme.primary }} /><ThemedText themeColor="textSecondary" style={styles.fieldLabel}>Libras</ThemedText></View>
            <ThemedText themeColor="textSecondary" style={styles.fieldLabel}>Almacén</ThemedText><View style={styles.optionGrid}>{warehouses.map((warehouse) => <Pressable key={warehouse.id} onPress={() => setItemWarehouseId(warehouse.id)} style={[styles.option, { borderColor: theme.primary }, itemWarehouseId === warehouse.id && { backgroundColor: theme.primary }]}><ThemedText style={[styles.optionText, itemWarehouseId === warehouse.id && styles.optionTextSelected]}>{warehouse.name}</ThemedText></Pressable>)}</View>
            <OwnerSelect disabled={!canManageAll} onChange={setItemOwnerId} owners={directory.length ? directory : [{ id: currentUser.id, name: displayUserName() }]} theme={theme} value={itemOwnerId} />
            {error ? <ThemedText style={[styles.modalError, { color: theme.info }]}>{error}</ThemedText> : null}
            <Pressable disabled={isSaving} onPress={saveItem} style={[styles.saveButton, { backgroundColor: theme.primary }, isSaving && styles.disabled]}>{isSaving ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.saveButtonText}>{editingItem ? 'Guardar cambios' : 'Guardar artículo'}</ThemedText>}</Pressable>
            {editingItem ? <Pressable disabled={isSaving} onPress={() => confirmDelete(editingItem)} style={styles.deleteButton}><ThemedText style={styles.deleteButtonText}>Eliminar artículo</ThemedText></Pressable> : null}
            <Pressable onPress={() => setIsItemModalVisible(false)} style={styles.cancelButton}><ThemedText themeColor="info" style={styles.cancelButtonText}>Cancelar</ThemedText></Pressable>
          </ScrollView>
        </ThemedView></View>
      </Modal>

      <Modal transparent animationType="fade" visible={isWarehouseModalVisible} onRequestClose={() => setIsWarehouseModalVisible(false)}>
        <View style={styles.backdrop}><ThemedView type="backgroundElement" style={styles.modal}>
          <ThemedText style={styles.modalTitle}>Nuevo almacén</ThemedText>
          <TextInput value={warehouseName} onChangeText={setWarehouseName} placeholder="Nombre" placeholderTextColor={theme.textSecondary} style={[styles.input, { backgroundColor: theme.background, borderColor: theme.backgroundSelected, color: theme.text }]} />
          <TextInput value={warehouseLocation} onChangeText={setWarehouseLocation} placeholder="Ubicación (opcional)" placeholderTextColor={theme.textSecondary} style={[styles.input, { backgroundColor: theme.background, borderColor: theme.backgroundSelected, color: theme.text }]} />
          <Pressable disabled={isSaving} onPress={saveWarehouse} style={[styles.saveButton, { backgroundColor: theme.primary }]}><ThemedText style={styles.saveButtonText}>Crear almacén</ThemedText></Pressable>
          <Pressable onPress={() => setIsWarehouseModalVisible(false)} style={styles.cancelButton}><ThemedText themeColor="info" style={styles.cancelButtonText}>Cancelar</ThemedText></Pressable>
        </ThemedView></View>
      </Modal>

      <Modal transparent animationType="fade" visible={isExtractModalVisible} onRequestClose={() => setIsExtractModalVisible(false)}>
        <View style={styles.backdrop}><ThemedView type="backgroundElement" style={styles.modal}>
          <ThemedText style={styles.modalTitle}>Extraer {extractingItem?.name}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.extractCopy}>Disponible: {formatQuantity(extractingItem?.quantity ?? 0)} {formatUnit(extractingItem?.unitType ?? 'unit')}</ThemedText>
          <TextInput value={extractedQuantity} onChangeText={setExtractedQuantity} keyboardType="decimal-pad" placeholder="Cantidad a extraer" placeholderTextColor={theme.textSecondary} style={[styles.input, { backgroundColor: theme.background, borderColor: theme.backgroundSelected, color: theme.text }]} />
          {error ? <ThemedText style={[styles.modalError, { color: theme.info }]}>{error}</ThemedText> : null}
          <Pressable disabled={isSaving} onPress={saveExtraction} style={[styles.saveButton, { backgroundColor: theme.primary }]}>{isSaving ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.saveButtonText}>Registrar extracción</ThemedText>}</Pressable>
          <Pressable onPress={() => setIsExtractModalVisible(false)} style={styles.cancelButton}><ThemedText themeColor="info" style={styles.cancelButtonText}>Cancelar</ThemedText></Pressable>
        </ThemedView></View>
      </Modal>
    </ThemedView>
  );
}

function WarehouseItemCard({ item, canManageAll, symbolsLoaded, onEdit, onExtract, onDelete }: { item: WarehouseItem; canManageAll: boolean; symbolsLoaded: boolean; onEdit: () => void; onExtract: () => void; onDelete: () => void }) {
  const canChange = canManageAll || item.status === 'active';
  return <ThemedView type="backgroundElement" style={[styles.itemCard, item.status === 'extracted' && styles.extractedCard]}>
    {item.imageUrl ? <ImageZoomPreview accessibilityLabel={`Ampliar imagen de ${item.name}`} sourceUri={item.imageUrl} style={styles.itemImage} /> : <View style={styles.imageFallback}><ThemedText style={styles.imageFallbackText}>{item.name[0]?.toUpperCase()}</ThemedText></View>}
    <View style={styles.itemBody}>
      <View><ThemedText numberOfLines={1} style={styles.itemName}>{item.name}</ThemedText><ThemedText themeColor="textSecondary" style={styles.itemMeta}>{item.warehouseName} · {formatQuantity(item.quantity)} {formatUnit(item.unitType)}</ThemedText><View style={styles.dateRow}><ThemedText themeColor="textSecondary" style={styles.itemDate}>Entrada: {formatDate(item.createdAt) || '—'}</ThemedText>{item.extractedAt ? <ThemedText themeColor="textSecondary" style={styles.itemDate}>Extraído: {formatDate(item.extractedAt)}</ThemedText> : null}</View></View>
      <View style={styles.cardFooter}><View style={styles.actionStack}><ThemedText style={[styles.status, item.status === 'extracted' && styles.extractedStatus]}>{item.status === 'extracted' ? `Extraído · ${formatDate(item.extractedAt)}` : 'Disponible'}</ThemedText><View style={styles.actions}>{canChange ? <Pressable accessibilityLabel="Extraer" onPress={onExtract} style={styles.actionButton}><ThemedText style={styles.materialIcon}>{symbolsLoaded ? 'remove_circle_outline' : '−'}</ThemedText></Pressable> : null}<Pressable accessibilityLabel="Editar" onPress={onEdit} style={styles.actionButton}><ThemedText style={styles.materialIcon}>{symbolsLoaded ? 'edit' : '✎'}</ThemedText></Pressable>{canManageAll ? <Pressable accessibilityLabel="Eliminar" onPress={onDelete} style={styles.actionButton}><ThemedText style={styles.materialIcon}>{symbolsLoaded ? 'delete' : '×'}</ThemedText></Pressable> : null}</View></View></View>
    </View>
  </ThemedView>;
}

function formatUnit(unitType: WarehouseUnitType) { return unitType === 'pound' ? 'lb' : 'ud'; }
function formatQuantity(quantity: number) { return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/\.00$/, ''); }
function formatDate(date: string | null) { return date ? new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short' }).format(new Date(date)) : ''; }

function OwnerSelect({ disabled, onChange, owners, theme, value }: {
  disabled: boolean;
  onChange: (ownerId: string) => void;
  owners: DirectoryUser[];
  theme: ReturnType<typeof useTheme>;
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOwner = owners.find((owner) => owner.id === value);

  return (
    <View style={styles.ownerField}>
      <ThemedText themeColor="textSecondary" style={styles.fieldLabel}>Dueño</ThemedText>
      <Pressable
        accessibilityLabel="Seleccionar dueño del artículo"
        disabled={disabled}
        onPress={() => setIsOpen((open) => !open)}
        style={[styles.ownerSelect, { backgroundColor: theme.background, borderColor: theme.backgroundSelected }, disabled && styles.disabled]}>
        <ThemedText numberOfLines={1} style={[styles.ownerValue, { color: selectedOwner ? theme.text : theme.textSecondary }]}>{selectedOwner?.name ?? 'Selecciona un dueño'}</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.ownerChevron}>{isOpen ? '⌃' : '⌄'}</ThemedText>
      </Pressable>
      {isOpen && !disabled ? <View style={[styles.ownerOptions, { backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}>{owners.map((owner) => <Pressable key={owner.id} onPress={() => { onChange(owner.id); setIsOpen(false); }} style={styles.ownerOption}><ThemedText>{owner.name}</ThemedText></Pressable>)}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#FAF9F6', flex: 1 }, safeArea: { flex: 1 }, centered: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  topBar: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three }, menuButton: { alignItems: 'center', borderRadius: Spacing.two, height: 44, justifyContent: 'center', width: 44 }, menuIcon: { fontSize: 24 }, titleBlock: { flex: 1 }, title: { fontSize: 22, fontWeight: '800' }, subtitle: { fontSize: 13, marginTop: 2 }, syncIndicator: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 3 }, syncDot: { borderRadius: 4, height: 7, width: 7 }, syncText: { fontSize: 10, fontWeight: '600' },
  iconButton: { alignItems: 'center', borderRadius: 18, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 }, addButton: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 }, addButtonText: { color: '#FFFFFF', fontSize: 24, lineHeight: 26 }, materialIcon: { fontFamily: 'MaterialSymbols', fontSize: 21, lineHeight: 24, textAlign: 'center' },
  content: { alignSelf: 'center', flexGrow: 1, maxWidth: MaxContentWidth, padding: Spacing.three, paddingBottom: Spacing.four, width: '100%' }, itemScroll: { flex: 1 }, warehouseGroups: { gap: Spacing.three }, warehouseGroup: { gap: Spacing.two }, warehouseHeader: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: Spacing.one }, ownerGroupInfo: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two }, ownerGroupAvatar: { alignItems: 'center', backgroundColor: '#FFF1F1', borderRadius: 20, borderWidth: 2, height: 40, justifyContent: 'center', overflow: 'hidden', width: 40 }, ownerGroupAvatarImage: { height: '100%', width: '100%' }, ownerGroupAvatarInitial: { color: '#4D96FF', fontSize: 14, fontWeight: '800' }, warehouseTitle: { fontSize: 17, fontWeight: '800' }, warehouseLocation: { fontSize: 12, marginTop: 2 }, itemList: { gap: Spacing.two }, emptyState: { paddingVertical: Spacing.four, textAlign: 'center' }, feedback: { fontSize: 11, marginBottom: Spacing.two, textAlign: 'center' },
  itemCard: { alignItems: 'stretch', backgroundColor: '#FFFFFF', borderColor: '#EAE6DF', borderRadius: Spacing.three, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 128, padding: Spacing.two }, extractedCard: { opacity: 0.62 }, itemImage: { borderRadius: Spacing.two, height: 112, width: 112 }, imageFallback: { alignItems: 'center', backgroundColor: '#EEF1F3', borderRadius: Spacing.two, height: 112, justifyContent: 'center', width: 112 }, imageFallbackText: { color: '#4D96FF', fontSize: 26, fontWeight: '800' }, itemBody: { alignSelf: 'stretch', flex: 1, justifyContent: 'space-between', paddingLeft: Spacing.three }, itemName: { fontSize: 16, fontWeight: '800' }, itemMeta: { fontSize: 12, marginTop: 2 }, dateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: 3 }, itemDate: { fontSize: 10 }, cardFooter: { alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end' }, actionStack: { alignItems: 'center', backgroundColor: '#FFFCF5', borderRadius: Spacing.two, flexDirection: 'row', gap: Spacing.one, paddingHorizontal: Spacing.one, paddingVertical: 2 }, status: { color: '#258D42', fontSize: 10, fontWeight: '800' }, extractedStatus: { color: '#8A5D00' }, actions: { flexDirection: 'row', gap: 2 }, actionButton: { alignItems: 'center', height: 26, justifyContent: 'center', width: 26 },
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.42)', flex: 1, justifyContent: 'center', padding: Spacing.four }, modal: { borderRadius: Spacing.four, gap: Spacing.three, maxHeight: '88%', maxWidth: 440, padding: Spacing.four, width: '100%' }, modalContent: { gap: Spacing.two }, modalTitle: { fontSize: 21, fontWeight: '800' }, imagePicker: { alignItems: 'center', borderRadius: Spacing.two, borderStyle: 'dashed', borderWidth: 1, height: 100, justifyContent: 'center', overflow: 'hidden' }, imagePreview: { height: '100%', width: '100%' }, input: { borderRadius: Spacing.two, borderWidth: 1, fontSize: 16, minHeight: 48, paddingHorizontal: Spacing.two }, unitRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one }, fieldLabel: { fontSize: 13, fontWeight: '700' }, optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one }, option: { borderRadius: 14, borderWidth: 1, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one }, optionText: { fontSize: 12, fontWeight: '700' }, optionTextSelected: { color: '#FFFFFF' }, ownerField: { gap: Spacing.one }, ownerSelect: { alignItems: 'center', borderRadius: Spacing.two, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: Spacing.two }, ownerValue: { flex: 1, fontSize: 15 }, ownerChevron: { fontSize: 18 }, ownerOptions: { borderRadius: Spacing.two, borderWidth: 1, overflow: 'hidden' }, ownerOption: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.two }, modalError: { fontSize: 13, textAlign: 'center' }, saveButton: { alignItems: 'center', borderRadius: Spacing.two, height: 48, justifyContent: 'center' }, saveButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' }, cancelButton: { alignItems: 'center', paddingVertical: Spacing.one }, cancelButtonText: { fontSize: 15, fontWeight: '800' }, deleteButton: { alignItems: 'center', paddingVertical: Spacing.one }, deleteButtonText: { color: '#C2410C', fontSize: 14, fontWeight: '800' }, disabled: { opacity: 0.45 }, extractCopy: { fontSize: 14 },
});

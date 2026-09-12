import type * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import type { User } from '@supabase/supabase-js';

import {
  getCachedWarehouseItems,
  getCachedWarehouses,
  removeCachedWarehouseItem,
  replaceCachedWarehouseInventory,
  upsertCachedWarehouse,
  upsertCachedWarehouseItem,
} from '@/services/warehouse-cache';
import { getDirectoryUsers, type DirectoryUser } from '@/services/user-directory';
import { supabase } from '@/services/supabase';
import { optimizeImageForUpload } from '@/services/image-upload';

export type WarehouseUnitType = 'unit' | 'pound';
export type WarehouseItemStatus = 'active' | 'extracted';
export type WarehouseMovementType = 'entry' | 'exit';

export type WarehouseItemMovement = {
  id: string;
  itemId: string;
  type: WarehouseMovementType;
  quantity: number;
  createdAt: string;
};

export type Warehouse = {
  id: string;
  name: string;
  location: string;
  createdBy: string;
};

export type WarehouseItem = {
  id: string;
  warehouseId: string;
  warehouseName: string;
  ownerId: string;
  ownerName: string;
  name: string;
  unitType: WarehouseUnitType;
  quantity: number;
  imagePath: string | null;
  imageUrl: string | null;
  imageUrlExpiresAt: string | null;
  status: WarehouseItemStatus;
  extractedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type WarehouseRow = {
  id: string;
  name: string;
  location: string;
  created_by: string;
};

type WarehouseItemRow = {
  id: string;
  warehouse_id: string;
  owner_id: string;
  name: string;
  unit_type: WarehouseUnitType;
  quantity: number;
  image_path: string | null;
  status: WarehouseItemStatus;
  extracted_at: string | null;
  created_at: string;
  updated_at: string;
};

type WarehouseItemMovementRow = {
  id: string;
  item_id: string;
  action: 'created' | 'quantity_changed' | 'extracted';
  quantity_before: number;
  quantity_after: number;
  extracted_quantity: number;
  created_at: string;
};

const inventoryListeners = new Set<() => void>();

export function isWarehouseAdmin(user: User): boolean {
  return user.app_metadata.role === 'admin';
}

export function getCachedWarehouseInventory(): Promise<{ warehouses: Warehouse[]; items: WarehouseItem[] }> {
  return Promise.all([getCachedWarehouses(), getCachedWarehouseItems()]).then(([warehouses, items]) => ({ warehouses, items }));
}

export async function getWarehouseInventory(): Promise<{ warehouses: Warehouse[]; items: WarehouseItem[] }> {
  const client = requireSupabase();
  const [{ data: warehouseData, error: warehouseError }, { data: itemData, error: itemError }, directory] = await Promise.all([
    client.from('warehouses').select('id, name, location, created_by').order('name'),
    client.from('warehouse_items').select('id, warehouse_id, owner_id, name, unit_type, quantity, image_path, status, extracted_at, created_at, updated_at').order('updated_at', { ascending: false }),
    getDirectoryUsers().catch(() => [] as DirectoryUser[]),
  ]);

  if (warehouseError) {
    throw new Error(warehouseError.message);
  }
  if (itemError) {
    throw new Error(itemError.message);
  }

  const warehouses = (warehouseData ?? []).map(toWarehouse);
  const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const ownerNames = new Map(directory.map((profile) => [profile.id, profile.name]));
  const cachedItems = await getCachedWarehouseItems();
  const cachedById = new Map(cachedItems.map((item) => [item.id, item]));
  const items = await Promise.all((itemData ?? []).map((item) =>
    toWarehouseItem(client, item as WarehouseItemRow, warehouseById, ownerNames, cachedById.get(item.id)),
  ));
  try {
    await replaceCachedWarehouseInventory(warehouses, items);
  } catch {}
  return { warehouses, items };
}

export async function addWarehouse(name: string, location: string): Promise<Warehouse> {
  const client = requireSupabase();
  const user = await getCurrentUser(client);
  const { data, error } = await client
    .from('warehouses')
    .insert({ name: name.trim(), location: location.trim(), created_by: user.id })
    .select('id, name, location, created_by')
    .single();
  if (error) {
    throw new Error(error.message);
  }
  const warehouse = toWarehouse(data as WarehouseRow);
  await upsertCachedWarehouse(warehouse);
  return warehouse;
}

export async function addWarehouseItem(input: {
  warehouseId: string;
  ownerId: string;
  name: string;
  unitType: WarehouseUnitType;
  quantity: number;
  image: ImagePicker.ImagePickerAsset | null;
}): Promise<WarehouseItem> {
  const client = requireSupabase();
  const user = await getCurrentUser(client);
  const imagePath = await uploadImage(client, user.id, input.image);
  const { data, error } = await client
    .from('warehouse_items')
    .insert({
      warehouse_id: input.warehouseId,
      owner_id: input.ownerId,
      name: input.name.trim(),
      unit_type: input.unitType,
      quantity: input.quantity,
      image_path: imagePath,
    })
    .select('id, warehouse_id, owner_id, name, unit_type, quantity, image_path, status, extracted_at, created_at, updated_at')
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return refreshWarehouseItem(data as WarehouseItemRow);
}

export async function updateWarehouseItem(itemId: string, input: {
  warehouseId: string;
  ownerId: string;
  name: string;
  unitType: WarehouseUnitType;
  quantity: number;
  image: ImagePicker.ImagePickerAsset | null;
}): Promise<WarehouseItem> {
  const client = requireSupabase();
  const user = await getCurrentUser(client);
  const changes: Record<string, unknown> = {
    warehouse_id: input.warehouseId,
    owner_id: input.ownerId,
    name: input.name.trim(),
    unit_type: input.unitType,
    quantity: input.quantity,
  };
  if (input.image) {
    changes.image_path = await uploadImage(client, user.id, input.image);
  }
  const { data, error } = await client
    .from('warehouse_items')
    .update(changes)
    .eq('id', itemId)
    .select('id, warehouse_id, owner_id, name, unit_type, quantity, image_path, status, extracted_at, created_at, updated_at')
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return refreshWarehouseItem(data as WarehouseItemRow);
}

export async function extractWarehouseItem(item: WarehouseItem, quantity: number): Promise<WarehouseItem> {
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > item.quantity) {
    throw new Error('Indica una cantidad válida para extraer.');
  }
  const client = requireSupabase();
  const { data, error } = await client
    .from('warehouse_items')
    .update({ quantity: item.quantity - quantity })
    .eq('id', item.id)
    .select('id, warehouse_id, owner_id, name, unit_type, quantity, image_path, status, extracted_at, created_at, updated_at')
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return refreshWarehouseItem(data as WarehouseItemRow);
}

export async function deleteWarehouseItem(itemId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('warehouse_items').delete().eq('id', itemId);
  if (error) {
    throw new Error(error.message);
  }
  await removeCachedWarehouseItem(itemId);
  notifyWarehouseInventoryChanged();
}

export async function getWarehouseItemMovements(itemId: string): Promise<WarehouseItemMovement[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('warehouse_item_movements')
    .select('id, item_id, action, quantity_before, quantity_after, extracted_quantity, created_at')
    .eq('item_id', itemId)
    .order('created_at', { ascending: true });
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as WarehouseItemMovementRow[]).map((movement) => {
    const quantityBefore = Number(movement.quantity_before);
    const quantityAfter = Number(movement.quantity_after);
    const isExit = movement.action === 'extracted' || quantityAfter < quantityBefore;
    return {
      id: movement.id,
      itemId: movement.item_id,
      type: isExit ? 'exit' : 'entry',
      quantity: isExit
        ? Number(movement.extracted_quantity) || Math.max(quantityBefore - quantityAfter, 0)
        : Math.max(quantityAfter - quantityBefore, 0),
      createdAt: movement.created_at,
    };
  });
}

export function subscribeToWarehouseInventory(onChange: () => void, onStatus: (status: 'connecting' | 'live' | 'offline') => void): () => void {
  inventoryListeners.add(onChange);
  if (!supabase) {
    onStatus('offline');
    return () => { inventoryListeners.delete(onChange); };
  }
  const client = supabase;
  onStatus('connecting');
  const channel = client
    .channel(`warehouse-inventory-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_items' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouses' }, onChange)
    .subscribe((status) => onStatus(status === 'SUBSCRIBED' ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'offline' : 'connecting'));
  return () => { inventoryListeners.delete(onChange); void client.removeChannel(channel); };
}

async function refreshWarehouseItem(row: WarehouseItemRow): Promise<WarehouseItem> {
  const inventory = await getWarehouseInventory();
  const item = inventory.items.find((candidate) => candidate.id === row.id);
  if (!item) {
    throw new Error('Supabase no confirmó el cambio del artículo.');
  }
  await upsertCachedWarehouseItem(item);
  notifyWarehouseInventoryChanged();
  return item;
}

function notifyWarehouseInventoryChanged(): void {
  inventoryListeners.forEach((listener) => listener());
}

async function uploadImage(client: NonNullable<typeof supabase>, userId: string, image: ImagePicker.ImagePickerAsset | null): Promise<string | null> {
  if (!image) {
    return null;
  }
  const optimizedImage = await optimizeImageForUpload(image);
  const path = `${userId}/${Date.now()}.${optimizedImage.extension}`;
  const content = await new File(optimizedImage.uri).arrayBuffer();
  const { error } = await client.storage.from('warehouse-images').upload(path, content, { contentType: optimizedImage.contentType });
  if (error) {
    throw new Error(error.message);
  }
  return path;
}

async function toWarehouseItem(
  client: NonNullable<typeof supabase>,
  row: WarehouseItemRow,
  warehouseById: Map<string, Warehouse>,
  ownerNames: Map<string, string>,
  cachedItem?: WarehouseItem,
): Promise<WarehouseItem> {
  const canReuseImage = Boolean(
    cachedItem?.imageUrl
    && cachedItem.imagePath === row.image_path
    && cachedItem.imageUrl.includes('/storage/v1/object/public/warehouse-images/')
  );
  const image = canReuseImage
    ? { url: cachedItem?.imageUrl ?? null, expiresAt: cachedItem?.imageUrlExpiresAt ?? null }
    : await getItemImageUrl(client, row.image_path);

  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    warehouseName: warehouseById.get(row.warehouse_id)?.name ?? 'Almacén eliminado',
    ownerId: row.owner_id,
    ownerName: ownerNames.get(row.owner_id) ?? 'Usuario',
    name: row.name,
    unitType: row.unit_type,
    quantity: Number(row.quantity),
    imagePath: row.image_path,
    imageUrl: image.url,
    imageUrlExpiresAt: image.expiresAt,
    status: row.status,
    extractedAt: row.extracted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toWarehouse(row: WarehouseRow): Warehouse {
  return { id: row.id, name: row.name, location: row.location, createdBy: row.created_by };
}

async function getItemImageUrl(
  client: NonNullable<typeof supabase>,
  imagePath: string | null,
): Promise<{ url: string | null; expiresAt: string | null }> {
  if (!imagePath) {
    return { url: null, expiresAt: null };
  }
  const { data } = client.storage.from('warehouse-images').getPublicUrl(imagePath);
  return { url: data.publicUrl || null, expiresAt: null };
}

function requireSupabase(): NonNullable<typeof supabase> {
  if (!supabase) {
    throw new Error('Configura Supabase para usar el almacén.');
  }
  return supabase;
}

async function getCurrentUser(client: NonNullable<typeof supabase>): Promise<User> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    throw new Error(error?.message ?? 'Inicia sesión para usar el almacén.');
  }
  return data.user;
}

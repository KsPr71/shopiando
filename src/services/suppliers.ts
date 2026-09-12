import type * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';

import { optimizeImageForUpload } from '@/services/image-upload';
import {
  getCachedSuppliers as readCachedSuppliers,
  removeCachedSupplier,
  replaceCachedSuppliers,
  upsertCachedSupplier,
} from '@/services/supplier-cache';
import { supabase } from '@/services/supabase';

export type Supplier = {
  id: string;
  name: string;
  address: string;
  phone: string;
  createdBy: string;
  imagePath: string | null;
  imageUrl: string | null;
  updatedAt: string;
};

type SupplierRow = {
  id: string;
  name: string;
  address: string;
  phone: string;
  created_by: string;
  image_path: string | null;
  updated_at: string;
};

export function getCachedSuppliers(): Promise<Supplier[]> {
  return readCachedSuppliers();
}

export async function getSuppliers(): Promise<Supplier[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('suppliers')
    .select('id, name, address, phone, created_by, image_path, updated_at')
    .order('name');

  if (error) throw new Error(error.message);
  const suppliers = (data as SupplierRow[]).map(mapSupplier);
  await replaceCachedSuppliers(suppliers);
  return suppliers;
}

export async function addSupplier(input: { name: string; address: string; phone: string; image?: ImagePicker.ImagePickerAsset | null }): Promise<Supplier> {
  const client = requireSupabase();
  const user = await getCurrentUser();
  const imagePath = await uploadSupplierImage(user.id, input.image ?? null);
  const { data, error } = await client
    .from('suppliers')
    .insert({ name: input.name.trim(), address: input.address.trim(), phone: input.phone.trim(), created_by: user.id, image_path: imagePath })
    .select('id, name, address, phone, created_by, image_path, updated_at')
    .single();

  if (error) throw new Error(error.code === '23505' ? 'Ya existe un proveedor con ese nombre.' : error.message);
  const supplier = mapSupplier(data as SupplierRow);
  await upsertCachedSupplier(supplier);
  return supplier;
}

export async function updateSupplier(supplierId: string, input: { name: string; address: string; phone: string; image?: ImagePicker.ImagePickerAsset | null }): Promise<Supplier> {
  const client = requireSupabase();
  const user = await getCurrentUser();
  const changes: Record<string, unknown> = { name: input.name.trim(), address: input.address.trim(), phone: input.phone.trim() };
  if (input.image) changes.image_path = await uploadSupplierImage(user.id, input.image);
  const { data, error } = await client.from('suppliers').update(changes).eq('id', supplierId)
    .select('id, name, address, phone, created_by, image_path, updated_at').single();
  if (error) throw new Error(error.code === '23505' ? 'Ya existe un proveedor con ese nombre.' : error.message);
  const supplier = mapSupplier(data as SupplierRow);
  await upsertCachedSupplier(supplier);
  return supplier;
}

export async function deleteSupplier(supplierId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('suppliers').delete().eq('id', supplierId);
  if (error) throw new Error(error.code === '23503' ? 'Este proveedor está asociado a productos y no puede eliminarse.' : error.message);
  await removeCachedSupplier(supplierId);
}

export function subscribeToSuppliers(onChange: () => void): () => void {
  if (!supabase) return () => {};
  const channel = supabase.channel(`suppliers-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, onChange)
    .subscribe();
  return () => { void supabase?.removeChannel(channel); };
}

function requireSupabase() {
  if (!supabase) throw new Error('Configura Supabase para gestionar proveedores.');
  return supabase;
}

async function getCurrentUser() {
  const { data, error } = await requireSupabase().auth.getUser();
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('Inicia sesión para gestionar proveedores.');
  return data.user;
}

async function uploadSupplierImage(userId: string, image: ImagePicker.ImagePickerAsset | null): Promise<string | null> {
  if (!image) return null;
  const optimized = await optimizeImageForUpload(image);
  const path = `${userId}/suppliers/${Date.now()}.${optimized.extension}`;
  const content = await new File(optimized.uri).arrayBuffer();
  const { error } = await requireSupabase().storage.from('product-images').upload(path, content, { contentType: optimized.contentType });
  if (error) throw new Error(`No se pudo subir la imagen del proveedor: ${error.message}`);
  return path;
}

function mapSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    createdBy: row.created_by,
    imagePath: row.image_path,
    imageUrl: row.image_path ? requireSupabase().storage.from('product-images').getPublicUrl(row.image_path).data.publicUrl : null,
    updatedAt: row.updated_at,
  };
}

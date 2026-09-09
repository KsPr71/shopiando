import type * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import type { User } from '@supabase/supabase-js';

import {
  getCachedProductCatalog,
  removeCachedProduct,
  replaceCachedProductCatalog,
  upsertCachedProduct,
} from '@/services/product-catalog-cache';
import { supabase } from '@/services/supabase';
import { notifyProductCreated } from '@/services/push-notifications';

export const PRODUCT_CATEGORIES = ['carnicos', 'vegetales', 'viandas', 'legumbres'] as const;
export type ProductCategory = string;

export type ProductCategoryOption = {
  slug: ProductCategory;
  name: string;
};

export type Product = {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  category: ProductCategory;
  priceCents: number;
  unitType: ProductUnitType;
  packageQuantity: number;
  isAvailable: boolean;
  imageUrl: string | null;
};

export type ProductUnitType = 'unit' | 'pound';

export type ProductCatalogChange = { type: 'upsert'; product: Product } | { type: 'delete'; productId: string };

const catalogListeners = new Set<(change: ProductCatalogChange) => void>();

type ProductRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  category: ProductCategory;
  price_cents: number;
  unit_type: ProductUnitType;
  package_quantity: number;
  is_available: boolean;
  image_path: string | null;
};

export async function getProductCategories(): Promise<ProductCategoryOption[]> {
  if (!supabase) {
    throw new Error('Configura Supabase para cargar las categorías.');
  }
  const { data, error } = await supabase.from('product_categories').select('slug, name').order('name');
  if (error) {
    return PRODUCT_CATEGORIES.map((slug) => ({ slug, name: formatCategoryName(slug) }));
  }
  return data as ProductCategoryOption[];
}

export async function getProducts(): Promise<Product[]> {
  if (!supabase) {
    throw new Error('Configura Supabase para cargar los productos.');
  }
  const client = supabase;

  const { data, error } = await client
    .from('products')
    .select('id, owner_id, name, description, category, price_cents, unit_type, package_quantity, is_available, image_path')
    .order('created_at', { ascending: false });
  if (error) {
    throw error;
  }

  const products = await Promise.all((data as ProductRow[]).map((product) => toProduct(client, product)));
  await replaceCachedProductCatalog(products);
  return products;
}

export function getCachedProducts(): Promise<Product[]> {
  return getCachedProductCatalog();
}

export async function addProduct(input: {
  name: string;
  description: string;
  category: ProductCategory;
  priceCents: number;
  unitType: ProductUnitType;
  packageQuantity: number;
  image: ImagePicker.ImagePickerAsset | null;
}): Promise<Product> {
  if (!supabase) {
    throw new Error('Configura Supabase para añadir productos.');
  }
  const client = supabase;

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) {
    throw userError;
  }
  if (!userData.user) {
    throw new Error('Inicia sesión para añadir productos.');
  }

  let imagePath: string | null = null;
  if (input.image) {
    const extension = input.image.mimeType?.split('/')[1] ?? 'jpg';
    imagePath = `${userData.user.id}/${Date.now()}.${extension.replace(/[^a-z0-9]/gi, '')}`;
    const image = await new File(input.image.uri).arrayBuffer();
    const { error: uploadError } = await client.storage
      .from('product-images')
      .upload(imagePath, image, { contentType: input.image.mimeType ?? 'image/jpeg' });
    if (uploadError) {
      throw uploadError;
    }
  }

  const { data, error } = await client
    .from('products')
    .insert({
      owner_id: userData.user.id,
      name: input.name.trim(),
      description: input.description.trim(),
      category: input.category,
      price_cents: input.priceCents,
      unit_type: input.unitType,
      package_quantity: input.packageQuantity,
      image_path: imagePath,
    })
    .select('id, owner_id, name, description, category, price_cents, unit_type, package_quantity, is_available, image_path')
    .single();
  if (error) {
    throw error;
  }

  const result = await toProduct(client, data as ProductRow);
  await upsertCachedProduct(result);
  notifyProductCatalogChanged({ type: 'upsert', product: result });
  void notifyProductCreated(result.id).catch((error) => {
    console.warn('No se pudo enviar la notificaci\u00f3n del nuevo producto.', error);
  });
  return result;
}

export async function updateProduct(productId: string, input: {
  name: string;
  description: string;
  category: ProductCategory;
  priceCents: number;
  unitType: ProductUnitType;
  packageQuantity: number;
}): Promise<Product> {
  if (!supabase) {
    throw new Error('Configura Supabase para editar productos.');
  }

  const { data, error } = await supabase
    .from('products')
    .update({
      name: input.name.trim(),
      description: input.description.trim(),
      category: input.category,
      price_cents: input.priceCents,
      unit_type: input.unitType,
      package_quantity: input.packageQuantity,
    })
    .eq('id', productId)
    .select('id, owner_id, name, description, category, price_cents, unit_type, package_quantity, is_available, image_path')
    .single();
  if (error) {
    throw error;
  }

  const result = await toProduct(supabase, data as ProductRow);
  await upsertCachedProduct(result);
  notifyProductCatalogChanged({ type: 'upsert', product: result });
  return result;
}

export async function deleteProduct(productId: string): Promise<void> {
  if (!supabase) {
    throw new Error('Configura Supabase para eliminar productos.');
  }

  const { error } = await supabase.from('products').delete().eq('id', productId);
  if (error) {
    throw error;
  }
  await removeCachedProduct(productId);
  notifyProductCatalogChanged({ type: 'delete', productId });
}

export function isProductAdmin(user: User): boolean {
  return user.app_metadata.role === 'admin';
}

export async function setProductAvailability(productId: string, isAvailable: boolean): Promise<void> {
  if (!supabase) {
    throw new Error('Configura Supabase para actualizar productos.');
  }

  const { data, error } = await supabase
    .from('products')
    .update({ is_available: isAvailable })
    .eq('id', productId)
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? 'Supabase no confirmó el cambio de disponibilidad.');
  }

  const cachedProduct = (await getCachedProductCatalog()).find((product) => product.id === productId);
  if (cachedProduct) {
    const product = { ...cachedProduct, isAvailable };
    await upsertCachedProduct(product);
    notifyProductCatalogChanged({ type: 'upsert', product });
  }
}

export function subscribeToLocalProductCatalogChanges(listener: (change: ProductCatalogChange) => void): () => void {
  catalogListeners.add(listener);
  return () => { catalogListeners.delete(listener); };
}

export function subscribeToProductCatalog(
  onChange: (change: ProductCatalogChange) => void,
  onStatus: (status: 'connecting' | 'live' | 'offline') => void,
): () => void {
  if (!supabase) {
    onStatus('offline');
    return () => {};
  }

  const client = supabase;
  onStatus('connecting');
  const channel = client
    .channel(`product-catalog-sync-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, async (payload) => {
      const change = payload as { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: { id?: string }; old: { id?: string } };
      const productId = String(change.eventType === 'DELETE' ? change.old.id : change.new.id);
      if (!productId || productId === 'undefined') {
        return;
      }

      if (change.eventType === 'DELETE') {
        await removeCachedProduct(productId);
        onChange({ type: 'delete', productId });
        return;
      }

      const { data, error } = await client
        .from('products')
        .select('id, owner_id, name, description, category, price_cents, unit_type, package_quantity, is_available, image_path')
        .eq('id', productId)
        .single();
      if (error || !data) {
        return;
      }

      const product = await toProduct(client, data as ProductRow);
      await upsertCachedProduct(product);
      onChange({ type: 'upsert', product });
    })
    .subscribe((status) => {
      onStatus(status === 'SUBSCRIBED' ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'offline' : 'connecting');
    });

  return () => {
    void client.removeChannel(channel);
  };
}

function notifyProductCatalogChanged(change: ProductCatalogChange): void {
  catalogListeners.forEach((listener) => listener(change));
}

export async function quoteProductOrder(items: Array<{ productId: string; quantity: number }>) {
  if (!supabase) {
    throw new Error('Configura Supabase para calcular el pedido.');
  }

  const { data, error } = await supabase.rpc('quote_product_order', {
    order_items: items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
  });
  if (error) {
    throw error;
  }

  return (data ?? []) as Array<{ product_id: string; line_total_cents: number; unit_price_cents: number }>;
}

function formatCategoryName(category: string) {
  return category === 'carnicos' ? 'Cárnicos' : category.charAt(0).toUpperCase() + category.slice(1);
}

async function getProductImageUrl(client: NonNullable<typeof supabase>, imagePath: string | null): Promise<string | null> {
  if (!imagePath) {
    return null;
  }

  const { data, error } = await client.storage.from('product-images').createSignedUrl(imagePath, 60 * 60 * 12);
  if (!error && data?.signedUrl) {
    return data.signedUrl;
  }

  return client.storage.from('product-images').getPublicUrl(imagePath).data.publicUrl;
}

async function toProduct(client: NonNullable<typeof supabase>, product: ProductRow): Promise<Product> {
  return {
    id: product.id,
    ownerId: product.owner_id,
    name: product.name,
    description: product.description,
    category: product.category,
    priceCents: product.price_cents,
    unitType: product.unit_type,
    packageQuantity: Number(product.package_quantity),
    isAvailable: product.is_available,
    imageUrl: await getProductImageUrl(client, product.image_path),
  };
}

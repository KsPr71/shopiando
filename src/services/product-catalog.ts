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
import { optimizeImageForUpload } from '@/services/image-upload';

export type ProductCategory = string;

export type ProductCategoryOption = {
  slug: ProductCategory;
  name: string;
  icon: string;
};

export const PRODUCT_CATEGORY_OPTIONS: ProductCategoryOption[] = [
  { slug: 'carnicos', name: 'Cárnicos', icon: 'restaurant' },
  { slug: 'vegetales', name: 'Vegetales', icon: 'eco' },
  { slug: 'viandas', name: 'Viandas', icon: 'nutrition' },
  { slug: 'legumbres', name: 'Legumbres', icon: 'grain' },
  { slug: 'limpieza', name: 'Limpieza', icon: 'cleaning_services' },
  { slug: 'ferreteria', name: 'Ferretería', icon: 'handyman' },
  { slug: 'helados_y_dulces', name: 'Helados y dulces', icon: 'icecream' },
  { slug: 'pizzas', name: 'Pizzas', icon: 'local_pizza' },
  { slug: 'bebidas', name: 'Bebidas', icon: 'local_drink' },
  { slug: 'lacteos_y_huevos', name: 'Lácteos y huevos', icon: 'egg_alt' },
  { slug: 'panaderia', name: 'Panadería', icon: 'bakery_dining' },
  { slug: 'condimentos', name: 'Condimentos', icon: 'grocery' },
  { slug: 'mascotas', name: 'Mascotas', icon: 'pets' },
];

export const PRODUCT_CATEGORIES = PRODUCT_CATEGORY_OPTIONS.map((category) => category.slug);

export type Product = {
  id: string;
  ownerId: string;
  supplierId: string | null;
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
  supplier_id: string | null;
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
  const { data, error } = await supabase.from('product_categories').select('slug, name, icon').order('name');
  if (error) {
    return PRODUCT_CATEGORY_OPTIONS;
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
    .select('id, owner_id, supplier_id, name, description, category, price_cents, unit_type, package_quantity, is_available, image_path')
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
  supplierId: string;
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

  const imagePath = await uploadProductImage(client, userData.user.id, input.image);

  const { data, error } = await client
    .from('products')
    .insert({
      owner_id: userData.user.id,
      supplier_id: input.supplierId,
      name: input.name.trim(),
      description: input.description.trim(),
      category: input.category,
      price_cents: input.priceCents,
      unit_type: input.unitType,
      package_quantity: input.packageQuantity,
      image_path: imagePath,
    })
    .select('id, owner_id, supplier_id, name, description, category, price_cents, unit_type, package_quantity, is_available, image_path')
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
  supplierId: string;
  image: ImagePicker.ImagePickerAsset | null;
}): Promise<Product> {
  if (!supabase) {
    throw new Error('Configura Supabase para editar productos.');
  }

  const client = supabase;
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    throw new Error('Inicia sesión para editar productos.');
  }

  const imagePath = await uploadProductImage(client, userData.user.id, input.image);
  const changes: Record<string, unknown> = {
    name: input.name.trim(),
    description: input.description.trim(),
    category: input.category,
    price_cents: input.priceCents,
    unit_type: input.unitType,
    package_quantity: input.packageQuantity,
    supplier_id: input.supplierId,
  };
  if (imagePath) {
    changes.image_path = imagePath;
  }

  const { data, error } = await client
    .from('products')
    .update(changes)
    .eq('id', productId)
    .select('id, owner_id, supplier_id, name, description, category, price_cents, unit_type, package_quantity, is_available, image_path')
    .single();
  if (error) {
    throw error;
  }

  const result = await toProduct(client, data as ProductRow);
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
        .select('id, owner_id, supplier_id, name, description, category, price_cents, unit_type, package_quantity, is_available, image_path')
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

  return client.storage.from('product-images').getPublicUrl(imagePath).data.publicUrl;
}

async function uploadProductImage(
  client: NonNullable<typeof supabase>,
  userId: string,
  image: ImagePicker.ImagePickerAsset | null,
): Promise<string | null> {
  if (!image) {
    return null;
  }

  try {
    const optimizedImage = await optimizeImageForUpload(image);
    const imagePath = `${userId}/${Date.now()}.${optimizedImage.extension}`;
    const content = await new File(optimizedImage.uri).arrayBuffer();
    const { error } = await client.storage
      .from('product-images')
      .upload(imagePath, content, { contentType: optimizedImage.contentType });
    if (error) {
      throw error;
    }
    return imagePath;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Error desconocido';
    throw new Error(`No se pudo subir la imagen del producto: ${detail}`);
  }
}

async function toProduct(client: NonNullable<typeof supabase>, product: ProductRow): Promise<Product> {
  return {
    id: product.id,
    ownerId: product.owner_id,
    supplierId: product.supplier_id,
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

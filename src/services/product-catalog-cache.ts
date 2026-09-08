import type { Product } from '@/services/product-catalog';

/** No-op cache outside Android. Android resolves product-catalog-cache.android.ts. */
export const supportsProductCatalogCache = false;

export async function getCachedProductCatalog(): Promise<Product[]> {
  return [];
}

export async function replaceCachedProductCatalog(_products: Product[]): Promise<void> {}

export async function upsertCachedProduct(_product: Product): Promise<void> {}

export async function removeCachedProduct(_productId: string): Promise<void> {}

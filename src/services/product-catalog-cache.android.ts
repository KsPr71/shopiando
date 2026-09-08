import { getDatabase } from '@/database/database';
import type { Product } from '@/services/product-catalog';

type CachedProductRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  unit_type: Product['unitType'];
  package_quantity: number;
  is_available: number;
  image_url: string | null;
};

export const supportsProductCatalogCache = true;

let operationQueue: Promise<void> = Promise.resolve();

export async function getCachedProductCatalog(): Promise<Product[]> {
  return enqueue(async () => {
    try {
      const database = await getDatabase();
      const rows = await database.getAllAsync<CachedProductRow>(`
        SELECT id, owner_id, name, description, category, price_cents, unit_type,
               package_quantity, is_available, image_url
        FROM product_catalog_cache
        ORDER BY synced_at DESC
      `);
      return rows.map(toProduct);
    } catch {
      return [];
    }
  });
}

export async function replaceCachedProductCatalog(products: Product[]): Promise<void> {
  await enqueue(async () => {
    try {
      const database = await getDatabase();
      await database.withTransactionAsync(async () => {
        await database.runAsync('DELETE FROM product_catalog_cache');
        for (const product of products) {
          await writeProduct(database, product);
        }
      });
    } catch {}
  });
}

export async function upsertCachedProduct(product: Product): Promise<void> {
  await enqueue(async () => {
    try {
      await writeProduct(await getDatabase(), product);
    } catch {}
  });
}

export async function removeCachedProduct(productId: string): Promise<void> {
  await enqueue(async () => {
    try {
      const database = await getDatabase();
      await database.runAsync('DELETE FROM product_catalog_cache WHERE id = ?', productId);
    } catch {}
  });
}

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const nextOperation = operationQueue.then(operation, operation);
  operationQueue = nextOperation.then(() => undefined, () => undefined);
  return nextOperation;
}

async function writeProduct(database: Awaited<ReturnType<typeof getDatabase>>, product: Product): Promise<void> {
  await database.runAsync(
    `INSERT OR REPLACE INTO product_catalog_cache (
      id, owner_id, name, description, category, price_cents, unit_type,
      package_quantity, is_available, image_url, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    product.id,
    product.ownerId,
    product.name,
    product.description,
    product.category,
    product.priceCents,
    product.unitType,
    product.packageQuantity,
    product.isAvailable ? 1 : 0,
    product.imageUrl,
    new Date().toISOString(),
  );
}

function toProduct(row: CachedProductRow): Product {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description,
    category: row.category,
    priceCents: row.price_cents,
    unitType: row.unit_type,
    packageQuantity: Number(row.package_quantity),
    isAvailable: Boolean(row.is_available),
    imageUrl: row.image_url,
  };
}

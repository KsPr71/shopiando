import { getDatabase } from '@/database/database';
import type { Supplier } from '@/services/suppliers';

type SupplierCacheRow = {
  id: string;
  name: string;
  address: string;
  phone: string;
  created_by: string;
  image_path: string | null;
  image_url: string | null;
  updated_at: string;
};

let operationQueue: Promise<void> = Promise.resolve();

export function getCachedSuppliers(): Promise<Supplier[]> {
  return enqueue(async () => {
    try {
      const database = await getDatabase();
      const rows = await database.getAllAsync<SupplierCacheRow>('SELECT id, name, address, phone, created_by, image_path, image_url, updated_at FROM supplier_cache ORDER BY name');
      return rows.map(mapSupplier);
    } catch {
      return [];
    }
  });
}

export function replaceCachedSuppliers(suppliers: Supplier[]): Promise<void> {
  return enqueue(async () => {
    try {
      const database = await getDatabase();
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync('DELETE FROM supplier_cache');
        for (const supplier of suppliers) {
          await writeSupplier(transaction, supplier);
        }
      });
    } catch {}
  });
}

export function upsertCachedSupplier(supplier: Supplier): Promise<void> {
  return enqueue(async () => {
    try { await writeSupplier(await getDatabase(), supplier); } catch {}
  });
}

export function removeCachedSupplier(supplierId: string): Promise<void> {
  return enqueue(async () => {
    try { await (await getDatabase()).runAsync('DELETE FROM supplier_cache WHERE id = ?', supplierId); } catch {}
  });
}

function enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
  const next = operationQueue.then(operation, operation);
  operationQueue = next.then(() => undefined, () => undefined);
  return next;
}

async function writeSupplier(database: Awaited<ReturnType<typeof getDatabase>>, supplier: Supplier): Promise<void> {
  await database.runAsync(
    `INSERT OR REPLACE INTO supplier_cache (id, name, address, phone, created_by, image_path, image_url, updated_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    supplier.id, supplier.name, supplier.address, supplier.phone, supplier.createdBy,
    supplier.imagePath, supplier.imageUrl, supplier.updatedAt, new Date().toISOString(),
  );
}

function mapSupplier(row: SupplierCacheRow): Supplier {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    createdBy: row.created_by,
    imagePath: row.image_path,
    imageUrl: row.image_url,
    updatedAt: row.updated_at,
  };
}

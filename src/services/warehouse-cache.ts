import type { Warehouse, WarehouseItem } from '@/services/warehouse-inventory';

/** No-op cache outside Android. Android resolves warehouse-cache.android.ts. */
export async function getCachedWarehouses(): Promise<Warehouse[]> {
  return [];
}

export async function getCachedWarehouseItems(): Promise<WarehouseItem[]> {
  return [];
}

export async function replaceCachedWarehouseInventory(_warehouses: Warehouse[], _items: WarehouseItem[]): Promise<void> {}

export async function upsertCachedWarehouse(_warehouse: Warehouse): Promise<void> {}

export async function upsertCachedWarehouseItem(_item: WarehouseItem): Promise<void> {}

export async function removeCachedWarehouseItem(_itemId: string): Promise<void> {}

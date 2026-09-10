import { getDatabase } from '@/database/database';
import type { Warehouse, WarehouseItem } from '@/services/warehouse-inventory';

type WarehouseRow = {
  id: string;
  name: string;
  location: string;
  created_by: string;
};

type WarehouseItemRow = {
  id: string;
  warehouse_id: string;
  warehouse_name: string;
  owner_id: string;
  owner_name: string;
  name: string;
  unit_type: WarehouseItem['unitType'];
  quantity: number;
  image_path: string | null;
  image_url: string | null;
  image_url_expires_at: string | null;
  status: WarehouseItem['status'];
  extracted_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getCachedWarehouses(): Promise<Warehouse[]> {
  try {
    const database = await getDatabase();
    const rows = await database.getAllAsync<WarehouseRow>(
      'SELECT id, name, location, created_by FROM warehouse_cache ORDER BY name',
    );
    return rows.map((row) => ({ id: row.id, name: row.name, location: row.location, createdBy: row.created_by }));
  } catch {
    return [];
  }
}

export async function getCachedWarehouseItems(): Promise<WarehouseItem[]> {
  try {
    const database = await getDatabase();
    const rows = await database.getAllAsync<WarehouseItemRow>(`
      SELECT id, warehouse_id, warehouse_name, owner_id, owner_name, name, unit_type,
             quantity, image_path, image_url, image_url_expires_at, status, extracted_at, created_at, updated_at
      FROM warehouse_item_cache
      ORDER BY updated_at DESC
    `);
    return rows.map(toWarehouseItem);
  } catch {
    return [];
  }
}

export async function replaceCachedWarehouseInventory(warehouses: Warehouse[], items: WarehouseItem[]): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await database.runAsync('DELETE FROM warehouse_cache');
    await database.runAsync('DELETE FROM warehouse_item_cache');
    for (const warehouse of warehouses) {
      await writeWarehouse(database, warehouse);
    }
    for (const item of items) {
      await writeWarehouseItem(database, item);
    }
  });
}

export async function upsertCachedWarehouse(warehouse: Warehouse): Promise<void> {
  await writeWarehouse(await getDatabase(), warehouse);
}

export async function upsertCachedWarehouseItem(item: WarehouseItem): Promise<void> {
  await writeWarehouseItem(await getDatabase(), item);
}

export async function removeCachedWarehouseItem(itemId: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM warehouse_item_cache WHERE id = ?', itemId);
}

async function writeWarehouse(database: Awaited<ReturnType<typeof getDatabase>>, warehouse: Warehouse): Promise<void> {
  await database.runAsync(
    `INSERT OR REPLACE INTO warehouse_cache (id, name, location, created_by, synced_at)
     VALUES (?, ?, ?, ?, ?)`,
    warehouse.id,
    warehouse.name,
    warehouse.location,
    warehouse.createdBy,
    new Date().toISOString(),
  );
}

async function writeWarehouseItem(database: Awaited<ReturnType<typeof getDatabase>>, item: WarehouseItem): Promise<void> {
  await database.runAsync(
    `INSERT OR REPLACE INTO warehouse_item_cache (
      id, warehouse_id, warehouse_name, owner_id, owner_name, name, unit_type,
      quantity, image_path, image_url, image_url_expires_at, status, extracted_at, created_at, updated_at, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    item.id,
    item.warehouseId,
    item.warehouseName,
    item.ownerId,
    item.ownerName,
    item.name,
    item.unitType,
    item.quantity,
    item.imagePath,
    item.imageUrl,
    item.imageUrlExpiresAt,
    item.status,
    item.extractedAt,
    item.createdAt,
    item.updatedAt,
    new Date().toISOString(),
  );
}

function toWarehouseItem(row: WarehouseItemRow): WarehouseItem {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    name: row.name,
    unitType: row.unit_type,
    quantity: Number(row.quantity),
    imagePath: row.image_path,
    imageUrl: row.image_url,
    imageUrlExpiresAt: row.image_url_expires_at,
    status: row.status,
    extractedAt: row.extracted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

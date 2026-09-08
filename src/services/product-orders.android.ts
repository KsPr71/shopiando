import { getDatabase } from '@/database/database';
import { createOrderNotifications } from '@/services/order-notifications';
import { notifyPurchaseSummaryChanged } from '@/services/purchase-summary';
import { syncPurchaseOrderToSupabase } from '@/services/purchase-order-sync';
import { getDirectoryUsers } from '@/services/user-directory';

export type Product = {
  id: string;
  name: string;
  category: string;
  unit: string;
  priceCents: number;
  imageUri: string | null;
};

export type OrderAssignee = {
  id: string;
  name: string;
  role: 'admin' | 'member';
};

export type OrderLine = Pick<Product, 'id' | 'name' | 'unit' | 'priceCents'> & {
  quantity: number;
  lineTotalCents?: number;
};

export type CreatePurchaseOrderResult = {
  synced: boolean;
  syncError?: string;
};

type ProductRow = {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  reference_price_cents: number;
  image_uri: string | null;
};

type AssigneeRow = {
  id: string;
  name: string;
  role: 'admin' | 'member';
};

const DEFAULT_PRODUCTS = [
  { id: 'rice', name: 'Arroz', category: 'Despensa', unit: 'paquete', priceCents: 220, imageUri: 'https://images.unsplash.com/photo-1586208958839-06c17cacdf08?auto=format&fit=crop&w=400&q=80' },
  { id: 'milk', name: 'Leche', category: 'Lácteos', unit: 'litro', priceCents: 160, imageUri: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=400&q=80' },
  { id: 'eggs', name: 'Huevos', category: 'Huevos', unit: 'docena', priceCents: 320, imageUri: 'https://images.unsplash.com/photo-1498654077810-12c21d9a2e53?auto=format&fit=crop&w=400&q=80' },
  { id: 'tomatoes', name: 'Tomates', category: 'Vegetales', unit: 'libra', priceCents: 85, imageUri: 'https://images.unsplash.com/photo-1546470427-e26264be0b0d?auto=format&fit=crop&w=400&q=80' },
  { id: 'chicken', name: 'Pollo', category: 'Carnes', unit: 'libra', priceCents: 290, imageUri: 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&w=400&q=80' },
  { id: 'coffee', name: 'Café', category: 'Bebidas', unit: 'paquete', priceCents: 540, imageUri: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=400&q=80' },
];

export async function loadProductCatalog(
  userId: string,
  email: string | undefined,
  displayName: string
): Promise<{ products: Product[]; assignees: OrderAssignee[] }> {
  const familyId = await ensurePersonalFamily(userId, email, displayName);
  const database = await getDatabase();
  const [productRows, assigneeRows, directoryUsers] = await Promise.all([
    database.getAllAsync<ProductRow>(
      `SELECT id, name, category, unit, reference_price_cents, image_uri
       FROM products
       WHERE family_id = ? AND is_active = 1
       ORDER BY name`,
      familyId
    ),
    database.getAllAsync<AssigneeRow>(
      `SELECT profiles.id, profiles.display_name AS name, family_members.role
       FROM family_members
       JOIN profiles ON profiles.id = family_members.user_id
       WHERE family_members.family_id = ?
       ORDER BY CASE family_members.role WHEN 'admin' THEN 0 ELSE 1 END, profiles.display_name`,
      familyId
    ),
    getDirectoryUsers().catch(() => []),
  ]);

  return {
    products: productRows.map((product) => ({
      id: product.id,
      name: product.name,
      category: product.category ?? 'Otros',
      unit: product.unit,
      priceCents: product.reference_price_cents,
      imageUri: product.image_uri,
    })),
    assignees: directoryUsers.length
      ? directoryUsers.map((directoryUser) => ({ id: directoryUser.id, name: directoryUser.name, role: directoryUser.id === userId ? 'admin' : 'member' }))
      : assigneeRows,
  };
}

export async function createPurchaseOrder(
  userId: string,
  email: string | undefined,
  displayName: string,
  assigneeId: string,
  lines: OrderLine[]
): Promise<CreatePurchaseOrderResult> {
  if (!lines.length) {
    throw new Error('Añade al menos un producto al pedido.');
  }

  const familyId = await ensurePersonalFamily(userId, email, displayName);
  const database = await getDatabase();
  const orderId = createId('order');
  const now = new Date().toISOString();
  const totalCents = lines.reduce((total, line) => total + (line.lineTotalCents ?? Math.round(line.priceCents * line.quantity)), 0);

  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `INSERT INTO purchase_requests (
        id, family_id, requester_id, assignee_id, status, notes,
        budget_total_cents, invoiced_total_cents, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'pending', NULL, ?, 0, ?, ?)`,
      orderId,
      familyId,
      userId,
      assigneeId,
      totalCents,
      now,
      now
    );

    for (const line of lines) {
      await database.runAsync(
        `INSERT INTO purchase_request_items (
          id, request_id, product_id, product_name, unit, quantity,
          estimated_unit_price_cents, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        createId('item'),
        orderId,
        null,
        line.name,
        line.unit,
        line.quantity,
        Math.round((line.lineTotalCents ?? line.priceCents * line.quantity) / line.quantity),
        now,
        now
      );
    }
  });
  await createOrderNotifications(orderId, userId, assigneeId, displayName);
  notifyPurchaseSummaryChanged();
  try {
    await syncPurchaseOrderToSupabase(orderId);
    return { synced: true };
  } catch (error) {
    return {
      synced: false,
      syncError: error instanceof Error ? error.message : 'No se pudo conectar con Supabase.',
    };
  }
}

async function ensurePersonalFamily(userId: string, email: string | undefined, displayName: string): Promise<string> {
  const database = await getDatabase();
  const familyId = `family-${userId}`;
  const now = new Date().toISOString();

  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `INSERT INTO profiles (id, display_name, email, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, email = excluded.email, updated_at = excluded.updated_at`,
      userId,
      displayName,
      email ?? null,
      now,
      now
    );
    await database.runAsync(
      `INSERT INTO families (id, name, created_at, updated_at)
       VALUES (?, 'Mi pedido', ?, ?)
       ON CONFLICT(id) DO NOTHING`,
      familyId,
      now,
      now
    );
    await database.runAsync(
      `INSERT INTO family_members (id, family_id, user_id, role, created_at, updated_at)
       VALUES (?, ?, ?, 'admin', ?, ?)
       ON CONFLICT(family_id, user_id) DO NOTHING`,
      `member-${userId}`,
      familyId,
      userId,
      now,
      now
    );

    for (const product of DEFAULT_PRODUCTS) {
      await database.runAsync(
        `INSERT INTO products (
          id, family_id, name, category, unit, reference_price_cents,
          image_uri, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(id) DO NOTHING`,
        `${familyId}-${product.id}`,
        familyId,
        product.name,
        product.category,
        product.unit,
        product.priceCents,
        product.imageUri,
        now,
        now
      );
    }
  });

  return familyId;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

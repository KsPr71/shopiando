import { getDatabase } from '@/database/database';
import { syncOrderNotificationsToSupabase } from '@/services/order-notifications';
import { notifyPurchaseSummaryChanged } from '@/services/purchase-summary';
import { supabase } from '@/services/supabase';

type OrderRow = {
  id: string;
  requester_id: string;
  assignee_id: string | null;
  status: string;
  budget_total_cents: number;
  invoiced_total_cents: number;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  id: string;
  request_id: string;
  product_name: string;
  unit: string;
  quantity: number;
  estimated_unit_price_cents: number;
  actual_unit_price_cents: number | null;
  status: string;
  purchased_at: string | null;
  created_at: string;
  updated_at: string;
};

type RemoteOrder = {
  id: string;
  requester_id: string;
  assignee_id: string | null;
  status: string;
  budget_total_cents: number;
  invoiced_total_cents: number;
  created_at: string;
  updated_at: string;
};

type RemoteItem = {
  id: string;
  order_id: string;
  product_name: string;
  unit: string;
  quantity: number;
  estimated_unit_price_cents: number;
  actual_unit_price_cents: number | null;
  status: string;
  purchased_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function syncPurchaseOrderToSupabase(orderId: string): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase no está configurado en esta compilación.');
  }

  const database = await getDatabase();
  const order = await database.getFirstAsync<OrderRow>(
    `SELECT id, requester_id, assignee_id, status, budget_total_cents,
            invoiced_total_cents, created_at, updated_at
     FROM purchase_requests WHERE id = ?`,
    orderId,
  );
  if (!order) {
    return;
  }
  const items = await database.getAllAsync<ItemRow>(
    `SELECT id, request_id, product_name, unit, quantity,
            estimated_unit_price_cents, actual_unit_price_cents, status,
            purchased_at, created_at, updated_at
     FROM purchase_request_items WHERE request_id = ?`,
    orderId,
  );

  const { data: savedOrder, error: orderError } = await supabase
    .from('purchase_orders')
    .upsert({
      id: order.id,
      requester_id: order.requester_id,
      assignee_id: order.assignee_id,
      status: order.status,
      budget_total_cents: order.budget_total_cents,
      invoiced_total_cents: order.invoiced_total_cents,
      created_at: order.created_at,
      updated_at: order.updated_at,
    })
    .select('id')
    .single();
  if (orderError || !savedOrder?.id) {
    throw new Error(orderError?.message ?? 'Supabase no confirmÃ³ la creaciÃ³n del pedido.');
  }

  const { data: savedItems, error: itemsError } = await supabase
    .from('purchase_order_items')
    .upsert(items.map((item) => ({
      id: item.id,
      order_id: item.request_id,
      product_name: item.product_name,
      unit: item.unit,
      quantity: item.quantity,
      estimated_unit_price_cents: item.estimated_unit_price_cents,
      actual_unit_price_cents: item.actual_unit_price_cents,
      status: item.status,
      purchased_at: item.purchased_at,
      created_at: item.created_at,
      updated_at: item.updated_at,
    })))
    .select('id');
  if (itemsError) {
    throw new Error(itemsError.message);
  }
  if (savedItems.length !== items.length) {
    throw new Error('Supabase no confirmÃ³ todos los productos del pedido.');
  }
  const { data: userData } = await supabase.auth.getUser();
  if (userData.user?.id === order.requester_id) {
    await syncOrderNotificationsToSupabase(orderId);
  }
}

export async function syncPurchaseOrdersToSupabase(): Promise<void> {
  if (!supabase) {
    return;
  }
  const database = await getDatabase();
  const orders = await database.getAllAsync<{ id: string }>('SELECT id FROM purchase_requests');
  for (const order of orders) {
    try {
      await syncPurchaseOrderToSupabase(order.id);
    } catch {}
  }
}

export async function syncPurchaseOrdersFromSupabase(userId: string): Promise<void> {
  if (!supabase) {
    return;
  }
  const { data: remoteOrders, error: ordersError } = await supabase
    .from('purchase_orders')
    .select('id, requester_id, assignee_id, status, budget_total_cents, invoiced_total_cents, created_at, updated_at')
    .or(`requester_id.eq.${userId},assignee_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (ordersError) {
    throw new Error(ordersError.message);
  }
  const orders = (remoteOrders ?? []) as RemoteOrder[];
  if (!orders.length) {
    return;
  }
  const { data: remoteItems, error: itemsError } = await supabase
    .from('purchase_order_items')
    .select('id, order_id, product_name, unit, quantity, estimated_unit_price_cents, actual_unit_price_cents, status, purchased_at, created_at, updated_at')
    .in('order_id', orders.map((order) => order.id));
  if (itemsError) {
    throw new Error(itemsError.message);
  }

  const database = await getDatabase();
  const now = new Date().toISOString();
  const itemsByOrder = new Map<string, RemoteItem[]>();
  for (const item of (remoteItems ?? []) as RemoteItem[]) {
    itemsByOrder.set(item.order_id, [...(itemsByOrder.get(item.order_id) ?? []), item]);
  }
  await database.withTransactionAsync(async () => {
    for (const order of orders) {
      const familyId = `family-${order.requester_id}`;
      await database.runAsync(
        `INSERT INTO families (id, name, created_at, updated_at) VALUES (?, 'Pedidos sincronizados', ?, ?)
         ON CONFLICT(id) DO NOTHING`,
        familyId, now, now,
      );
      for (const profileId of [order.requester_id, order.assignee_id].filter((id): id is string => Boolean(id))) {
        await database.runAsync(
          `INSERT INTO profiles (id, display_name, email, created_at, updated_at) VALUES (?, 'Usuario', NULL, ?, ?)
           ON CONFLICT(id) DO NOTHING`,
          profileId, now, now,
        );
      }
      await database.runAsync(
        `INSERT INTO purchase_requests (
          id, family_id, requester_id, assignee_id, status, notes, budget_total_cents,
          invoiced_total_cents, created_at, updated_at, delivered_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL)
        ON CONFLICT(id) DO UPDATE SET
          assignee_id = excluded.assignee_id, status = excluded.status,
          budget_total_cents = excluded.budget_total_cents,
          invoiced_total_cents = excluded.invoiced_total_cents, updated_at = excluded.updated_at`,
        order.id, familyId, order.requester_id, order.assignee_id, order.status,
        order.budget_total_cents, order.invoiced_total_cents, order.created_at, order.updated_at,
      );
      for (const item of itemsByOrder.get(order.id) ?? []) {
        await database.runAsync(
          `INSERT INTO purchase_request_items (
            id, request_id, product_id, product_name, unit, quantity, estimated_unit_price_cents,
            actual_unit_price_cents, status, purchased_at, delivered_at, created_at, updated_at
          ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            product_name = excluded.product_name, unit = excluded.unit, quantity = excluded.quantity,
            estimated_unit_price_cents = excluded.estimated_unit_price_cents,
            actual_unit_price_cents = excluded.actual_unit_price_cents, status = excluded.status,
            purchased_at = excluded.purchased_at, updated_at = excluded.updated_at`,
          item.id, item.order_id, item.product_name, item.unit, item.quantity,
          item.estimated_unit_price_cents, item.actual_unit_price_cents, item.status,
          item.purchased_at, item.created_at, item.updated_at,
        );
      }
    }
  });
  notifyPurchaseSummaryChanged();
}

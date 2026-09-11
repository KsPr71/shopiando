import { getDatabase } from '@/database/database';
import { createOrderCompletionNotification, syncOrderNotificationsToSupabase } from '@/services/order-notifications';
import { notifyPurchaseOrderCompleted } from '@/services/push-notifications';
import { notifyPurchaseSummaryChanged } from '@/services/purchase-summary';
import { supabase } from '@/services/supabase';
import { getDirectoryUsers } from '@/services/user-directory';

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
  supplier_name: string;
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
  supplier_name: string;
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

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error(userError?.message ?? 'Inicia sesión para sincronizar el pedido.');
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
  const pendingSync = await database.getFirstAsync<{ order_id: string }>(
    'SELECT order_id FROM purchase_order_sync_state WHERE order_id = ?',
    orderId,
  );
  if (!pendingSync) {
    return;
  }
  const items = await database.getAllAsync<ItemRow>(
    `SELECT id, request_id, product_name, supplier_name, unit, quantity,
            estimated_unit_price_cents, actual_unit_price_cents, status,
            purchased_at, created_at, updated_at
     FROM purchase_request_items WHERE request_id = ?`,
    orderId,
  );

  if (userData.user.id !== order.requester_id) {
    await updateExistingPurchaseOrder(order, items);
    await database.runAsync('DELETE FROM purchase_order_sync_state WHERE order_id = ?', orderId);
    await syncOrderNotificationsToSupabase(orderId).catch((error) => {
      console.warn('No se pudo sincronizar la notificación del pedido.', error);
    });
    if (order.status === 'delivered') {
      try {
        await notifyPurchaseOrderCompleted(orderId);
        console.info('[Notificaciones] Solicitud de pedido completado enviada.', { orderId });
      } catch (error) {
        console.warn('No se pudo enviar la notificación de pedido completado.', error);
      }
    }
    return;
  }

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
      supplier_name: item.supplier_name,
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
  await database.runAsync('DELETE FROM purchase_order_sync_state WHERE order_id = ?', orderId);
  await syncOrderNotificationsToSupabase(orderId);
}

async function updateExistingPurchaseOrder(order: OrderRow, items: ItemRow[]): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase no está configurado.');
  }
  const client = supabase;

  const { data: savedOrder, error: orderError } = await client
    .from('purchase_orders')
    .update({
      status: order.status,
      budget_total_cents: order.budget_total_cents,
      invoiced_total_cents: order.invoiced_total_cents,
      updated_at: order.updated_at,
    })
    .eq('id', order.id)
    .select('id, status, updated_at')
    .single();
  if (orderError || !savedOrder?.id || savedOrder.status !== order.status || savedOrder.updated_at !== order.updated_at) {
    throw new Error(orderError?.message ?? 'Supabase no confirmó la actualización del pedido.');
  }

  const updates = await Promise.all(items.map((item) => client
    .from('purchase_order_items')
    .update({
      product_name: item.product_name,
      supplier_name: item.supplier_name,
      unit: item.unit,
      quantity: item.quantity,
      estimated_unit_price_cents: item.estimated_unit_price_cents,
      actual_unit_price_cents: item.actual_unit_price_cents,
      status: item.status,
      purchased_at: item.purchased_at,
      updated_at: item.updated_at,
    })
    .eq('id', item.id)
    .eq('order_id', item.request_id)
    .select('id, status, updated_at')
    .single()));
  const failedUpdate = updates.find((result) => result.error || !result.data?.id);
  if (failedUpdate) {
    throw new Error(failedUpdate.error?.message ?? 'Supabase no confirmó los productos del pedido.');
  }
}

export async function markPurchaseOrderForSync(orderId: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO purchase_order_sync_state (order_id, changed_at) VALUES (?, ?)
     ON CONFLICT(order_id) DO UPDATE SET changed_at = excluded.changed_at`,
    orderId,
    new Date().toISOString(),
  );
}

export async function syncPurchaseOrdersToSupabase(): Promise<void> {
  if (!supabase) {
    return;
  }
  const database = await getDatabase();
  const orders = await database.getAllAsync<{ id: string }>('SELECT order_id AS id FROM purchase_order_sync_state');
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
  await getDirectoryUsers();
  const { data: remoteOrders, error: ordersError } = await supabase
    .from('purchase_orders')
    .select('id, requester_id, assignee_id, status, budget_total_cents, invoiced_total_cents, created_at, updated_at')
    .or(`requester_id.eq.${userId},assignee_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (ordersError) {
    throw new Error(ordersError.message);
  }
  const orders = (remoteOrders ?? []) as RemoteOrder[];
  let remoteItems: RemoteItem[] = [];
  if (orders.length) {
    let { data, error: itemsError } = await supabase
      .from('purchase_order_items')
      .select('id, order_id, product_name, supplier_name, unit, quantity, estimated_unit_price_cents, actual_unit_price_cents, status, purchased_at, created_at, updated_at')
      .in('order_id', orders.map((order) => order.id));

    if (itemsError?.message.includes('supplier_name')) {
      const legacyResult = await supabase
        .from('purchase_order_items')
        .select('id, order_id, product_name, unit, quantity, estimated_unit_price_cents, actual_unit_price_cents, status, purchased_at, created_at, updated_at')
        .in('order_id', orders.map((order) => order.id));
      data = (legacyResult.data ?? []).map((item) => ({ ...item, supplier_name: '' }));
      itemsError = legacyResult.error;
    }

    if (itemsError) {
      throw new Error(itemsError.message);
    }
    remoteItems = (data ?? []) as RemoteItem[];
  }

  const database = await getDatabase();
  const now = new Date().toISOString();
  const itemsByOrder = new Map<string, RemoteItem[]>();
  for (const item of remoteItems) {
    itemsByOrder.set(item.order_id, [...(itemsByOrder.get(item.order_id) ?? []), item]);
  }
  const completedOrderIds: string[] = [];
  await database.withExclusiveTransactionAsync(async (transaction) => {
    const localOrders = await transaction.getAllAsync<{ id: string; status: string; has_pending_sync: number }>(
      `SELECT request.id, request.status,
              CASE WHEN sync_state.order_id IS NULL THEN 0 ELSE 1 END AS has_pending_sync
       FROM purchase_requests AS request
       LEFT JOIN purchase_order_sync_state AS sync_state ON sync_state.order_id = request.id
       WHERE request.requester_id = ? OR request.assignee_id = ?`,
      userId,
      userId,
    );
    const localStatusById = new Map(localOrders.map((order) => [order.id, order.status]));
    const remoteOrderIds = new Set(orders.map((order) => order.id));
    for (const localOrder of localOrders) {
      if (!remoteOrderIds.has(localOrder.id) && !localOrder.has_pending_sync) {
        await transaction.runAsync('DELETE FROM purchase_request_items WHERE request_id = ?', localOrder.id);
        await transaction.runAsync('DELETE FROM purchase_requests WHERE id = ?', localOrder.id);
      }
    }
    for (const order of orders) {
      const pendingSync = await transaction.getFirstAsync<{ order_id: string }>(
        'SELECT order_id FROM purchase_order_sync_state WHERE order_id = ?',
        order.id,
      );
      if (pendingSync) {
        continue;
      }
      if (
        order.requester_id === userId &&
        order.status === 'delivered' &&
        localStatusById.get(order.id) !== 'delivered'
      ) {
        completedOrderIds.push(order.id);
      }
      const familyId = `family-${order.requester_id}`;
      await transaction.runAsync(
        `INSERT INTO families (id, name, created_at, updated_at) VALUES (?, 'Pedidos sincronizados', ?, ?)
         ON CONFLICT(id) DO NOTHING`,
        familyId, now, now,
      );
      for (const profileId of [order.requester_id, order.assignee_id].filter((id): id is string => Boolean(id))) {
        await transaction.runAsync(
          `INSERT INTO profiles (id, display_name, email, created_at, updated_at) VALUES (?, 'Usuario', NULL, ?, ?)
           ON CONFLICT(id) DO NOTHING`,
          profileId, now, now,
        );
      }
      await transaction.runAsync(
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
        await transaction.runAsync(
          `INSERT INTO purchase_request_items (
            id, request_id, product_id, product_name, supplier_name, unit, quantity, estimated_unit_price_cents,
            actual_unit_price_cents, status, purchased_at, delivered_at, created_at, updated_at
          ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            product_name = excluded.product_name, supplier_name = excluded.supplier_name,
            unit = excluded.unit, quantity = excluded.quantity,
            estimated_unit_price_cents = excluded.estimated_unit_price_cents,
            actual_unit_price_cents = excluded.actual_unit_price_cents, status = excluded.status,
            purchased_at = excluded.purchased_at, updated_at = excluded.updated_at`,
          item.id, item.order_id, item.product_name, item.supplier_name, item.unit, item.quantity,
          item.estimated_unit_price_cents, item.actual_unit_price_cents, item.status,
          item.purchased_at, item.created_at, item.updated_at,
        );
      }
    }
  });
  for (const orderId of completedOrderIds) {
    await createOrderCompletionNotification(orderId, userId);
  }
  notifyPurchaseSummaryChanged();
}

export function subscribeToPurchaseOrders(userId: string, onChange: () => void): () => void {
  if (!supabase) {
    return () => {};
  }
  const client = supabase;
  const channel = client
    .channel(`purchase-orders:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' }, () => {
      void syncPurchaseOrdersFromSupabase(userId).then(onChange).catch(() => {});
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_order_items' }, () => {
      void syncPurchaseOrdersFromSupabase(userId).then(onChange).catch(() => {});
    })
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}

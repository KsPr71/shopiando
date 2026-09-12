import { getDatabase } from '@/database/database';
import { createOrderCancellationNotification, createOrderCompletionNotification } from '@/services/order-notifications';
import { notifyPurchaseSummaryChanged } from '@/services/purchase-summary';
import { markPurchaseOrderForSync, syncPurchaseOrderToSupabase } from '@/services/purchase-order-sync';
import { supabase } from '@/services/supabase';

export type AssignedPurchaseItem = {
  id: string;
  name: string;
  supplierName: string;
  quantity: number;
  estimatedUnitPriceCents: number;
  actualUnitPriceCents: number | null;
  isPurchased: boolean;
};

export type AssignedPurchaseOrder = {
  id: string;
  createdAt: string;
  requesterName: string;
  requesterAvatarUri: string | null;
  cancellationReason: string | null;
  budgetTotalCents: number;
  invoicedTotalCents: number;
  items: AssignedPurchaseItem[];
};

type OrderItemRow = {
  order_id: string;
  created_at: string;
  requester_name: string;
  requester_avatar_uri: string | null;
  notes: string | null;
  budget_total_cents: number;
  invoiced_total_cents: number;
  item_id: string;
  product_name: string;
  supplier_name: string;
  quantity: number;
  estimated_unit_price_cents: number;
  actual_unit_price_cents: number | null;
  item_status: string;
};

export async function getAssignedPurchaseOrders(userId: string): Promise<AssignedPurchaseOrder[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<OrderItemRow>(
    `SELECT
       request.id AS order_id,
       request.created_at,
       requester.display_name AS requester_name,
       local_profile.avatar_uri AS requester_avatar_uri,
       request.notes,
       request.budget_total_cents,
       request.invoiced_total_cents,
       item.id AS item_id,
       item.product_name,
       item.supplier_name,
       item.quantity,
       item.estimated_unit_price_cents,
       item.actual_unit_price_cents,
       item.status AS item_status
     FROM purchase_requests AS request
     JOIN profiles AS requester ON requester.id = request.requester_id
     LEFT JOIN local_profile_details AS local_profile ON local_profile.user_id = request.requester_id
     JOIN purchase_request_items AS item ON item.request_id = request.id
     WHERE request.assignee_id = ?
       AND request.status NOT IN ('delivered', 'cancelled')
     ORDER BY request.created_at DESC, item.created_at ASC`,
    userId,
  );

  const orders = new Map<string, AssignedPurchaseOrder>();
  for (const row of rows) {
    const order = orders.get(row.order_id) ?? {
      id: row.order_id,
      createdAt: row.created_at,
      requesterName: row.requester_name,
      requesterAvatarUri: row.requester_avatar_uri,
      cancellationReason: row.notes,
      budgetTotalCents: Number(row.budget_total_cents),
      invoicedTotalCents: Number(row.invoiced_total_cents),
      items: [],
    };
    order.items.push({
      id: row.item_id,
      name: row.product_name,
      supplierName: row.supplier_name || 'Sin proveedor',
      quantity: Number(row.quantity),
      estimatedUnitPriceCents: Number(row.estimated_unit_price_cents),
      actualUnitPriceCents: row.actual_unit_price_cents === null ? null : Number(row.actual_unit_price_cents),
      isPurchased: row.item_status === 'purchased',
    });
    orders.set(order.id, order);
  }

  return Array.from(orders.values());
}

export async function setPurchaseItemPurchased(orderId: string, itemId: string, isPurchased: boolean): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  let requesterId: string | null = null;
  let isOrderCompleted = false;
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      `UPDATE purchase_request_items
       SET status = ?,
           actual_unit_price_cents = CASE WHEN ? THEN estimated_unit_price_cents ELSE NULL END,
           purchased_at = CASE WHEN ? THEN ? ELSE NULL END,
           updated_at = ?
       WHERE id = ? AND request_id = ?`,
      isPurchased ? 'purchased' : 'pending',
      isPurchased ? 1 : 0,
      isPurchased ? 1 : 0,
      now,
      now,
      itemId,
      orderId,
    );

    const totals = await transaction.getFirstAsync<{ pending_items: number; invoiced_total_cents: number }>(
      `SELECT
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_items,
         COALESCE(SUM(CASE WHEN status = 'purchased' THEN quantity * actual_unit_price_cents ELSE 0 END), 0) AS invoiced_total_cents
       FROM purchase_request_items
       WHERE request_id = ?`,
      orderId,
    );
    await transaction.runAsync(
      `UPDATE purchase_requests
       SET status = ?, invoiced_total_cents = ?, updated_at = ?
       WHERE id = ?`,
      Number(totals?.pending_items ?? 0) === 0 ? 'delivered' : 'in_progress',
      Number(totals?.invoiced_total_cents ?? 0),
      now,
      orderId,
    );
    const updatedOrder = await transaction.getFirstAsync<{ requester_id: string; status: string }>(
      'SELECT requester_id, status FROM purchase_requests WHERE id = ?',
      orderId,
    );
    requesterId = updatedOrder?.requester_id ?? null;
    isOrderCompleted = updatedOrder?.status === 'delivered';
  });
  if (isOrderCompleted && requesterId) {
    await createOrderCompletionNotification(orderId, requesterId);
  }
  await markPurchaseOrderForSync(orderId);
  notifyPurchaseSummaryChanged();
  await syncPurchaseOrderToSupabase(orderId);
}

export async function cancelPurchaseOrder(orderId: string, reason: string): Promise<void> {
  const normalizedReason = reason.trim();
  if (normalizedReason.length < 3) {
    throw new Error('Explica brevemente el motivo de la cancelación.');
  }
  const database = await getDatabase();
  const now = new Date().toISOString();
  const order = await database.getFirstAsync<{ requester_id: string; assignee_id: string | null }>(
    'SELECT requester_id, assignee_id FROM purchase_requests WHERE id = ?',
    orderId,
  );
  if (!order) throw new Error('No se encontró el pedido que deseas cancelar.');
  const currentUserId = supabase ? (await supabase.auth.getUser()).data.user?.id : null;
  const recipientId = currentUserId === order.requester_id
    ? order.assignee_id ?? order.requester_id
    : order.requester_id;
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      `UPDATE purchase_requests SET status = 'cancelled', notes = ?, updated_at = ? WHERE id = ?`,
      normalizedReason, now, orderId,
    );
    await transaction.runAsync(
      `UPDATE purchase_request_items SET status = 'cancelled', updated_at = ? WHERE request_id = ? AND status = 'pending'`,
      now, orderId,
    );
  });
  await createOrderCancellationNotification(orderId, recipientId, normalizedReason);
  await markPurchaseOrderForSync(orderId);
  notifyPurchaseSummaryChanged();
  await syncPurchaseOrderToSupabase(orderId);
}

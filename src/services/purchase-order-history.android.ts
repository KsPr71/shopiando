import { getDatabase } from '@/database/database';

export type PurchaseHistoryItem = {
  id: string;
  name: string;
  supplierName: string;
  quantity: number;
  estimatedUnitPriceCents: number;
};

export type PurchaseHistoryOrder = {
  id: string;
  createdAt: string;
  assigneeName: string;
  assigneeAvatarUri: string | null;
  status: string;
  cancellationReason: string | null;
  budgetTotalCents: number;
  invoicedTotalCents: number;
  items: PurchaseHistoryItem[];
};

type HistoryRow = {
  order_id: string;
  created_at: string;
  assignee_name: string | null;
  assignee_avatar_uri: string | null;
  status: string;
  notes: string | null;
  budget_total_cents: number;
  invoiced_total_cents: number;
  item_id: string;
  product_name: string;
  supplier_name: string;
  quantity: number;
  estimated_unit_price_cents: number;
};

export async function getPurchaseOrderHistory(userId: string): Promise<PurchaseHistoryOrder[]> {
  return getHistory(userId, 'requested');
}

export async function getAssignedPurchaseOrderHistory(userId: string): Promise<PurchaseHistoryOrder[]> {
  return getHistory(userId, 'assigned');
}

async function getHistory(userId: string, type: 'requested' | 'assigned'): Promise<PurchaseHistoryOrder[]> {
  const database = await getDatabase();
  const isRequested = type === 'requested';
  const rows = await database.getAllAsync<HistoryRow>(
    `SELECT
       request.id AS order_id,
       request.created_at,
       counterpart.display_name AS assignee_name,
       counterpart_profile.avatar_uri AS assignee_avatar_uri,
       request.status,
       request.notes,
       request.budget_total_cents,
       request.invoiced_total_cents,
       item.id AS item_id,
       item.product_name,
       item.supplier_name,
       item.quantity,
       item.estimated_unit_price_cents
     FROM purchase_requests AS request
     LEFT JOIN profiles AS counterpart ON counterpart.id = ${isRequested ? 'request.assignee_id' : 'request.requester_id'}
     LEFT JOIN local_profile_details AS counterpart_profile ON counterpart_profile.user_id = ${isRequested ? 'request.assignee_id' : 'request.requester_id'}
     JOIN purchase_request_items AS item ON item.request_id = request.id
     WHERE request.${isRequested ? 'requester_id' : 'assignee_id'} = ?
     ORDER BY request.created_at DESC, item.created_at ASC`,
    userId,
  );

  const orders = new Map<string, PurchaseHistoryOrder>();
  for (const row of rows) {
    const order = orders.get(row.order_id) ?? {
      id: row.order_id,
      createdAt: row.created_at,
      assigneeName: row.assignee_name ?? 'Sin asignar',
      assigneeAvatarUri: row.assignee_avatar_uri,
      status: row.status,
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
    });
    orders.set(order.id, order);
  }

  return Array.from(orders.values());
}

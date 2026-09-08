import { getDatabase } from '@/database/database';

export type PurchaseSummary = {
  assignedOrderCount: number;
  pendingProductCount: number;
};

type SummaryRow = {
  assigned_order_count: number;
  pending_product_count: number;
};

const listeners = new Set<() => void>();

export async function getPurchaseSummary(userId: string): Promise<PurchaseSummary> {
  const database = await getDatabase();
  const summary = await database.getFirstAsync<SummaryRow>(
    `SELECT
       COUNT(DISTINCT request.id) AS assigned_order_count,
       COALESCE(SUM(CASE WHEN item.status = 'pending' THEN item.quantity ELSE 0 END), 0) AS pending_product_count
     FROM purchase_requests AS request
     JOIN purchase_request_items AS item
       ON item.request_id = request.id
     WHERE request.assignee_id = ?
       AND request.status NOT IN ('delivered', 'cancelled')`,
    userId,
  );

  return {
    assignedOrderCount: Number(summary?.assigned_order_count ?? 0),
    pendingProductCount: Number(summary?.pending_product_count ?? 0),
  };
}

export function subscribeToPurchaseSummaryChanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyPurchaseSummaryChanged(): void {
  listeners.forEach((listener) => listener());
}

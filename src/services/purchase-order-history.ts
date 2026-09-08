export type PurchaseHistoryItem = {
  id: string;
  name: string;
  quantity: number;
  estimatedUnitPriceCents: number;
};

export type PurchaseHistoryOrder = {
  id: string;
  createdAt: string;
  assigneeName: string;
  assigneeAvatarUri: string | null;
  status: string;
  budgetTotalCents: number;
  invoicedTotalCents: number;
  items: PurchaseHistoryItem[];
};

export async function getPurchaseOrderHistory(_userId: string): Promise<PurchaseHistoryOrder[]> {
  return [];
}

export async function getAssignedPurchaseOrderHistory(_userId: string): Promise<PurchaseHistoryOrder[]> {
  return [];
}

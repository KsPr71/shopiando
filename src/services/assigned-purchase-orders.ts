export type AssignedPurchaseItem = {
  id: string;
  name: string;
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
  budgetTotalCents: number;
  invoicedTotalCents: number;
  items: AssignedPurchaseItem[];
};

export async function getAssignedPurchaseOrders(_userId: string): Promise<AssignedPurchaseOrder[]> {
  return [];
}

export async function setPurchaseItemPurchased(_orderId: string, _itemId: string, _isPurchased: boolean): Promise<void> {}

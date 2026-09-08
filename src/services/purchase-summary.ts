export type PurchaseSummary = {
  assignedOrderCount: number;
  pendingProductCount: number;
};

export async function getPurchaseSummary(_userId: string): Promise<PurchaseSummary> {
  return { assignedOrderCount: 0, pendingProductCount: 0 };
}

export function subscribeToPurchaseSummaryChanges(_listener: () => void): () => void {
  return () => {};
}

export function notifyPurchaseSummaryChanged(): void {}

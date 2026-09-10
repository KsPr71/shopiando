export async function syncPurchaseOrderToSupabase(_orderId: string): Promise<void> {}

export async function markPurchaseOrderForSync(_orderId: string): Promise<void> {}

export async function syncPurchaseOrdersToSupabase(): Promise<void> {}

export async function syncPurchaseOrdersFromSupabase(_userId: string): Promise<void> {}

export function subscribeToPurchaseOrders(_userId: string, _onChange: () => void): () => void { return () => {}; }

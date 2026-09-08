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

export async function loadProductCatalog(
  _userId: string,
  _email: string | undefined,
  _displayName: string
): Promise<{ products: Product[]; assignees: OrderAssignee[] }> {
  return { products: [], assignees: [] };
}

export async function createPurchaseOrder(
  _userId: string,
  _email: string | undefined,
  _displayName: string,
  _assigneeId: string,
  _lines: OrderLine[]
): Promise<CreatePurchaseOrderResult> {
  return { synced: false, syncError: 'La sincronización de pedidos solo está disponible en Android.' };
}

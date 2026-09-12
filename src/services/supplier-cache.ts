import type { Supplier } from '@/services/suppliers';

export async function getCachedSuppliers(): Promise<Supplier[]> { return []; }
export async function replaceCachedSuppliers(_suppliers: Supplier[]): Promise<void> {}
export async function upsertCachedSupplier(_supplier: Supplier): Promise<void> {}
export async function removeCachedSupplier(_supplierId: string): Promise<void> {}

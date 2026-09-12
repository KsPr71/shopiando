import { useEffect, useMemo, useState } from 'react';

import { getCachedSuppliers, getSuppliers, subscribeToSuppliers, type Supplier } from '@/services/suppliers';

export function useSupplierImages(enabled: boolean): Record<string, string> {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let mounted = true;
    const apply = (next: Supplier[]) => { if (mounted) setSuppliers(next); };
    const refresh = () => { void getSuppliers().then(apply).catch(() => {}); };
    void getCachedSuppliers().then(apply).catch(() => {});
    refresh();
    const unsubscribe = subscribeToSuppliers(refresh);
    return () => { mounted = false; unsubscribe(); };
  }, [enabled]);

  return useMemo(() => Object.fromEntries(
    suppliers
      .filter((supplier) => supplier.imageUrl)
      .map((supplier) => [normalizeSupplierName(supplier.name), supplier.imageUrl as string]),
  ), [suppliers]);
}

export function getSupplierImage(images: Record<string, string>, supplierName: string): string | null {
  return images[normalizeSupplierName(supplierName)] ?? null;
}

function normalizeSupplierName(name: string): string {
  return name.trim().toLocaleLowerCase('es');
}

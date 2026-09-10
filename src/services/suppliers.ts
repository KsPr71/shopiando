import { supabase } from '@/services/supabase';

export type Supplier = {
  id: string;
  name: string;
  address: string;
  phone: string;
};

type SupplierRow = {
  id: string;
  name: string;
  address: string;
  phone: string;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error('Configura Supabase para gestionar proveedores.');
  }
  return supabase;
}

export async function getSuppliers(): Promise<Supplier[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('suppliers')
    .select('id, name, address, phone')
    .order('name');

  if (error) {
    throw new Error(error.message);
  }
  return (data as SupplierRow[]).map(mapSupplier);
}

export async function addSupplier(input: { name: string; address: string; phone: string }): Promise<Supplier> {
  const client = requireSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) {
    throw new Error(userError.message);
  }
  if (!userData.user) {
    throw new Error('Inicia sesión para añadir proveedores.');
  }

  const { data, error } = await client
    .from('suppliers')
    .insert({
      name: input.name.trim(),
      address: input.address.trim(),
      phone: input.phone.trim(),
      created_by: userData.user.id,
    })
    .select('id, name, address, phone')
    .single();

  if (error) {
    throw new Error(error.code === '23505' ? 'Ya existe un proveedor con ese nombre.' : error.message);
  }
  return mapSupplier(data as SupplierRow);
}

function mapSupplier(row: SupplierRow): Supplier {
  return { id: row.id, name: row.name, address: row.address, phone: row.phone };
}

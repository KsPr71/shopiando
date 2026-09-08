import NetInfo from '@react-native-community/netinfo';

import { getDatabase } from '@/database/database';
import { isSupabaseConfigured, supabase } from '@/services/supabase';

const SYNCABLE_ENTITIES = [
  'families',
  'profiles',
  'family_members',
  'products',
  'purchase_requests',
  'purchase_request_items',
  'audit_events',
] as const;

export type SyncableEntity = (typeof SYNCABLE_ENTITIES)[number];
export type SyncOperation = 'upsert' | 'delete';

type SyncQueueRow = {
  id: string;
  entity_type: SyncableEntity;
  entity_id: string;
  operation: SyncOperation;
  payload_json: string;
};

export type SyncResult = {
  attempted: number;
  completed: number;
  skippedReason?: 'offline' | 'not_configured';
};

function isSyncableEntity(value: string): value is SyncableEntity {
  return SYNCABLE_ENTITIES.includes(value as SyncableEntity);
}

/** Adds a local change to the durable outbox after the local write succeeds. */
export async function enqueueSync(
  id: string,
  entityType: SyncableEntity,
  entityId: string,
  operation: SyncOperation,
  payload: Record<string, unknown>,
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO sync_queue (id, entity_type, entity_id, operation, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    entityType,
    entityId,
    operation,
    JSON.stringify(payload),
    new Date().toISOString(),
  );
}

/** Sends queued local changes. Remote failures remain queued for a later retry. */
export async function syncPendingChanges(): Promise<SyncResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { attempted: 0, completed: 0, skippedReason: 'not_configured' };
  }

  const network = await NetInfo.fetch();
  if (!network.isConnected || network.isInternetReachable === false) {
    return { attempted: 0, completed: 0, skippedReason: 'offline' };
  }

  const database = await getDatabase();
  const pendingRows = await database.getAllAsync<SyncQueueRow>(
    `SELECT id, entity_type, entity_id, operation, payload_json
     FROM sync_queue WHERE synced_at IS NULL ORDER BY created_at ASC`,
  );
  let completed = 0;

  for (const row of pendingRows) {
    if (!isSyncableEntity(row.entity_type)) {
      continue;
    }

    try {
      const payload: Record<string, unknown> = JSON.parse(row.payload_json) as Record<string, unknown>;
      const response =
        row.operation === 'delete'
          ? await supabase.from(row.entity_type).delete().eq('id', row.entity_id)
          : await supabase.from(row.entity_type).upsert(payload, { onConflict: 'id' });

      if (response.error) {
        throw new Error(response.error.message);
      }

      await database.runAsync('UPDATE sync_queue SET synced_at = ?, last_error = NULL WHERE id = ?', new Date().toISOString(), row.id);
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error de sincronización desconocido';
      await database.runAsync(
        'UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?',
        message,
        row.id,
      );
    }
  }

  return { attempted: pendingRows.length, completed };
}

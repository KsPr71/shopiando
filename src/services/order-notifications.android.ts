import { getDatabase } from '@/database/database';
import { supabase } from '@/services/supabase';

const listeners = new Set<() => void>();

export type OrderNotification = {
  id: string;
  recipientId: string;
  orderId: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

type NotificationRow = {
  id: string;
  recipient_id: string;
  order_id: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export async function createOrderNotifications(orderId: string, requesterId: string, assigneeId: string, requesterName: string): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const notifications = assigneeId === requesterId
    ? [{ id: createId(), recipientId: requesterId, title: 'Pedido creado', body: 'Tu solicitud de compra fue creada correctamente.' }]
    : [
      { id: createId(), recipientId: requesterId, title: 'Pedido enviado', body: 'Tu solicitud de compra fue asignada correctamente.' },
      { id: createId(), recipientId: assigneeId, title: 'Nuevo pedido asignado', body: `${requesterName} te asignó una solicitud de compra.` },
    ];

  for (const notification of notifications) {
    await database.runAsync(
      `INSERT INTO order_notifications (id, recipient_id, order_id, title, body, created_at, read_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      notification.id,
      notification.recipientId,
      orderId,
      notification.title,
      notification.body,
      now,
    );
  }
  notifyListeners();
}

export async function getOrderNotifications(userId: string): Promise<OrderNotification[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<NotificationRow>(
    `SELECT id, recipient_id, order_id, title, body, created_at, read_at
     FROM order_notifications WHERE recipient_id = ? ORDER BY created_at DESC`,
    userId,
  );
  return rows.map(mapNotification);
}

export async function markOrderNotificationsRead(userId: string): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.runAsync('UPDATE order_notifications SET read_at = ? WHERE recipient_id = ? AND read_at IS NULL', now, userId);

  if (supabase) {
    const { error } = await supabase
      .from('purchase_order_notifications')
      .update({ read_at: now })
      .eq('recipient_id', userId)
      .is('read_at', null);

    if (error && !isNotificationsTableUnavailable(error.message)) {
      throw new Error(error.message);
    }
  }

  notifyListeners();
}

export async function clearReadOrderNotifications(userId: string): Promise<void> {
  if (supabase) {
    const { error } = await supabase
      .from('purchase_order_notifications')
      .delete()
      .eq('recipient_id', userId)
      .not('read_at', 'is', null);
    if (error && !isNotificationsTableUnavailable(error.message)) {
      throw new Error(error.message);
    }
  }
  const database = await getDatabase();
  await database.runAsync('DELETE FROM order_notifications WHERE recipient_id = ? AND read_at IS NOT NULL', userId);
  notifyListeners();
}

export async function syncOrderNotificationsToSupabase(orderId: string): Promise<void> {
  if (!supabase) {
    return;
  }
  const database = await getDatabase();
  const notifications = await database.getAllAsync<NotificationRow>(
    'SELECT id, recipient_id, order_id, title, body, created_at, read_at FROM order_notifications WHERE order_id = ?',
    orderId,
  );
  if (!notifications.length) {
    return;
  }
  const { error } = await supabase.from('purchase_order_notifications').upsert(notifications);
  if (error) {
    if (isNotificationsTableUnavailable(error.message)) {
      return;
    }
    throw new Error(error.message);
  }
}

export async function syncOrderNotificationsFromSupabase(userId: string): Promise<void> {
  if (!supabase) {
    return;
  }
  const { data, error } = await supabase
    .from('purchase_order_notifications')
    .select('id, recipient_id, order_id, title, body, created_at, read_at')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    if (isNotificationsTableUnavailable(error.message)) {
      return;
    }
    throw new Error(error.message);
  }
  const database = await getDatabase();
  for (const notification of data ?? []) {
    await database.runAsync(
      `INSERT INTO order_notifications (id, recipient_id, order_id, title, body, created_at, read_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET read_at = excluded.read_at`,
      notification.id, notification.recipient_id, notification.order_id, notification.title,
      notification.body, notification.created_at, notification.read_at,
    );
  }
  const remoteIds = (data ?? []).map((notification) => notification.id);
  if (remoteIds.length === 0) {
    await database.runAsync('DELETE FROM order_notifications WHERE recipient_id = ?', userId);
  } else {
    const placeholders = remoteIds.map(() => '?').join(', ');
    await database.runAsync(
      `DELETE FROM order_notifications WHERE recipient_id = ? AND id NOT IN (${placeholders})`,
      userId,
      ...remoteIds,
    );
  }
  notifyListeners();
}

export function subscribeToOrderNotifications(userId: string, onNotification: () => void): () => void {
  listeners.add(onNotification);
  const client = supabase;
  if (!client) {
    return () => listeners.delete(onNotification);
  }
  const channel = client
    .channel(`purchase-order-notifications:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_order_notifications', filter: `recipient_id=eq.${userId}` }, () => {
      void syncOrderNotificationsFromSupabase(userId).then(onNotification).catch(() => {});
    })
    .subscribe();
  return () => {
    listeners.delete(onNotification);
    void client.removeChannel(channel);
  };
}

function mapNotification(row: NotificationRow): OrderNotification {
  return { id: row.id, recipientId: row.recipient_id, orderId: row.order_id, title: row.title, body: row.body, createdAt: row.created_at, readAt: row.read_at };
}

function createId(): string {
  return `notification-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

function isNotificationsTableUnavailable(message: string): boolean {
  return message.includes("purchase_order_notifications") && message.includes('schema cache');
}

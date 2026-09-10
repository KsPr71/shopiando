export type OrderNotification = {
  id: string;
  recipientId: string;
  orderId: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

export async function createOrderNotifications(..._args: unknown[]): Promise<void> {}
export async function getOrderNotifications(..._args: unknown[]): Promise<OrderNotification[]> { return []; }
export async function markOrderNotificationsRead(..._args: unknown[]): Promise<void> {}
export async function clearReadOrderNotifications(..._args: unknown[]): Promise<void> {}
export async function syncOrderNotificationsFromSupabase(..._args: unknown[]): Promise<void> {}
export async function syncOrderNotificationsToSupabase(..._args: unknown[]): Promise<void> {}
export function subscribeToOrderNotifications(..._args: unknown[]): () => void { return () => {}; }

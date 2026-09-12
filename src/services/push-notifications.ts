export type PushNotificationDebugInfo = {
  environment: string;
  isSupported: boolean;
  permission: string;
  token: string | null;
  isRegisteredInSupabase: boolean | null;
  message: string | null;
};

export async function registerPushToken(_userId: string): Promise<void> {}

export async function unregisterPushToken(_userId: string): Promise<void> {}

export async function notifyProductCreated(_productId: string): Promise<void> {}

export async function notifyPurchaseOrderAssigned(_orderId: string): Promise<void> {}

export async function notifyPurchaseOrderCompleted(_orderId: string): Promise<{ delivered: number; recipientsWithoutToken: number }> {
  return { delivered: 0, recipientsWithoutToken: 0 };
}

export async function notifyPurchaseOrderCancelled(_orderId: string): Promise<{ delivered: number; recipientsWithoutToken: number }> {
  return { delivered: 0, recipientsWithoutToken: 0 };
}

export async function getPushNotificationDebugInfo(_userId: string): Promise<PushNotificationDebugInfo> {
  return {
    environment: 'No compatible',
    isSupported: false,
    permission: 'No disponible',
    token: null,
    isRegisteredInSupabase: null,
    message: 'Las notificaciones remotas solo están disponibles en Android.',
  };
}

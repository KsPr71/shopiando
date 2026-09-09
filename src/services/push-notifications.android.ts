import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '@/services/supabase';

let hasConfiguredNotifications = false;
type NotificationsModule = typeof import('expo-notifications');

export async function registerPushToken(userId: string): Promise<void> {
  if (!supabase || Platform.OS !== 'android' || !Device.isDevice) {
    return;
  }

  const notifications = getNotifications();
  if (!notifications) {
    return;
  }

  configureNotifications(notifications);

  await notifications.setNotificationChannelAsync('default', {
    name: 'Notificaciones',
    importance: notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'notification.wav',
  });

  const currentPermissions = await notifications.getPermissionsAsync();
  let status = currentPermissions.status;
  if (status !== 'granted') {
    const requestedPermissions = await notifications.requestPermissionsAsync();
    status = requestedPermissions.status;
  }
  if (status !== 'granted') {
    return;
  }

  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    throw new Error('No se encontr\u00f3 el identificador del proyecto EAS para notificaciones.');
  }

  const token = (await notifications.getExpoPushTokenAsync({ projectId })).data;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('device_push_tokens')
    .upsert({ user_id: userId, token, platform: 'android', updated_at: now, last_seen_at: now }, { onConflict: 'token' });
  if (error) {
    throw new Error(error.message);
  }
}

function configureNotifications(notifications: NotificationsModule): void {
  if (hasConfiguredNotifications) {
    return;
  }
  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
  hasConfiguredNotifications = true;
}

export async function unregisterPushToken(userId: string): Promise<void> {
  if (!supabase || Platform.OS !== 'android' || !Device.isDevice) {
    return;
  }
  const notifications = getNotifications();
  if (!notifications) {
    return;
  }
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    return;
  }
  const token = (await notifications.getExpoPushTokenAsync({ projectId })).data;
  const { error } = await supabase.from('device_push_tokens').delete().eq('user_id', userId).eq('token', token);
  if (error) {
    throw new Error(error.message);
  }
}

function getNotifications(): NotificationsModule | null {
  try {
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null;
  }
}

export async function notifyProductCreated(productId: string): Promise<void> {
  await invokeNotificationFunction({ type: 'product_created', productId });
}

export async function notifyPurchaseOrderAssigned(orderId: string): Promise<void> {
  await invokeNotificationFunction({ type: 'purchase_order_assigned', orderId });
}

async function invokeNotificationFunction(payload: Record<string, string>): Promise<void> {
  if (!supabase) {
    return;
  }
  const { error } = await supabase.functions.invoke('send-fcm-notification', { body: payload });
  if (error) {
    throw new Error(error.message);
  }
}

import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '@/services/supabase';
import type { PushNotificationDebugInfo } from '@/services/push-notifications';

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

export async function getPushNotificationDebugInfo(userId: string): Promise<PushNotificationDebugInfo> {
  if (isExpoGo()) {
    return createDebugInfo('Expo Go', false, 'No compatible', null, null, 'Expo Go no permite notificaciones remotas Android. Usa un development build.');
  }
  if (!Device.isDevice) {
    return createDebugInfo('Emulador', false, 'No disponible', null, null, 'Las notificaciones remotas requieren un dispositivo Android físico.');
  }

  const notifications = getNotifications();
  if (!notifications) {
    return createDebugInfo('Android', false, 'No disponible', null, null, 'El módulo de notificaciones no está disponible en esta compilación.');
  }

  const permission = await notifications.getPermissionsAsync();
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (permission.status !== 'granted' || !projectId) {
    return createDebugInfo(
      'Development build',
      true,
      permission.status,
      null,
      null,
      projectId ? 'Concede el permiso de notificaciones y vuelve a actualizar.' : 'No se encontró el proyecto EAS.',
    );
  }

  try {
    const token = (await notifications.getExpoPushTokenAsync({ projectId })).data;
    if (!supabase) {
      return createDebugInfo('Development build', true, permission.status, token, null, 'Supabase no está configurado en esta compilación.');
    }
    const { data, error } = await supabase
      .from('device_push_tokens')
      .select('id')
      .eq('user_id', userId)
      .eq('token', token)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    return createDebugInfo(
      'Development build',
      true,
      permission.status,
      token,
      Boolean(data),
      data ? null : 'El token existe en el dispositivo, pero aún no se registró en Supabase.',
    );
  } catch (error) {
    return createDebugInfo('Development build', true, permission.status, null, null, error instanceof Error ? error.message : 'No se pudo consultar el token.');
  }
}

function getNotifications(): NotificationsModule | null {
  if (isExpoGo()) {
    return null;
  }
  try {
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null;
  }
}

function isExpoGo(): boolean {
  return Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo';
}

function createDebugInfo(
  environment: string,
  isSupported: boolean,
  permission: string,
  token: string | null,
  isRegisteredInSupabase: boolean | null,
  message: string | null,
): PushNotificationDebugInfo {
  return { environment, isSupported, permission, token, isRegisteredInSupabase, message };
}

export async function notifyProductCreated(productId: string): Promise<void> {
  await invokeNotificationFunction({ type: 'product_created', productId });
}

export async function notifyPurchaseOrderAssigned(orderId: string): Promise<void> {
  await invokeNotificationFunction({ type: 'purchase_order_assigned', orderId });
}

export async function notifyPurchaseOrderCompleted(orderId: string): Promise<{ delivered: number; recipientsWithoutToken: number }> {
  const response = await invokeNotificationFunction({ type: 'purchase_order_completed', orderId });
  return {
    delivered: Number(response?.delivered ?? 0),
    recipientsWithoutToken: Number(response?.recipientsWithoutToken ?? 0),
  };
}

async function invokeNotificationFunction(payload: Record<string, string>): Promise<Record<string, unknown> | null> {
  if (!supabase) {
    return null;
  }
  const { data, error } = await supabase.functions.invoke('send-fcm-notification', { body: payload });
  if (error) {
    throw new Error(error.message);
  }
  return data as Record<string, unknown> | null;
}

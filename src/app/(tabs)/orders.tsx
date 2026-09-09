import { Redirect } from 'expo-router';
import { MaterialSymbols_400Regular } from '@expo-google-fonts/material-symbols';
import { useFonts } from 'expo-font';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SideMenu } from '@/components/side-menu';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { getAssignedPurchaseOrderHistory, getPurchaseOrderHistory, type PurchaseHistoryOrder } from '@/services/purchase-order-history';
import { syncPurchaseOrdersFromSupabase } from '@/services/purchase-order-sync';
import { subscribeToPurchaseSummaryChanges } from '@/services/purchase-summary';
import { getDirectoryUsers } from '@/services/user-directory';

export default function OrdersScreen() {
  const [symbolsLoaded] = useFonts({ MaterialSymbols: MaterialSymbols_400Regular });
  const { isReady, user, signOut } = useAuth();
  const theme = useTheme();
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [orders, setOrders] = useState<PurchaseHistoryOrder[]>([]);
  const [historyType, setHistoryType] = useState<'requested' | 'assigned'>('requested');
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'pending'>('pending');
  const hasLoadedHistory = useRef(false);

  async function synchronizeOrders(): Promise<void> {
    if (!user) {
      return;
    }
    setIsSyncing(true);
    setSyncStatus('pending');
    try {
      await syncPurchaseOrdersFromSupabase(user.id);
      setSyncStatus('synced');
    } catch {
      setSyncStatus('pending');
    } finally {
      setIsSyncing(false);
    }
  }

  useEffect(() => {
    if (!user) {
      setOrders([]);
      setIsLoading(false);
      setSyncStatus('pending');
      hasLoadedHistory.current = false;
      return;
    }
    let isMounted = true;
    if (!hasLoadedHistory.current) {
      setIsLoading(true);
    }
    const refresh = async () => {
      const loadOrders = historyType === 'requested' ? getPurchaseOrderHistory : getAssignedPurchaseOrderHistory;
      return loadOrders(user.id).then((nextOrders) => {
        if (isMounted) {
          setOrders(nextOrders);
          setIsLoading(false);
          hasLoadedHistory.current = true;
        }
      }).catch(() => {
        if (isMounted) {
          setIsLoading(false);
          hasLoadedHistory.current = true;
        }
      });
    };
    void (async () => {
      await refresh();
      await getDirectoryUsers().catch(() => {});
      await synchronizeOrders();
      await refresh();
    })();
    const unsubscribe = subscribeToPurchaseSummaryChanges(() => { void refresh(); });
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [historyType, user?.id]);

  const ordersByDate = useMemo(() => {
    const groups = new Map<string, PurchaseHistoryOrder[]>();
    for (const order of orders) {
      const key = new Date(order.createdAt).toDateString();
      groups.set(key, [...(groups.get(key) ?? []), order]);
    }
    return Array.from(groups.entries());
  }, [orders]);

  if (!isReady) {
    return <ThemedView style={styles.centered}><ActivityIndicator /></ThemedView>;
  }
  if (!user) {
    return <Redirect href="/" />;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Abrir menú" accessibilityRole="button" onPress={() => setIsMenuVisible(true)} style={styles.menuButton}>
            <ThemedText style={styles.menuIcon}>☰</ThemedText>
          </Pressable>
          <View>
            <ThemedText style={styles.title}>Mis pedidos</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>{historyType === 'requested' ? 'Historial de solicitudes realizadas' : 'Historial de compras asignadas'}</ThemedText>
            <View style={styles.syncStatus}>
              <View style={[styles.syncDot, { backgroundColor: syncStatus === 'synced' ? theme.success : theme.info }]} />
              <ThemedText themeColor="textSecondary" style={styles.syncText}>{isSyncing ? 'Sincronizando con Supabase…' : syncStatus === 'synced' ? 'Sincronizado con Supabase' : 'Sin sincronizar con Supabase'}</ThemedText>
            </View>
          </View>
          <Pressable accessibilityLabel="Sincronizar pedidos" disabled={isSyncing} onPress={() => void synchronizeOrders()} style={[styles.syncButton, { borderColor: theme.backgroundSelected }, isSyncing && styles.disabled]}>
            <ThemedText style={styles.syncIcon}>{symbolsLoaded ? 'sync' : '↻'}</ThemedText>
          </Pressable>
        </View>

        <View style={styles.toggleContainer}>
          <View style={[styles.historyToggle, { backgroundColor: theme.backgroundSelected }]}>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: historyType === 'requested' }} onPress={() => setHistoryType('requested')} style={[styles.toggleOption, historyType === 'requested' && { backgroundColor: theme.primary }]}>
              <ThemedText style={[styles.toggleText, historyType === 'requested' && styles.toggleTextActive]}>Pedidas</ThemedText>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: historyType === 'assigned' }} onPress={() => setHistoryType('assigned')} style={[styles.toggleOption, historyType === 'assigned' && { backgroundColor: theme.primary }]}>
              <ThemedText style={[styles.toggleText, historyType === 'assigned' && styles.toggleTextActive]}>Asignadas</ThemedText>
            </Pressable>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {isLoading ? <View style={styles.centered}><ActivityIndicator /></View> : null}
          {!isLoading && !ordersByDate.length ? <ThemedText themeColor="textSecondary" style={styles.emptyState}>{historyType === 'requested' ? 'Aún no has realizado pedidos.' : 'No tienes pedidos asignados.'}</ThemedText> : null}
          {ordersByDate.map(([date, groupedOrders]) => (
            <View key={date} style={styles.dateGroup}>
              <ThemedText style={[styles.dateHeading, { color: theme.primary }]}>{formatDateHeading(date)}</ThemedText>
              {groupedOrders.map((order) => {
                const isExpanded = expandedOrders[order.id] ?? false;
                const initial = order.assigneeName.trim().charAt(0).toUpperCase();
                return (
                  <ThemedView key={order.id} type="backgroundElement" style={[styles.orderCard, { borderColor: theme.primary }]}>
                    <Pressable accessibilityRole="button" onPress={() => setExpandedOrders((current) => ({ ...current, [order.id]: !isExpanded }))} style={styles.orderHeader}>
                      <View style={[styles.avatar, { backgroundColor: theme.secondary }]}>
                        {order.assigneeAvatarUri ? <Image source={{ uri: order.assigneeAvatarUri }} style={styles.avatarImage} /> : <ThemedText style={[styles.avatarInitial, { color: theme.text }]}>{initial}</ThemedText>}
                      </View>
                      <View style={styles.orderInfo}>
                        <ThemedText style={styles.assigneeName}>{order.assigneeName}</ThemedText>
                        <ThemedText themeColor="textSecondary" style={styles.orderStatus}>{formatStatus(order.status)}</ThemedText>
                      </View>
                      <View style={styles.totalBlock}>
                        <ThemedText themeColor="textSecondary" style={styles.totalLabel}>Total</ThemedText>
                        <ThemedText style={styles.totalValue}>{formatPrice(order.budgetTotalCents)}</ThemedText>
                      </View>
                      <ThemedText style={styles.chevron}>{isExpanded ? '⌃' : '⌄'}</ThemedText>
                    </Pressable>
                    {isExpanded ? <View style={[styles.orderDetails, { borderTopColor: theme.backgroundSelected }]}>
                      {order.items.map((item) => <View key={item.id} style={styles.itemRow}>
                        <View style={styles.itemInfo}>
                          <ThemedText style={styles.itemName}>{item.name}</ThemedText>
                          <ThemedText themeColor="textSecondary" style={styles.itemQuantity}>{formatQuantity(item.quantity)} unidades</ThemedText>
                        </View>
                        <ThemedText themeColor="textSecondary" style={styles.itemPrice}>{formatPrice(item.estimatedUnitPriceCents * item.quantity)}</ThemedText>
                      </View>)}
                      <View style={styles.totalsRow}>
                        <ThemedText themeColor="textSecondary" style={styles.spentLabel}>Gastado</ThemedText>
                        <ThemedText style={[styles.spentValue, { color: theme.success }]}>{formatPrice(order.invoicedTotalCents)}</ThemedText>
                      </View>
                    </View> : null}
                  </ThemedView>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
      <SideMenu onClose={() => setIsMenuVisible(false)} onSignOut={signOut} userEmail={user.email} visible={isMenuVisible} />
    </ThemedView>
  );
}

function formatDateHeading(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat('es-CU', { day: 'numeric', month: 'long' }).format(date);
}

function formatStatus(status: string): string {
  return ({ pending: 'Pendiente', in_progress: 'En proceso', partially_delivered: 'Parcial', delivered: 'Completado', cancelled: 'Cancelado' } as Record<string, string>)[status] ?? 'Pendiente';
}

function formatQuantity(quantity: number): string {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/\.00$/, '');
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#FAF9F6', flex: 1 },
  safeArea: { flex: 1 },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  header: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
  menuButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  menuIcon: { fontSize: 23, lineHeight: 26 },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
  syncStatus: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 4 },
  syncDot: { borderRadius: 4, height: 7, width: 7 },
  syncText: { fontSize: 10, fontWeight: '600' },
  syncButton: { alignItems: 'center', borderRadius: 18, borderWidth: 1, height: 36, justifyContent: 'center', marginLeft: 'auto', width: 36 },
  syncIcon: { fontFamily: 'MaterialSymbols', fontSize: 21, lineHeight: 24 },
  toggleContainer: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  content: { alignSelf: 'center', flexGrow: 1, gap: Spacing.three, maxWidth: MaxContentWidth, padding: Spacing.three, paddingTop: Spacing.one, width: '100%' },
  historyToggle: { alignSelf: 'flex-start', borderRadius: Spacing.two, flexDirection: 'row', overflow: 'hidden', padding: 2 },
  toggleOption: { borderRadius: 6, minWidth: 88, paddingHorizontal: Spacing.two, paddingVertical: 7 },
  toggleText: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
  toggleTextActive: { color: '#FFFFFF' },
  emptyState: { fontSize: 14, paddingVertical: Spacing.four, textAlign: 'center' },
  dateGroup: { gap: Spacing.two },
  dateHeading: { fontSize: 15, fontWeight: '800', textTransform: 'capitalize' },
  orderCard: { backgroundColor: '#FFFCF5', borderRadius: Spacing.three, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  orderHeader: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, padding: Spacing.three },
  avatar: { alignItems: 'center', borderRadius: 20, height: 40, justifyContent: 'center', overflow: 'hidden', width: 40 },
  avatarImage: { height: '100%', width: '100%' },
  avatarInitial: { fontSize: 15, fontWeight: '800' },
  orderInfo: { flex: 1, minWidth: 0 },
  assigneeName: { fontSize: 14, fontWeight: '800' },
  orderStatus: { fontSize: 11, marginTop: 2 },
  totalBlock: { alignItems: 'flex-end' },
  totalLabel: { fontSize: 10 },
  totalValue: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  chevron: { fontSize: 20, lineHeight: 22 },
  orderDetails: { borderTopWidth: StyleSheet.hairlineWidth, gap: Spacing.one, padding: Spacing.three },
  itemRow: { alignItems: 'center', flexDirection: 'row', minHeight: 36 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 13, fontWeight: '700' },
  itemQuantity: { fontSize: 11, marginTop: 1 },
  itemPrice: { fontSize: 12, fontWeight: '700' },
  totalsRow: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.one, paddingTop: Spacing.two },
  spentLabel: { fontSize: 12 },
  spentValue: { fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.45 },
});

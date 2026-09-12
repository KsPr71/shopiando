import { Redirect } from 'expo-router';
import { MaterialSymbols_400Regular } from '@expo-google-fonts/material-symbols';
import { useFonts } from 'expo-font';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SideMenu } from '@/components/side-menu';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { getSupplierImage, useSupplierImages } from '@/hooks/use-supplier-images';
import { getAssignedPurchaseOrderHistory, getPurchaseOrderHistory, type PurchaseHistoryOrder } from '@/services/purchase-order-history';
import { cancelPurchaseOrder } from '@/services/assigned-purchase-orders';
import { syncPurchaseOrdersFromSupabase, syncPurchaseOrdersToSupabase } from '@/services/purchase-order-sync';
import { subscribeToPurchaseSummaryChanges } from '@/services/purchase-summary';
import { getDirectoryUsers } from '@/services/user-directory';

export default function OrdersScreen() {
  const [symbolsLoaded] = useFonts({ MaterialSymbols: MaterialSymbols_400Regular });
  const { isReady, user, signOut } = useAuth();
  const theme = useTheme();
  const supplierImages = useSupplierImages(Boolean(user));
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [orders, setOrders] = useState<PurchaseHistoryOrder[]>([]);
  const [historyType, setHistoryType] = useState<'requested' | 'assigned'>('requested');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'month' | 'week'>('all');
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancelReasons, setCancelReasons] = useState<Record<string, string>>({});
  const [confirmingCancellationId, setConfirmingCancellationId] = useState<string | null>(null);
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
      await syncPurchaseOrdersToSupabase();
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

  const filteredOrders = useMemo(() => {
    if (periodFilter === 'all') {
      return orders;
    }
    const now = new Date();
    const cutoff = periodFilter === 'month' ? startOfCurrentMonth(now) : startOfCurrentWeek(now);
    return orders.filter((order) => new Date(order.createdAt) >= cutoff);
  }, [orders, periodFilter]);

  const ordersByDate = useMemo(() => {
    const groups = new Map<string, PurchaseHistoryOrder[]>();
    for (const order of filteredOrders) {
      const key = new Date(order.createdAt).toDateString();
      groups.set(key, [...(groups.get(key) ?? []), order]);
    }
    return Array.from(groups.entries());
  }, [filteredOrders]);

  async function confirmCancellation(order: PurchaseHistoryOrder) {
    const reason = cancelReasons[order.id]?.trim() ?? '';
    if (reason.length < 3) return;
    setConfirmingCancellationId(order.id);
    try {
      await cancelPurchaseOrder(order.id, reason);
      setOrders((current) => current.map((candidate) => candidate.id === order.id ? { ...candidate, status: 'cancelled', cancellationReason: reason } : candidate));
      setCancellingOrderId(null);
    } finally {
      setConfirmingCancellationId(null);
    }
  }

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
          <View style={[styles.periodToggle, { borderColor: theme.backgroundSelected }]}>
            {([
              { value: 'all', icon: 'view_list', label: 'Todos' },
              { value: 'month', icon: 'calendar_month', label: 'Mensuales' },
              { value: 'week', icon: 'date_range', label: 'Semanales' },
            ] as const).map((option) => {
              const isSelected = periodFilter === option.value;
              return <Pressable key={option.value} accessibilityLabel={option.label} accessibilityRole="button" accessibilityState={{ selected: isSelected }} onPress={() => setPeriodFilter(option.value)} style={[styles.periodOption, { borderColor: theme.backgroundSelected }, isSelected && { backgroundColor: theme.backgroundSelected }]}><ThemedText style={[styles.periodIcon, isSelected && { color: theme.primary }]}>{symbolsLoaded ? option.icon : '•'}</ThemedText></Pressable>;
            })}
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
                const isCancelled = order.status === 'cancelled';
                const isDelivered = order.status === 'delivered';
                return (
                  <ThemedView key={order.id} type="backgroundElement" style={[styles.orderCard, { borderColor: theme.primary }]}>
                    <Pressable accessibilityRole="button" onPress={() => setExpandedOrders((current) => ({ ...current, [order.id]: !isExpanded }))} style={styles.orderHeader}>
                      <View style={[styles.avatar, { backgroundColor: theme.secondary }]}>
                        {order.assigneeAvatarUri ? <Image source={{ uri: order.assigneeAvatarUri }} style={styles.avatarImage} /> : <ThemedText style={[styles.avatarInitial, { color: theme.text }]}>{initial}</ThemedText>}
                      </View>
                      <View style={styles.orderInfo}>
                        <ThemedText style={styles.assigneeName}>{order.assigneeName}</ThemedText>
                        <View style={[styles.orderStatusChip, { backgroundColor: isCancelled ? '#FDE2E2' : isDelivered ? '#DDF5E8' : '#FFF1CC' }]}>
                          <ThemedText style={[styles.orderStatusChipText, { color: isCancelled ? theme.info : isDelivered ? theme.success : '#9A6700' }]}>{formatStatus(order.status)}</ThemedText>
                        </View>
                      </View>
                      <View style={styles.totalBlock}>
                        <ThemedText themeColor="textSecondary" style={styles.totalLabel}>Total</ThemedText>
                        <ThemedText style={styles.totalValue}>{formatPrice(order.budgetTotalCents)}</ThemedText>
                      </View>
                      <ThemedText style={styles.chevron}>{isExpanded ? '⌃' : '⌄'}</ThemedText>
                    </Pressable>
                    {isExpanded ? <View style={[styles.orderDetails, { borderTopColor: theme.backgroundSelected }]}>
                      {order.items.map((item) => <View key={item.id} style={styles.itemRow}>
                        {getSupplierImage(supplierImages, item.supplierName) ? <Image source={{ uri: getSupplierImage(supplierImages, item.supplierName) ?? undefined }} style={styles.supplierImage} /> : null}
                        <View style={styles.itemInfo}>
                          <ThemedText style={styles.itemName}>{item.name}</ThemedText>
                          <ThemedText themeColor="textSecondary" style={styles.itemSupplier}>{item.supplierName}</ThemedText>
                          <ThemedText themeColor="textSecondary" style={styles.itemQuantity}>{formatQuantity(item.quantity)} unidades</ThemedText>
                        </View>
                        <ThemedText themeColor="textSecondary" style={styles.itemPrice}>{formatPrice(item.estimatedUnitPriceCents * item.quantity)}</ThemedText>
                      </View>)}
                      {isCancelled && order.cancellationReason ? <View style={[styles.cancelReason, { backgroundColor: '#FDEFEF' }]}><ThemedText style={[styles.cancelReasonLabel, { color: theme.info }]}>Motivo:</ThemedText><ThemedText themeColor="textSecondary" style={styles.cancelReasonText}>{order.cancellationReason}</ThemedText></View> : null}
                      {!isCancelled && !isDelivered ? <View style={[styles.cancelSection, { borderTopColor: theme.backgroundSelected }]}>
                        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: cancellingOrderId === order.id }} onPress={() => setCancellingOrderId((current) => current === order.id ? null : order.id)} style={styles.cancelToggle}>
                          <View style={[styles.cancelCheckbox, { borderColor: cancellingOrderId === order.id ? theme.info : theme.textSecondary, backgroundColor: cancellingOrderId === order.id ? theme.info : 'transparent' }]}><ThemedText style={styles.cancelCheck}>{cancellingOrderId === order.id ? '✓' : ''}</ThemedText></View>
                          <ThemedText style={[styles.cancelLabel, { color: theme.info }]}>Cancelado</ThemedText>
                        </Pressable>
                        {cancellingOrderId === order.id ? <View style={styles.cancelForm}>
                          <TextInput value={cancelReasons[order.id] ?? ''} onChangeText={(value) => setCancelReasons((current) => ({ ...current, [order.id]: value }))} placeholder="Motivo de la cancelación" placeholderTextColor={theme.textSecondary} style={[styles.cancelInput, { borderColor: theme.backgroundSelected, color: theme.text }]} />
                          <Pressable disabled={confirmingCancellationId === order.id || (cancelReasons[order.id]?.trim().length ?? 0) < 3} onPress={() => void confirmCancellation(order)} style={[styles.cancelConfirm, { backgroundColor: theme.info }, (confirmingCancellationId === order.id || (cancelReasons[order.id]?.trim().length ?? 0) < 3) && styles.disabled]}><ThemedText style={styles.cancelConfirmText}>Confirmar</ThemedText></Pressable>
                        </View> : null}
                      </View> : null}
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

function startOfCurrentMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfCurrentWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = start.getDay();
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  return start;
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
  toggleContainer: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  content: { alignSelf: 'center', flexGrow: 1, gap: Spacing.three, maxWidth: MaxContentWidth, padding: Spacing.three, paddingTop: Spacing.one, width: '100%' },
  historyToggle: { alignSelf: 'flex-start', borderRadius: Spacing.two, flexDirection: 'row', height: 38, overflow: 'hidden', padding: 2 },
  toggleOption: { borderRadius: 6, justifyContent: 'center', minWidth: 88, paddingHorizontal: Spacing.two },
  toggleText: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
  toggleTextActive: { color: '#FFFFFF' },
  periodToggle: { borderRadius: Spacing.two, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', overflow: 'hidden' },
  periodOption: { alignItems: 'center', borderRightWidth: StyleSheet.hairlineWidth, height: 38, justifyContent: 'center', width: 38 },
  periodIcon: { fontFamily: 'MaterialSymbols', fontSize: 19, lineHeight: 21, textAlign: 'center' },
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
  orderStatusChip: { alignSelf: 'flex-start', borderRadius: 999, marginTop: 5, paddingHorizontal: 7, paddingVertical: 2 },
  orderStatusChipText: { fontSize: 10, fontWeight: '800' },
  totalBlock: { alignItems: 'flex-end' },
  totalLabel: { fontSize: 10 },
  totalValue: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  chevron: { fontSize: 20, lineHeight: 22 },
  orderDetails: { borderTopWidth: StyleSheet.hairlineWidth, gap: Spacing.one, padding: Spacing.three },
  itemRow: { alignItems: 'center', flexDirection: 'row', minHeight: 36 },
  supplierImage: { borderRadius: 5, height: 30, marginRight: Spacing.one, width: 30 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 13, fontWeight: '700' },
  itemSupplier: { fontSize: 11, marginTop: 1 },
  itemQuantity: { fontSize: 11, marginTop: 1 },
  itemPrice: { fontSize: 12, fontWeight: '700' },
  cancelReason: { borderRadius: Spacing.one, flexDirection: 'row', gap: 5, marginTop: Spacing.one, padding: Spacing.two },
  cancelReasonLabel: { fontSize: 11, fontWeight: '800' },
  cancelReasonText: { flex: 1, fontSize: 11 },
  cancelSection: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: Spacing.one, paddingTop: Spacing.two },
  cancelToggle: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: Spacing.one, minHeight: 32 },
  cancelCheckbox: { alignItems: 'center', borderRadius: 4, borderWidth: 1.5, height: 19, justifyContent: 'center', width: 19 },
  cancelCheck: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  cancelLabel: { fontSize: 12, fontWeight: '700' },
  cancelForm: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one, marginTop: Spacing.one },
  cancelInput: { backgroundColor: '#FFFFFF', borderRadius: Spacing.one, borderWidth: 1, flex: 1, fontSize: 12, minHeight: 38, paddingHorizontal: Spacing.two },
  cancelConfirm: { alignItems: 'center', borderRadius: Spacing.one, justifyContent: 'center', minHeight: 34, paddingHorizontal: Spacing.two },
  cancelConfirmText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  totalsRow: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.one, paddingTop: Spacing.two },
  spentLabel: { fontSize: 12 },
  spentValue: { fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.45 },
});

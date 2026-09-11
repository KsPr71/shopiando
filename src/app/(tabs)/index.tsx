import { MaterialSymbols_400Regular } from "@expo-google-fonts/material-symbols";
import { useFonts } from "expo-font";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoginScreen } from "@/components/login-screen";
import { SideMenu } from "@/components/side-menu";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/hooks/use-theme";
import {
  getAssignedPurchaseOrders,
  setPurchaseItemPurchased,
  type AssignedPurchaseOrder,
} from "@/services/assigned-purchase-orders";
import { playNotificationSound } from "@/services/notification-sound";
import {
  clearReadOrderNotifications,
  getOrderNotifications,
  markOrderNotificationsRead,
  subscribeToOrderNotifications,
  syncOrderNotificationsFromSupabase,
  type OrderNotification,
} from "@/services/order-notifications";
import {
  getCachedProducts,
  getProducts,
  subscribeToLocalProductCatalogChanges,
  subscribeToProductCatalog,
  type Product,
} from "@/services/product-catalog";
import { getLocalProfile, type LocalProfile } from "@/services/profile-storage";
import {
  subscribeToPurchaseOrders,
  syncPurchaseOrdersFromSupabase,
  syncPurchaseOrdersToSupabase,
} from "@/services/purchase-order-sync";
import { subscribeToPurchaseSummaryChanges } from "@/services/purchase-summary";

const COMPLETED_ORDER_DISPLAY_MS = 6000;

export default function HomeScreen() {
  const [symbolsLoaded] = useFonts({
    MaterialSymbols: MaterialSymbols_400Regular,
  });
  const { isReady, user, signOut } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [localProfile, setLocalProfile] = useState<LocalProfile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [assignedOrders, setAssignedOrders] = useState<AssignedPurchaseOrder[]>(
    [],
  );
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>(
    {},
  );
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [purchasedFeedbackItemIds, setPurchasedFeedbackItemIds] = useState<
    Record<string, boolean>
  >({});
  const [leavingOrderIds, setLeavingOrderIds] = useState<
    Record<string, boolean>
  >({});
  const [completedOrderIds, setCompletedOrderIds] = useState<
    Record<string, boolean>
  >({});
  const [notifications, setNotifications] = useState<OrderNotification[]>([]);
  const [isNotificationsVisible, setIsNotificationsVisible] = useState(false);
  const deferredOrderSnapshots = useRef(
    new Map<string, AssignedPurchaseOrder>(),
  );
  const feedbackTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const knownNotificationIds = useRef(new Set<string>());
  const hasLoadedNotifications = useRef(false);
  const openMenuGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-24, 24])
        .runOnJS(true)
        .onEnd(({ translationX, velocityX, x }) => {
          const startedAtLeftEdge = x - translationX <= 32;

          if (startedAtLeftEdge && (translationX > 80 || velocityX > 700)) {
            setIsMenuVisible(true);
          }
        }),
    [],
  );

  useEffect(() => {
    if (!user) {
      setLocalProfile(null);
      return;
    }

    let isMounted = true;
    void getLocalProfile(user.id)
      .then((profile) => {
        if (isMounted) {
          setLocalProfile(profile);
        }
      })
      .catch(() => {
        if (isMounted) {
          setLocalProfile(null);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      setAssignedOrders([]);
      return;
    }

    let isMounted = true;
    let isSynchronizing = false;
    const refreshOrders = () => {
      void getAssignedPurchaseOrders(user.id)
        .then((orders) => {
          if (isMounted) {
            setAssignedOrders(() => {
              const deferredOrders = Array.from(
                deferredOrderSnapshots.current.values(),
              );
              const refreshedOrders = orders.filter(
                (order) => !deferredOrderSnapshots.current.has(order.id),
              );
              return [...refreshedOrders, ...deferredOrders];
            });
          }
        })
        .catch(() => {});
    };
    const synchronizeRemoteOrders = () => {
      if (isSynchronizing) {
        return;
      }
      isSynchronizing = true;
      void syncPurchaseOrdersFromSupabase(user.id)
        .catch(() => {})
        .finally(() => {
          isSynchronizing = false;
          refreshOrders();
        });
    };
    void syncPurchaseOrdersToSupabase()
      .then(synchronizeRemoteOrders)
      .finally(refreshOrders);
    refreshOrders();
    const unsubscribeSummary = subscribeToPurchaseSummaryChanges(refreshOrders);
    const unsubscribeRemote = subscribeToPurchaseOrders(
      user.id,
      synchronizeRemoteOrders,
    );
    const syncTimer = setInterval(synchronizeRemoteOrders, 15_000);

    return () => {
      isMounted = false;
      clearInterval(syncTimer);
      unsubscribeSummary();
      unsubscribeRemote();
    };
  }, [user?.id]);

  useEffect(
    () => () => {
      feedbackTimers.current.forEach(clearTimeout);
    },
    [],
  );

  useEffect(() => {
    if (!user) {
      setProducts([]);
      return;
    }

    let isMounted = true;
    const applyProducts = (nextProducts: Product[]) => {
      if (isMounted) {
        setProducts(nextProducts);
      }
    };
    const applyProductChange = (
      change:
        | { type: "upsert"; product: Product }
        | { type: "delete"; productId: string },
    ) => {
      if (!isMounted) {
        return;
      }
      setProducts((currentProducts) =>
        change.type === "delete"
          ? currentProducts.filter((product) => product.id !== change.productId)
          : currentProducts.some((product) => product.id === change.product.id)
            ? currentProducts.map((product) =>
                product.id === change.product.id ? change.product : product,
              )
            : [change.product, ...currentProducts],
      );
    };

    void getCachedProducts()
      .then(applyProducts)
      .catch(() => {});
    void getProducts()
      .then(applyProducts)
      .catch(() => {});
    const refreshTimer = setInterval(() => {
      void getProducts()
        .then(applyProducts)
        .catch(() => {});
    }, 12_000);
    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeToProductCatalog(applyProductChange, () => {});
    } catch {}
    const unsubscribeLocal =
      subscribeToLocalProductCatalogChanges(applyProductChange);

    return () => {
      isMounted = false;
      clearInterval(refreshTimer);
      unsubscribe();
      unsubscribeLocal();
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    let isMounted = true;
    const refreshNotifications = (playSound = false) => {
      void getOrderNotifications(user.id)
        .then((nextNotifications) => {
          if (isMounted) {
            const hasNewNotification =
              hasLoadedNotifications.current &&
              nextNotifications.some(
                (notification) =>
                  !knownNotificationIds.current.has(notification.id),
              );
            knownNotificationIds.current = new Set(
              nextNotifications.map((notification) => notification.id),
            );
            hasLoadedNotifications.current = true;
            setNotifications(nextNotifications);
            if (playSound && hasNewNotification) {
              void playNotificationSound();
            }
          }
        })
        .catch(() => {});
    };
    void syncOrderNotificationsFromSupabase(user.id)
      .catch(() => {})
      .finally(() => refreshNotifications());
    refreshNotifications();
    const syncTimer = setInterval(() => {
      void syncOrderNotificationsFromSupabase(user.id)
        .catch(() => {})
        .finally(() => refreshNotifications(true));
    }, 15_000);
    const unsubscribe = subscribeToOrderNotifications(user.id, () =>
      refreshNotifications(true),
    );
    return () => {
      isMounted = false;
      clearInterval(syncTimer);
      unsubscribe();
    };
  }, [user?.id]);

  if (!isReady) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const displayName =
    localProfile?.fullName.trim() ||
    String(
      user.user_metadata.full_name ??
        user.user_metadata.name ??
        user.email?.split("@")[0] ??
        "Usuario",
    );
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((name) => name[0])
    .join("")
    .toUpperCase();
  const greeting =
    localProfile?.gender === "female" ? "Bienvenida" : "Bienvenido";
  const availableProducts = products.filter(
    (product) => product.isAvailable,
  ).length;
  const availabilityPercent = products.length
    ? Math.round((availableProducts / products.length) * 100)
    : 0;
  const assignedOrderCount = assignedOrders.length;
  const pendingProductCount = assignedOrders.reduce(
    (total, order) =>
      total +
      order.items.reduce(
        (itemTotal, item) => itemTotal + (item.isPurchased ? 0 : 1),
        0,
      ),
    0,
  );
  const unreadNotifications = notifications.filter(
    (notification) => !notification.readAt,
  ).length;

  async function togglePurchaseItem(
    order: AssignedPurchaseOrder,
    itemId: string,
    isPurchased: boolean,
  ) {
    const completesOrder =
      !isPurchased &&
      order.items.every((item) => item.id === itemId || item.isPurchased);
    if (completesOrder) {
      deferredOrderSnapshots.current.set(order.id, {
        ...order,
        items: order.items.map((item) =>
          item.id === itemId ? { ...item, isPurchased: true } : item,
        ),
      });
    }
    setUpdatingItemId(itemId);
    setAssignedOrders((currentOrders) =>
      currentOrders.map((currentOrder) =>
        currentOrder.id === order.id
          ? {
              ...currentOrder,
              items: currentOrder.items.map((item) =>
                item.id === itemId
                  ? { ...item, isPurchased: !isPurchased }
                  : item,
              ),
            }
          : currentOrder,
      ),
    );
    let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
    if (!isPurchased) {
      setPurchasedFeedbackItemIds((current) => ({
        ...current,
        [itemId]: true,
      }));
      setExpandedOrders((current) => ({ ...current, [order.id]: true }));
      if (completesOrder) {
        setCompletedOrderIds((current) => ({ ...current, [order.id]: true }));
      }
      feedbackTimer = setTimeout(() => {
        setPurchasedFeedbackItemIds((current) => ({
          ...current,
          [itemId]: false,
        }));
        if (completesOrder) {
          setLeavingOrderIds((current) => ({ ...current, [order.id]: true }));
        }
      }, COMPLETED_ORDER_DISPLAY_MS);
      feedbackTimers.current.push(feedbackTimer);
    }
    try {
      await setPurchaseItemPurchased(order.id, itemId, !isPurchased);
    } catch {
      if (feedbackTimer) {
        clearTimeout(feedbackTimer);
      }
      deferredOrderSnapshots.current.delete(order.id);
      setAssignedOrders((currentOrders) =>
        currentOrders.map((currentOrder) =>
          currentOrder.id === order.id
            ? {
                ...currentOrder,
                items: currentOrder.items.map((item) =>
                  item.id === itemId ? { ...item, isPurchased } : item,
                ),
              }
            : currentOrder,
        ),
      );
      setPurchasedFeedbackItemIds((current) => ({
        ...current,
        [itemId]: false,
      }));
      setCompletedOrderIds((current) => ({ ...current, [order.id]: false }));
      setLeavingOrderIds((current) => ({ ...current, [order.id]: false }));
    } finally {
      setUpdatingItemId(null);
    }
  }

  function removeCompletedOrder(orderId: string) {
    deferredOrderSnapshots.current.delete(orderId);
    setAssignedOrders((currentOrders) =>
      currentOrders.filter((order) => order.id !== orderId),
    );
    setLeavingOrderIds((current) => ({ ...current, [orderId]: false }));
    setCompletedOrderIds((current) => ({ ...current, [orderId]: false }));
    if (user) {
      void getAssignedPurchaseOrders(user.id)
        .then(setAssignedOrders)
        .catch(() => {});
    }
  }

  async function openNotifications() {
    setIsNotificationsVisible(true);
    if (user && notifications.some((notification) => !notification.readAt)) {
      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          readAt: notification.readAt ?? new Date().toISOString(),
        })),
      );
      await markOrderNotificationsRead(user.id).catch(() => {});
    }
  }

  async function clearReadNotifications() {
    if (!user) {
      return;
    }
    try {
      await clearReadOrderNotifications(user.id);
      setNotifications((current) =>
        current.filter((notification) => !notification.readAt),
      );
    } catch {}
  }

  return (
    <GestureDetector gesture={openMenuGesture}>
      <View style={styles.gestureContainer}>
        <ThemedView style={styles.container}>
          <SafeAreaView style={styles.safeArea}>
            <ScrollView
              contentContainerStyle={styles.homeContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.topControls}>
                <Pressable
                  accessibilityLabel="Abrir menú"
                  accessibilityRole="button"
                  onPress={() => setIsMenuVisible(true)}
                  style={styles.iconButton}
                >
                  <ThemedText style={styles.materialIcon}>
                    {symbolsLoaded ? "menu" : "☰"}
                  </ThemedText>
                </Pressable>
                <Pressable
                  accessibilityLabel="Notificaciones"
                  accessibilityRole="button"
                  onPress={() => void openNotifications()}
                  style={styles.iconButton}
                >
                  <ThemedText style={styles.materialIcon}>
                    {symbolsLoaded ? "notifications_none" : "◦"}
                  </ThemedText>
                  {unreadNotifications ? (
                    <View
                      style={[
                        styles.notificationBadge,
                        { backgroundColor: theme.primary },
                      ]}
                    >
                      <ThemedText style={styles.notificationBadgeText}>
                        {unreadNotifications > 9 ? "9+" : unreadNotifications}
                      </ThemedText>
                    </View>
                  ) : null}
                </Pressable>
              </View>

              <View style={styles.profileRow}>
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: theme.backgroundElement },
                  ]}
                >
                  {localProfile?.avatarUri ? (
                    <Image
                      source={{ uri: localProfile.avatarUri }}
                      style={styles.avatarImage}
                    />
                  ) : (
                    <ThemedText
                      style={[styles.avatarInitials, { color: theme.primary }]}
                    >
                      {initials}
                    </ThemedText>
                  )}
                </View>
                <View style={styles.greetingBlock}>
                  <ThemedText
                    themeColor="textSecondary"
                    style={styles.greeting}
                  >
                    {greeting},
                  </ThemedText>
                  <View style={styles.nameRow}>
                    <ThemedText style={styles.name}>{displayName}</ThemedText>
                    <View
                      style={[
                        styles.verifiedDot,
                        { backgroundColor: theme.primary },
                      ]}
                    />
                  </View>
                  <ThemedText
                    themeColor="textSecondary"
                    style={styles.greetingCopy}
                  >
                    Organiza tus compras de forma simple.
                  </ThemedText>
                </View>
              </View>

              <View
                style={[
                  styles.overviewPanel,
                  { backgroundColor: theme.primary },
                ]}
              >
                <View style={styles.overviewCopy}>
                  <ThemedText style={styles.overviewTitle}>
                    Tu resumen de compras
                  </ThemedText>
                  <ThemedText style={styles.overviewText}>
                    Gestiona productos, pedidos y responsables.
                  </ThemedText>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push("/products")}
                    style={styles.overviewButton}
                  >
                    <ThemedText
                      style={[
                        styles.overviewButtonText,
                        { color: theme.primary },
                      ]}
                    >
                      Ver productos
                    </ThemedText>
                  </Pressable>
                </View>
                <View style={styles.overviewScore}>
                  <View style={styles.overviewScoreInner}>
                    <ThemedText style={styles.overviewScoreValue}>
                      {availabilityPercent}%
                    </ThemedText>
                    <ThemedText style={styles.overviewScoreLabel}>
                      DISPONIBLE
                    </ThemedText>
                  </View>
                </View>
              </View>

              <View style={styles.metricsRow}>
                <Metric
                  icon="receipt_long"
                  label="Asignados"
                  value={String(assignedOrderCount)}
                  symbolsLoaded={symbolsLoaded}
                />
                <Metric
                  icon="shopping_bag"
                  label="Pendientes"
                  value={String(pendingProductCount)}
                  symbolsLoaded={symbolsLoaded}
                />
                <Metric
                  icon="inventory_2"
                  label="Productos"
                  value={String(products.length)}
                  symbolsLoaded={symbolsLoaded}
                />
                <Metric
                  icon="check_circle"
                  label="Disponibles"
                  value={String(availableProducts)}
                  symbolsLoaded={symbolsLoaded}
                />
              </View>

              <View style={styles.ordersSection}>
                <ThemedText style={styles.ordersTitle}>
                  Pedidos pendientes
                </ThemedText>
                {!assignedOrders.length ? (
                  <ThemedText
                    themeColor="textSecondary"
                    style={styles.emptyOrders}
                  >
                    No tienes pedidos pendientes asignados.
                  </ThemedText>
                ) : null}
                {assignedOrders.map((order) => {
                  const isExpanded = expandedOrders[order.id] ?? false;
                  const isCompleted =
                    completedOrderIds[order.id] ||
                    order.items.every((item) => item.isPurchased);
                  const requesterInitial = order.requesterName
                    .trim()
                    .charAt(0)
                    .toUpperCase();
                  return (
                    <AnimatedOrderCard
                      key={order.id}
                      isLeaving={leavingOrderIds[order.id] ?? false}
                      onHidden={() => removeCompletedOrder(order.id)}
                    >
                      <ThemedView
                        type="backgroundElement"
                        style={[
                          styles.orderCard,
                          { borderColor: theme.primary },
                        ]}
                      >
                        <Pressable
                          accessibilityRole="button"
                          onPress={() =>
                            setExpandedOrders((current) => ({
                              ...current,
                              [order.id]: !isExpanded,
                            }))
                          }
                          style={styles.orderHeader}
                        >
                          <View
                            style={[
                              styles.requesterAvatar,
                              { backgroundColor: theme.secondary },
                            ]}
                          >
                            {order.requesterAvatarUri ? (
                              <Image
                                source={{ uri: order.requesterAvatarUri }}
                                style={styles.requesterAvatarImage}
                              />
                            ) : (
                              <ThemedText
                                style={[
                                  styles.requesterInitial,
                                  { color: theme.text },
                                ]}
                              >
                                {requesterInitial}
                              </ThemedText>
                            )}
                          </View>
                          <View style={styles.orderInfo}>
                            <ThemedText style={styles.requesterName}>
                              {order.requesterName}
                            </ThemedText>
                            <ThemedText
                              themeColor="textSecondary"
                              style={styles.orderDate}
                            >
                              {formatOrderDate(order.createdAt)}
                            </ThemedText>
                            <View
                              style={[
                                styles.orderStatusChip,
                                {
                                  backgroundColor: isCompleted
                                    ? "#DDF5E8"
                                    : "#FFF1CC",
                                },
                              ]}
                            >
                              <ThemedText
                                style={[
                                  styles.orderStatusChipText,
                                  {
                                    color: isCompleted
                                      ? theme.success
                                      : "#9A6700",
                                  },
                                ]}
                              >
                                {isCompleted ? "Terminado" : "Pendiente"}
                              </ThemedText>
                            </View>
                          </View>
                          <View style={styles.orderTotal}>
                            <ThemedText
                              themeColor="textSecondary"
                              style={styles.orderTotalLabel}
                            >
                              Total
                            </ThemedText>
                            <ThemedText style={styles.orderTotalValue}>
                              {formatPrice(order.budgetTotalCents)}
                            </ThemedText>
                          </View>
                          <ThemedText style={styles.orderChevron}>
                            {symbolsLoaded
                              ? isExpanded
                                ? "expand_less"
                                : "expand_more"
                              : "•"}
                          </ThemedText>
                        </Pressable>
                        {completedOrderIds[order.id] ? (
                          <View
                            style={[
                              styles.completedOrderFeedback,
                              { backgroundColor: theme.success },
                            ]}
                          >
                            <ThemedText
                              style={styles.completedOrderFeedbackText}
                            >
                              Pedido completado
                            </ThemedText>
                          </View>
                        ) : null}
                        {isExpanded ? (
                          <View
                            style={[
                              styles.orderDetails,
                              { borderTopColor: theme.backgroundSelected },
                            ]}
                          >
                            <View style={styles.orderBudgetRow}>
                              <View>
                                <ThemedText
                                  themeColor="textSecondary"
                                  style={styles.budgetLabel}
                                >
                                  Presupuesto
                                </ThemedText>
                                <ThemedText style={styles.budgetValue}>
                                  {formatPrice(order.budgetTotalCents)}
                                </ThemedText>
                              </View>
                              <View>
                                <ThemedText
                                  themeColor="textSecondary"
                                  style={styles.budgetLabel}
                                >
                                  Gastado
                                </ThemedText>
                                <ThemedText
                                  style={[
                                    styles.budgetValue,
                                    { color: theme.success },
                                  ]}
                                >
                                  {formatPrice(order.invoicedTotalCents)}
                                </ThemedText>
                              </View>
                            </View>
                            {order.items.map((item) => (
                              <Pressable
                                key={item.id}
                                accessibilityRole="checkbox"
                                accessibilityState={{
                                  checked: item.isPurchased,
                                  disabled: updatingItemId === item.id,
                                }}
                                disabled={updatingItemId === item.id}
                                onPress={() =>
                                  togglePurchaseItem(
                                    order,
                                    item.id,
                                    item.isPurchased,
                                  )
                                }
                                style={styles.orderItem}
                              >
                                <View
                                  style={[
                                    styles.purchaseCheckbox,
                                    {
                                      borderColor: item.isPurchased
                                        ? theme.success
                                        : theme.textSecondary,
                                      backgroundColor: item.isPurchased
                                        ? theme.success
                                        : "transparent",
                                    },
                                  ]}
                                >
                                  <ThemedText style={styles.checkboxIcon}>
                                    {item.isPurchased ? "✓" : ""}
                                  </ThemedText>
                                </View>
                                <View style={styles.orderItemInfo}>
                                  <ThemedText
                                    style={[
                                      styles.orderItemName,
                                      item.isPurchased && styles.purchasedItem,
                                    ]}
                                  >
                                    {item.name}
                                  </ThemedText>
                                  <ThemedText
                                    themeColor="textSecondary"
                                    style={styles.orderItemSupplier}
                                  >
                                    {item.supplierName}
                                  </ThemedText>
                                  <ThemedText
                                    themeColor="textSecondary"
                                    style={styles.orderItemQuantity}
                                  >
                                    {formatQuantity(item.quantity)} unidades
                                  </ThemedText>
                                  {purchasedFeedbackItemIds[item.id] ? (
                                    <ThemedText
                                      style={[
                                        styles.purchasedFeedback,
                                        { color: theme.success },
                                      ]}
                                    >
                                      Producto comprado
                                    </ThemedText>
                                  ) : null}
                                </View>
                                <ThemedText
                                  themeColor="textSecondary"
                                  style={styles.orderItemPrice}
                                >
                                  {formatPrice(
                                    item.estimatedUnitPriceCents *
                                      item.quantity,
                                  )}
                                </ThemedText>
                              </Pressable>
                            ))}
                          </View>
                        ) : null}
                      </ThemedView>
                    </AnimatedOrderCard>
                  );
                })}
              </View>
            </ScrollView>
          </SafeAreaView>
          <SideMenu
            onClose={() => setIsMenuVisible(false)}
            onSignOut={signOut}
            userEmail={user.email}
            visible={isMenuVisible}
          />
          <Modal
            animationType="fade"
            transparent
            visible={isNotificationsVisible}
            onRequestClose={() => setIsNotificationsVisible(false)}
          >
            <Pressable
              onPress={() => setIsNotificationsVisible(false)}
              style={styles.notificationsOverlay}
            >
              <View
                style={[
                  styles.notificationsPanel,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <View style={styles.notificationsPanelHeader}>
                  <ThemedText style={styles.notificationsTitle}>
                    Notificaciones
                  </ThemedText>
                  <View style={styles.notificationsHeaderActions}>
                    {notifications.some(
                      (notification) => notification.readAt,
                    ) ? (
                      <Pressable
                        accessibilityLabel="Eliminar notificaciones leídas"
                        onPress={() => void clearReadNotifications()}
                        style={styles.clearNotificationsButton}
                      >
                        <ThemedText
                          style={[
                            styles.clearNotificationsText,
                            { color: theme.primary },
                          ]}
                        >
                          Limpiar leídas
                        </ThemedText>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityLabel="Cerrar notificaciones"
                      onPress={() => setIsNotificationsVisible(false)}
                      style={styles.notificationsClose}
                    >
                      <ThemedText style={styles.materialIcon}>
                        {symbolsLoaded ? "close" : "x"}
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
                {!notifications.length ? (
                  <ThemedText
                    themeColor="textSecondary"
                    style={styles.emptyNotifications}
                  >
                    No tienes notificaciones.
                  </ThemedText>
                ) : (
                  notifications.map((notification) => (
                    <View
                      key={notification.id}
                      style={[
                        styles.notificationItem,
                        { borderBottomColor: theme.backgroundSelected },
                      ]}
                    >
                      <View
                        style={[
                          styles.notificationDot,
                          { backgroundColor: theme.primary },
                        ]}
                      />
                      <View style={styles.notificationCopy}>
                        <ThemedText style={styles.notificationTitle}>
                          {notification.title}
                        </ThemedText>
                        <ThemedText
                          themeColor="textSecondary"
                          style={styles.notificationBody}
                        >
                          {notification.body}
                        </ThemedText>
                        <ThemedText
                          themeColor="textSecondary"
                          style={styles.notificationDate}
                        >
                          {formatOrderDate(notification.createdAt)}
                        </ThemedText>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </Pressable>
          </Modal>
        </ThemedView>
      </View>
    </GestureDetector>
  );
}

function Metric({
  icon,
  label,
  value,
  symbolsLoaded,
}: {
  icon: string;
  label: string;
  value: string;
  symbolsLoaded: boolean;
}) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={styles.metricCard}>
      <ThemedText style={[styles.metricIcon, { color: theme.primary }]}>
        {symbolsLoaded ? icon : "•"}
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.metricLabel}>
        {label}
      </ThemedText>
      <ThemedText style={styles.metricValue}>{value}</ThemedText>
    </ThemedView>
  );
}

function formatOrderDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }
  return new Intl.DateTimeFormat("es-CU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatQuantity(quantity: number) {
  return Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toFixed(2).replace(/\.00$/, "");
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function AnimatedOrderCard({
  children,
  isLeaving,
  onHidden,
}: {
  children: ReactNode;
  isLeaving: boolean;
  onHidden: () => void;
}) {
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isLeaving) {
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -12,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        onHidden();
      }
    });
  }, [isLeaving, onHidden, opacity, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  gestureContainer: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignSelf: "center",
    width: "100%",
    maxWidth: MaxContentWidth,
  },
  homeContent: {
    gap: Spacing.three,
    paddingBottom: Spacing.six,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
  },
  topControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  profileRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.three,
  },
  avatar: {
    alignItems: "center",
    borderRadius: 34,
    height: 68,
    justifyContent: "center",
    overflow: "hidden",
    width: 68,
  },
  avatarImage: {
    height: "100%",
    width: "100%",
  },
  avatarInitials: {
    fontSize: 22,
    fontWeight: "800",
  },
  greetingBlock: {
    flex: 1,
    gap: 2,
  },
  greeting: { fontSize: 12, fontWeight: "600" },
  nameRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  name: { fontSize: 20, fontWeight: "800" },
  verifiedDot: {
    borderColor: "#FFFFFF",
    borderRadius: 6,
    borderWidth: 2,
    height: 12,
    width: 12,
  },
  greetingCopy: { fontSize: 12 },
  iconButton: {
    alignItems: "center",
    justifyContent: "center",
    height: 38,
    width: 38,
  },
  notificationBadge: {
    alignItems: "center",
    borderRadius: 9,
    justifyContent: "center",
    minWidth: 18,
    paddingHorizontal: 4,
    position: "absolute",
    right: 1,
    top: 1,
  },
  notificationBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 18,
  },
  notificationsOverlay: {
    backgroundColor: "rgba(16, 24, 40, 0.28)",
    flex: 1,
    justifyContent: "flex-start",
    paddingHorizontal: Spacing.three,
    paddingTop: 70,
  },
  notificationsPanel: {
    borderRadius: Spacing.three,
    maxHeight: "72%",
    padding: Spacing.three,
    boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.16)",
  },
  notificationsPanelHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.two,
  },
  notificationsHeaderActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.one,
  },
  clearNotificationsButton: {
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.one,
  },
  clearNotificationsText: { fontSize: 12, fontWeight: "800" },
  notificationsTitle: { fontSize: 18, fontWeight: "800" },
  notificationsClose: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  emptyNotifications: { fontSize: 13, paddingVertical: Spacing.two },
  notificationItem: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  notificationDot: { borderRadius: 4, height: 8, marginTop: 5, width: 8 },
  notificationCopy: { flex: 1 },
  notificationTitle: { fontSize: 14, fontWeight: "800" },
  notificationBody: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  notificationDate: { fontSize: 10, marginTop: 4 },
  materialIcon: {
    fontFamily: "MaterialSymbols",
    fontSize: 23,
    lineHeight: 26,
    textAlign: "center",
  },
  overviewPanel: {
    borderRadius: Spacing.three,
    flexDirection: "row",
    minHeight: 150,
    overflow: "hidden",
    padding: Spacing.three,
  },
  overviewCopy: { flex: 1, justifyContent: "center" },
  overviewTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  overviewText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
    maxWidth: 190,
  },
  overviewButton: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginTop: Spacing.three,
    paddingHorizontal: Spacing.two,
    paddingVertical: 7,
  },
  overviewButtonText: { fontSize: 12, fontWeight: "800" },
  overviewScore: {
    alignItems: "center",
    borderColor: "#6BCBFF",
    borderRadius: 45,
    borderWidth: 7,
    height: 90,
    justifyContent: "center",
    marginLeft: Spacing.two,
    width: 90,
  },
  overviewScoreInner: { alignItems: "center" },
  overviewScoreValue: { color: "#FFFFFF", fontSize: 20, fontWeight: "800" },
  overviewScoreLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 9,
    fontWeight: "800",
  },
  metricsRow: { flexDirection: "row", gap: Spacing.one },
  metricCard: {
    alignItems: "center",
    borderRadius: Spacing.two,
    flex: 1,
    gap: 2,
    minHeight: 83,
    justifyContent: "center",
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.two,
  },
  metricIcon: { fontFamily: "MaterialSymbols", fontSize: 22, lineHeight: 24 },
  metricLabel: { fontSize: 10, textAlign: "center" },
  metricValue: { fontSize: 11, fontWeight: "800", textAlign: "center" },
  ordersSection: { gap: Spacing.two, marginTop: Spacing.one },
  ordersTitle: { fontSize: 18, fontWeight: "800" },
  emptyOrders: { fontSize: 13, paddingVertical: Spacing.two },
  orderCard: {
    backgroundColor: "#FFFCF5",
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  completedOrderFeedback: {
    alignItems: "center",
    marginHorizontal: Spacing.three,
    marginTop: -Spacing.one,
    borderRadius: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
  },
  completedOrderFeedbackText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  orderHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.two,
    padding: Spacing.three,
  },
  requesterAvatar: {
    alignItems: "center",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    overflow: "hidden",
    width: 40,
  },
  requesterAvatarImage: { height: "100%", width: "100%" },
  requesterInitial: { fontSize: 15, fontWeight: "800" },
  orderInfo: { flex: 1, minWidth: 0 },
  requesterName: { fontSize: 14, fontWeight: "800" },
  orderDate: { fontSize: 11, marginTop: 2 },
  orderStatusChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    marginTop: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  orderStatusChipText: { fontSize: 10, fontWeight: "800" },
  orderTotal: { alignItems: "flex-end" },
  orderTotalLabel: { fontSize: 10 },
  orderTotalValue: { fontSize: 14, fontWeight: "800", marginTop: 2 },
  orderChevron: { fontFamily: "MaterialSymbols", fontSize: 22, lineHeight: 24 },
  orderDetails: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    paddingTop: Spacing.two,
  },
  orderBudgetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.two,
  },
  budgetLabel: { fontSize: 11 },
  budgetValue: { fontSize: 15, fontWeight: "800", marginTop: 2 },
  orderItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.two,
    minHeight: 48,
  },
  purchaseCheckbox: {
    alignItems: "center",
    borderRadius: 6,
    borderWidth: 1.5,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  checkboxIcon: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 16,
  },
  orderItemInfo: { flex: 1, minWidth: 0 },
  orderItemName: { fontSize: 13, fontWeight: "700" },
  orderItemSupplier: { fontSize: 11, marginTop: 1 },
  purchasedItem: { textDecorationLine: "line-through" },
  purchasedFeedback: { fontSize: 11, fontWeight: "700", marginTop: 2 },
  orderItemQuantity: { fontSize: 11, marginTop: 1 },
  orderItemPrice: { fontSize: 12, fontWeight: "700" },
});

import { MaterialSymbols_400Regular } from "@expo-google-fonts/material-symbols";
import { useFonts } from "expo-font";
import { Tabs } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  type ColorValue,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/auth-context";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  getCachedWarehouseInventory,
  getWarehouseInventory,
  subscribeToWarehouseInventory,
} from "@/services/warehouse-inventory";
import {
  getCachedProducts,
  getProducts,
  subscribeToProductCatalog,
} from "@/services/product-catalog";

const tabIcons: Record<string, string> = {
  index: "home",
  explore: "warehouse",
  products: "shopping_cart",
  orders: "receipt_long",
};

export default function AppTabs() {
  const { user } = useAuth();
  const [tabBounce, setTabBounce] = useState({ id: 0, route: "" });
  const [warehouseItemCount, setWarehouseItemCount] = useState(0);
  const [availableProductCount, setAvailableProductCount] = useState(0);
  const [symbolsLoaded] = useFonts({
    MaterialSymbols: MaterialSymbols_400Regular,
  });
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!user) {
      setWarehouseItemCount(0);
      setAvailableProductCount(0);
      return;
    }

    let isMounted = true;
    const refreshWarehouseCount = () => {
      void getWarehouseInventory()
        .then(({ items }) => isMounted && setWarehouseItemCount(items.length))
        .catch(() => {});
    };
    const refreshProductCount = () => {
      void getProducts()
        .then((products) => isMounted && setAvailableProductCount(products.filter((product) => product.isAvailable).length))
        .catch(() => {});
    };

    void getCachedWarehouseInventory().then(({ items }) => isMounted && setWarehouseItemCount(items.length)).catch(() => {});
    void getCachedProducts().then((products) => isMounted && setAvailableProductCount(products.filter((product) => product.isAvailable).length)).catch(() => {});
    refreshWarehouseCount();
    refreshProductCount();

    const unsubscribeWarehouse = subscribeToWarehouseInventory(refreshWarehouseCount, () => {});
    const unsubscribeProducts = subscribeToProductCatalog(refreshProductCount, () => {});
    return () => {
      isMounted = false;
      unsubscribeWarehouse();
      unsubscribeProducts();
    };
  }, [user]);

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveBackgroundColor: "transparent",
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarPressColor: "transparent",
        tabBarButton: ({ onPress, ref: _ref, ...buttonProps }) => (
          <Pressable
            {...buttonProps}
            android_ripple={{ color: "transparent" }}
            onPress={(event) => {
              setTabBounce((previous) => ({
                id: previous.id + 1,
                route: route.name,
              }));
              onPress?.(event);
            }}
          />
        ),
        tabBarItemStyle: { height: 52, marginHorizontal: 4, marginVertical: 6 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700", marginTop: 4 },
        tabBarStyle: user
          ? {
              backgroundColor: colors.background,
              borderTopColor: colors.backgroundSelected,
              height: 62 + insets.bottom,
              paddingBottom: Math.max(insets.bottom, 8),
              paddingTop: 4,
              paddingLeft: 30,
              paddingRight: 30,
            }
          : { display: "none" },
        tabBarIcon: ({ color, focused }) => (
          <AnimatedTabIcon
            color={color}
            focused={focused}
            icon={tabIcons[route.name] ?? "circle"}
            primaryColor={colors.primary}
            symbolsLoaded={symbolsLoaded}
            bounceId={tabBounce.route === route.name ? tabBounce.id : 0}
            badgeCount={route.name === "explore" ? warehouseItemCount : route.name === "products" ? availableProductCount : 0}
          />
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="explore" options={{ title: "Almacén" }} />
      <Tabs.Screen name="products" options={{ title: "Productos" }} />
      <Tabs.Screen name="orders" options={{ title: "Mis pedidos" }} />
    </Tabs>
  );
}

function AnimatedTabIcon({
  color,
  focused,
  icon,
  primaryColor,
  symbolsLoaded,
  bounceId,
  badgeCount,
}: {
  color: ColorValue;
  focused: boolean;
  icon: string;
  primaryColor: string;
  symbolsLoaded: boolean;
  bounceId: number;
  badgeCount: number;
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    translateY.stopAnimation();
    scale.stopAnimation();

    if (!bounceId) {
      return;
    }

    translateY.setValue(0);
    scale.setValue(1);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(translateY, {
          duration: 110,
          toValue: -9,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          duration: 110,
          toValue: 1.08,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.spring(translateY, {
          damping: 7,
          stiffness: 220,
          toValue: 0,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          damping: 7,
          stiffness: 220,
          toValue: 1,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [bounceId, scale, translateY]);

  return (
    <Animated.View style={{ transform: [{ translateY }, { scale }] }}>
      <View
        style={
          focused
            ? {
                alignItems: "center",
                backgroundColor: primaryColor,
                borderRadius: 16,
                height: 32,
                justifyContent: "center",
                width: 52,
              }
            : undefined
        }
      >
        <Text
          style={{
            color: focused ? "#FFFFFF" : color,
            fontFamily: symbolsLoaded ? "MaterialSymbols" : undefined,
            fontSize: 20,
            lineHeight: 22,
          }}
        >
          {symbolsLoaded ? icon : "•"}
        </Text>
      </View>
      {badgeCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badgeCount > 99 ? "99+" : badgeCount}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = {
  badge: {
    alignItems: "center" as const,
    backgroundColor: "#E05252",
    borderColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1.5,
    justifyContent: "center" as const,
    minWidth: 18,
    paddingHorizontal: 3,
    position: "absolute" as const,
    right: -9,
    top: -6,
  },
  badgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800" as const, lineHeight: 16 },
};

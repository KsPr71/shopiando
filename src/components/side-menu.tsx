import { useEffect, useRef, useState } from 'react';
import { MaterialSymbols_400Regular } from '@expo-google-fonts/material-symbols';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import {
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { getLocalProfile, type LocalProfile } from '@/services/profile-storage';
import { getDirectoryUsers } from '@/services/user-directory';

type SideMenuProps = {
  visible: boolean;
  userEmail?: string;
  onClose: () => void;
  onSignOut: () => Promise<void>;
};

export function SideMenu({ visible, userEmail, onClose, onSignOut }: SideMenuProps) {
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const panelWidth = Math.min(320, width * 0.84);
  const translateX = useRef(new Animated.Value(-320)).current;
  const [isMounted, setIsMounted] = useState(visible);
  const [localProfile, setLocalProfile] = useState<LocalProfile | null>(null);
  const [directoryName, setDirectoryName] = useState<string | null>(null);
  const [failedAvatarUri, setFailedAvatarUri] = useState<string | null>(null);
  const [symbolsLoaded] = useFonts({ MaterialSymbols: MaterialSymbols_400Regular });
  const closeGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-24, 24])
    .runOnJS(true)
    .onEnd(({ translationX, velocityX }) => {
      if (translationX < -80 || velocityX < -700) {
        onClose();
      }
    });

  useEffect(() => {
    let frameId: number | undefined;
    const animation = Animated.timing(translateX, {
      toValue: visible ? 0 : -panelWidth,
      duration: 240,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });

    if (visible) {
      setIsMounted(true);
      translateX.setValue(-panelWidth);
      frameId = requestAnimationFrame(() => animation.start());
    } else if (isMounted) {
      animation.start(({ finished }) => {
        if (finished) {
          setIsMounted(false);
        }
      });
    }

    return () => {
      if (frameId !== undefined) {
        cancelAnimationFrame(frameId);
      }
      animation.stop();
    };
  }, [isMounted, panelWidth, translateX, visible]);

  useEffect(() => {
    if (!visible || !user) {
      return;
    }

    let isMounted = true;
    setLocalProfile(null);
    setDirectoryName(null);
    getLocalProfile(user.id)
      .then((profile) => {
        if (isMounted) {
          setLocalProfile(profile);
          setFailedAvatarUri(null);
        }
      })
      .catch(() => {
        if (isMounted) {
          setLocalProfile(null);
        }
      });
    getDirectoryUsers()
      .then((profiles) => {
        if (isMounted) {
          setDirectoryName(profiles.find((profile) => profile.id === user.id)?.name ?? null);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [user, visible]);

  function navigate(path: '/' | '/explore' | '/products' | '/orders' | '/profile') {
    router.replace(path);
    onClose();
  }

  async function handleSignOut() {
    onClose();
    await onSignOut();
  }

  if (!isMounted) {
    return null;
  }

  const displayName = directoryName?.trim()
    || localProfile?.fullName.trim()
    || String(user?.user_metadata.full_name ?? user?.user_metadata.name ?? '')
    || user?.email?.split('@')[0]
    || 'Usuario';
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  const avatarUri = localProfile?.avatarUri ?? null;
  const showAvatar = Boolean(avatarUri && avatarUri !== failedAvatarUri);
  const avatarSource = avatarUri ? { uri: avatarUri } : undefined;
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.modal}>
        <Pressable
          accessibilityLabel="Cerrar menú"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
        />
        <GestureDetector gesture={closeGesture}>
          <Animated.View
            style={[
              styles.panel,
              { width: panelWidth, backgroundColor: theme.background, transform: [{ translateX }] },
            ]}>
            <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
              <View style={[styles.hero, { backgroundColor: theme.primary }]}>
                <Pressable
                  accessibilityLabel="Cerrar menú"
                  accessibilityRole="button"
                  onPress={onClose}
                  style={styles.closeButton}>
                  <ThemedText style={styles.closeText}>×</ThemedText>
                </Pressable>
                <View style={styles.heroContent}>
                  <View style={[styles.avatar, { borderColor: theme.secondary }]}>
                    {showAvatar ? (
                      <Image
                        onError={() => setFailedAvatarUri(avatarUri)}
                        source={avatarSource}
                        style={styles.avatarImage}
                      />
                    ) : (
                      <View style={[styles.avatarFallback, { backgroundColor: theme.secondary }]}>
                        <ThemedText style={[styles.avatarInitials, { color: theme.text }]}>{initials}</ThemedText>
                      </View>
                    )}
                  </View>
                  <View style={styles.heroText}>
                    <ThemedText style={styles.heroGreeting}>Bienvenido</ThemedText>
                    <ThemedText numberOfLines={1} style={styles.heroName}>{displayName}</ThemedText>
                    <ThemedText numberOfLines={1} style={styles.heroEmail}>{user?.email ?? userEmail}</ThemedText>
                  </View>
                  <Pressable
                    accessibilityLabel="Cerrar sesión"
                    accessibilityRole="button"
                    onPress={handleSignOut}
                    style={styles.signOutIconButton}>
                    <ThemedText style={styles.signOutIcon}>{symbolsLoaded ? 'logout' : '↪'}</ThemedText>
                  </Pressable>
                </View>
              </View>

              <View style={styles.navigation}>
                <MenuItem
                  active={pathname === '/' || pathname === '/index'}
                  icon="home"
                  label="Inicio"
                  onPress={() => navigate('/')}
                  symbolsLoaded={symbolsLoaded}
                />
                <MenuItem
                  active={pathname === '/explore'}
                  icon="warehouse"
                  label="Almacén"
                  onPress={() => navigate('/explore')}
                  symbolsLoaded={symbolsLoaded}
                />
                <MenuItem
                  active={pathname === '/products'}
                  icon="shopping_cart"
                  label="Productos"
                  onPress={() => navigate('/products')}
                  symbolsLoaded={symbolsLoaded}
                />
                <MenuItem
                  active={pathname === '/orders'}
                  icon="receipt_long"
                  label="Mis pedidos"
                  onPress={() => navigate('/orders')}
                  symbolsLoaded={symbolsLoaded}
                />
                <MenuItem
                  active={pathname === '/profile'}
                  icon="person"
                  label="Perfil"
                  onPress={() => navigate('/profile')}
                  symbolsLoaded={symbolsLoaded}
                />
              </View>

              <View style={[styles.appSignature, { borderTopColor: theme.backgroundSelected }]}>
                <Image source={require('@/assets/images/icon.png')} style={styles.appLogo} />
                <View>
                  <ThemedText style={styles.appName}>Shopiando</ThemedText>
                  <ThemedText themeColor="textSecondary" style={styles.appVersion}>Versión {appVersion}</ThemedText>
                </View>
              </View>

            </SafeAreaView>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

function MenuItem({ active, icon, label, onPress, symbolsLoaded }: {
  active: boolean;
  icon: string;
  label: string;
  onPress: () => void;
  symbolsLoaded: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.menuItemPressable}>
      <View style={styles.menuItem}>
        <ThemedText style={[styles.menuItemIcon, { color: active ? theme.primary : theme.textSecondary }]}>{symbolsLoaded ? icon : '•'}</ThemedText>
        <ThemedText style={[styles.menuItemText, { color: active ? theme.primary : theme.textSecondary }]}>{label}</ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  modal: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
  },
  panel: {
    height: '100%',
    shadowColor: '#000000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
    elevation: 12,
  },
  safeArea: {
    flex: 1,
  },
  hero: {
    minHeight: 164,
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  heroContent: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.three,
  },
  closeButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    position: 'absolute',
    right: Spacing.two,
    top: Spacing.two,
    width: 44,
  },
  closeText: {
    color: '#FFFFFF',
    fontSize: 26,
    lineHeight: 30,
  },
  avatar: {
    borderRadius: 34,
    borderWidth: 3,
    height: 68,
    overflow: 'hidden',
    width: 68,
  },
  avatarImage: {
    height: '100%',
    width: '100%',
  },
  avatarFallback: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 22,
    fontWeight: '800',
  },
  heroText: {
    flex: 1,
    gap: Spacing.half,
  },
  heroGreeting: {
    color: '#FFFFFF',
    fontSize: 13,
    opacity: 0.84,
  },
  heroName: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '800',
  },
  heroEmail: {
    color: '#FFFFFF',
    fontSize: 12,
    opacity: 0.84,
  },
  navigation: {
    gap: Spacing.two,
    padding: Spacing.three,
  },
  menuItemPressable: {
    borderRadius: Spacing.two,
    overflow: 'hidden',
    width: '100%',
  },
  menuItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    minHeight: 48,
    justifyContent: 'flex-start',
    paddingHorizontal: Spacing.three,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'left',
  },
  menuItemIcon: {
    fontFamily: 'MaterialSymbols',
    fontSize: 20,
    lineHeight: 22,
  },
  appSignature: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.one,
    justifyContent: 'center',
    marginTop: 'auto',
    paddingBottom: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  appLogo: {
    borderRadius: 16,
    height: 56,
    width: 56,
  },
  appName: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'left',
  },
  appVersion: {
    fontSize: 11,
    marginTop: 1,
    textAlign: 'left',
  },
  signOutIconButton: {
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  signOutIcon: {
    color: '#FFFFFF',
    fontFamily: 'MaterialSymbols',
    fontSize: 21,
    lineHeight: 24,
  },
});

import { useEffect, useRef, useState } from 'react';
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
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { getLocalProfile, type LocalProfile } from '@/services/profile-storage';

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
  const [failedAvatarUri, setFailedAvatarUri] = useState<string | null>(null);
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

  const displayName = localProfile?.fullName.trim()
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
                </View>
              </View>

              <View style={styles.navigation}>
                <MenuItem
                  active={pathname === '/' || pathname === '/index'}
                  label="Inicio"
                  onPress={() => navigate('/')}
                />
                <MenuItem
                  active={pathname === '/explore'}
                  label="Explorar"
                  onPress={() => navigate('/explore')}
                />
                <MenuItem
                  active={pathname === '/products'}
                  label="Productos"
                  onPress={() => navigate('/products')}
                />
                <MenuItem
                  active={pathname === '/orders'}
                  label="Mis pedidos"
                  onPress={() => navigate('/orders')}
                />
                <MenuItem
                  active={pathname === '/profile'}
                  label="Perfil"
                  onPress={() => navigate('/profile')}
                />
              </View>

              <View style={[styles.footer, { borderTopColor: theme.backgroundSelected }]}>
                {userEmail && (
                  <ThemedText numberOfLines={1} themeColor="textSecondary" type="small">
                    {userEmail}
                  </ThemedText>
                )}
                <Pressable
                  accessibilityRole="button"
                  onPress={handleSignOut}
                  style={[styles.signOutButton, { backgroundColor: theme.primary }]}>
                  <ThemedText style={styles.signOutText}>Cerrar sesión</ThemedText>
                </Pressable>
              </View>
            </SafeAreaView>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

function MenuItem({ active, label, onPress }: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.menuItemPressable}>
      <ThemedView
        type={active ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.menuItem}>
        <ThemedText style={[styles.menuItemText, active && { color: theme.text }]}>{label}</ThemedText>
      </ThemedView>
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
  },
  menuItem: {
    alignItems: 'flex-start',
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  menuItemText: {
    alignSelf: 'stretch',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'left',
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
    marginTop: 'auto',
    padding: Spacing.three,
  },
  signOutButton: {
    alignItems: 'center',
    borderRadius: Spacing.two,
    minHeight: 48,
    justifyContent: 'center',
  },
  signOutText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

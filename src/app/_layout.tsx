import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Suspense } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider } from '@/contexts/auth-context';
import { ThemeModeProvider, useThemeMode } from '@/contexts/theme-context';
import { DatabaseProvider } from '@/database/database-provider';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  return (
    <ThemeModeProvider>
      <AppContent />
    </ThemeModeProvider>
  );
}

function AppContent() {
  const { colorScheme } = useThemeMode();
  return (
    <GestureHandlerRootView style={styles.root}>
      <Suspense fallback={null}>
        <AuthProvider>
          <DatabaseProvider>
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              <AnimatedSplashOverlay />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="profile" />
                <Stack.Screen name="settings" />
                <Stack.Screen name="suppliers" />
              </Stack>
            </ThemeProvider>
          </DatabaseProvider>
        </AuthProvider>
      </Suspense>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
